import modal
import subprocess
import uuid
from pathlib import Path

# ======================================================
# Modal App
# ======================================================
app = modal.App("video-translate-subtitles")

# ======================================================
# Persistent Volume
# ======================================================
volume = modal.Volume.from_name(
    "translated-videos",
    create_if_missing=True
)

ROOT = Path("/data/videos/jobs")

# ======================================================
# Image (ALL deps inside container)
# ======================================================
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "torch",
        "openai-whisper",
        "fastapi"
    )
)

# ======================================================
# GPU FUNCTION (T4 — Whisper only)
# ======================================================
@app.function(
    image=image,
    gpu="T4",
    timeout=60 * 30,
    volumes={"/data/videos": volume}
)
def process_video(video_bytes, target_lang):
    import whisper  # container-only

    job_id = str(uuid.uuid4())
    job_dir = ROOT / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    input_video = job_dir / "input.mp4"
    audio = job_dir / "audio.wav"
    srt = job_dir / "subs.srt"
    output_video = job_dir / "final.mp4"

    input_video.write_bytes(video_bytes)

    # 1️⃣ Extract audio
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(input_video),
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            str(audio)
        ],
        check=True
    )

    # 2️⃣ Whisper translate
    model = whisper.load_model("medium")
    result = model.transcribe(
        str(audio),
        task="translate",
        language=target_lang
    )

    # 3️⃣ Write SRT
    def ts(t):
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int((t - int(t)) * 1000)
        return f"{h:02}:{m:02}:{s:02},{ms:03}"

    with srt.open("w", encoding="utf-8") as f:
        for i, seg in enumerate(result["segments"], 1):
            f.write(f"{i}\n")
            f.write(f"{ts(seg['start'])} --> {ts(seg['end'])}\n")
            f.write(seg["text"].strip() + "\n\n")

    # 4️⃣ Burn subtitles INTO video
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(input_video),
            "-vf", f"subtitles={srt}",
            "-c:a", "copy",
            str(output_video)
        ],
        check=True
    )

    volume.commit()
    return job_id


# ======================================================
# ASGI HTTP API (CPU)
# ======================================================
@app.function(image=image)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse

    web = FastAPI()

    @web.post("/video-translate")
    async def video_translate(req: Request):
        video_bytes = await req.body()
        target_lang = req.headers.get("x-target-lang", "en")

        job_id = process_video.remote(video_bytes, target_lang)

        return JSONResponse({
            "job_id": job_id,
            "status": "done",
            "output": f"/data/videos/jobs/{job_id}/final.mp4"
        })

    return web

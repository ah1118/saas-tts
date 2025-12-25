import modal
import os
import uuid
import numpy as np
import soundfile as sf
from pathlib import Path

# ======================================================
# Modal App
# ======================================================
app = modal.App("saas-tts-pipeline")

# ======================================================
# Volumes
# ======================================================
vol_models = modal.Volume.from_name("rvc-models")
vol_hf = modal.Volume.from_name("hf-cache", create_if_missing=True)

# ======================================================
# Image (ALL deps live in Modal)
# ======================================================
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("espeak-ng", "libsndfile1", "ffmpeg", "wget", "git")
    .run_commands(
        "python -m pip install 'pip<24'",
        "pip install "
        "'torch<2.6' "
        "'numpy<2' "
        "infer-rvc-python "
        "kokoro "
        "soundfile "
        "spacy "
        "fastapi",
        "python -m spacy download en_core_web_sm",
        "wget -O /root/hubert_base.pt https://huggingface.co/r3gm/sonitranslate_voice_models/resolve/main/hubert_base.pt",
        "wget -O /root/rmvpe.pt https://huggingface.co/r3gm/sonitranslate_voice_models/resolve/main/rmvpe.pt",
    )
    .env({"HF_HOME": "/cache/huggingface"})
)

# ======================================================
# ONE-SHOT GPU FUNCTION (NO WARM CONTAINER)
# ======================================================
@app.function(
    image=image,
    gpu="T4",                    # GPU USED ONLY HERE
    max_containers=1,
    timeout=900,
    scaledown_window=2,          # 🔥 GPU DIES IMMEDIATELY
    volumes={
        "/models": vol_models,
        "/cache": vol_hf,
    },
)
def generate_wav(text: str) -> bytes:
    from kokoro import KPipeline
    from infer_rvc_python import BaseLoader

    print("🚀 GPU START — loading models")

    # --- TTS ---
    tts = KPipeline(lang_code="a")

    chunks = []
    for _, _, audio in tts(text, voice="af_heart", speed=1):
        chunks.append(audio)

    audio = np.concatenate(chunks)
    base_wav = "/tmp/base.wav"
    sf.write(base_wav, audio, 24000)

    # --- RVC ---
    model_path = "/models/myvoice.pth"
    index_path = "/models/myvoice.index"

    if not os.path.exists(model_path):
        raise RuntimeError(f"Missing RVC model: {model_path}")
    if not os.path.exists(index_path):
        raise RuntimeError(f"Missing RVC index: {index_path}")

    rvc = BaseLoader(only_cpu=False)
    rvc.apply_conf(
        tag="custom",
        file_model=model_path,
        file_index=index_path,
        pitch_algo="rmvpe+",
        pitch_lvl=0,
    )

    result = rvc([base_wav], ["custom"], overwrite=True)

    print("✅ GPU DONE — shutting down")

    return Path(result[0]).read_bytes()

# ======================================================
# CPU WEB ENDPOINT (UPLOAD + RESPONSE)
# ======================================================
@app.function(
    image=image,
    gpu=None,
    max_containers=1,
    timeout=300,
    scaledown_window=2,  # <--- This is the exact configuration
)
@modal.web_endpoint(method="POST")
def tts(request: dict):
    from fastapi import Response

    text = (request or {}).get("text", "")
    if not isinstance(text, str) or not text.strip():
        return Response(
            content=b"Missing text",
            status_code=400,
            media_type="text/plain",
        )

    # --- CALL GPU (ONE-SHOT) ---
    wav_bytes = generate_wav.remote(text)

    # --- CPU UPLOAD TO CLOUDFLARE R2 (example) ---
    # env.AUDIO_BUCKET.put(...)  ← uncomment when env is wired
    #
    # filename = f"tts/{uuid.uuid4()}.wav"
    # env.AUDIO_BUCKET.put(
    #     filename,
    #     wav_bytes,
    #     content_type="audio/wav",
    # )

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": "inline; filename=tts.wav"},
    )

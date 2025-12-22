import modal
import numpy as np
import soundfile as sf
from pathlib import Path

# ====================
# Modal App
# ====================
app = modal.App("saas-tts-pipeline")

# ====================
# Volumes
# ====================
vol_models = modal.Volume.from_name("rvc-models")
vol_hf = modal.Volume.from_name("hf-cache", create_if_missing=True)

# ====================
# Image (ALL deps live in Modal)
# ====================
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "espeak-ng",
        "libsndfile1",
        "ffmpeg",
        "wget",
        "git",
    )
    .run_commands(
        "python -m pip install 'pip<24'",
        "pip install "
        "'torch<2.6' "
        "'numpy<2' "
        "infer-rvc-python "
        "kokoro "
        "soundfile "
        "fastapi[standard] "
        "pydantic",
        "python -m spacy download en_core_web_sm",
        "wget -O /root/hubert_base.pt https://huggingface.co/r3gm/sonitranslate_voice_models/resolve/main/hubert_base.pt",
        "wget -O /root/rmvpe.pt https://huggingface.co/r3gm/sonitranslate_voice_models/resolve/main/rmvpe.pt",
    )
    .env({"HF_HOME": "/cache/huggingface"})
)

# ====================
# GPU Audio Pipeline (🔒 SINGLE GPU)
# ====================
@app.cls(
    image=image,
    gpu="T4",
    max_containers=1,
    volumes={
        "/models": vol_models,
        "/cache": vol_hf,
    },
    timeout=900,
    scaledown_window=60,
)
class AudioPipeline:
    @modal.enter()
    def setup(self):
        from kokoro import KPipeline
        from infer_rvc_python import BaseLoader

        print("🚀 Loading models...")

        # Kokoro TTS
        self.tts = KPipeline(lang_code="a")

        # RVC
        self.rvc = BaseLoader(only_cpu=False)
        self.rvc.apply_conf(
            tag="custom",
            file_model="/models/myvoice.pth",
            file_index="/models/myvoice.index",
            pitch_algo="rmvpe+",
            pitch_lvl=0,
        )

        print("✅ Models ready")

    @modal.method()
    def run(self, text: str) -> bytes:
        # --- TTS ---
        chunks = []
        for _, _, audio in self.tts(text, voice="af_heart", speed=1):
            chunks.append(audio)

        if not chunks:
            raise RuntimeError("No TTS output")

        audio = np.concatenate(chunks)

        base_wav = "/tmp/base.wav"
        sf.write(base_wav, audio, 24000)

        # --- RVC ---
        result = self.rvc([base_wav], ["custom"], overwrite=True)
        if not result:
            raise RuntimeError("RVC failed")

        final_path = Path(result[0])

        # ✅ RETURN RAW BYTES (KEY CHANGE)
        return final_path.read_bytes()

# ======================================================
# 🔵 SAAS MODE — HTTP API (RETURNS audio/wav)
# ======================================================
@app.function(
    image=image,
    max_containers=1,
)
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI
    from fastapi.responses import Response
    from pydantic import BaseModel

    web = FastAPI()

    class TTSRequest(BaseModel):
        text: str

    @web.post("/tts")
    def tts_api(req: TTSRequest):
        pipeline = AudioPipeline()

        # 🔑 RAW WAV BYTES FROM GPU
        audio_bytes = pipeline.run.remote(req.text)

        return Response(
            content=audio_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "inline; filename=tts.wav"
            },
        )

    return web

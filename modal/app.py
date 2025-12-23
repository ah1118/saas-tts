import modal
import os
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
        # NOTE: spacy model download requires spacy installed. If kokoro already depends on spacy,
        # this is fine. If it fails, add 'spacy' explicitly.
        "pip install "
        "'torch<2.6' "
        "'numpy<2' "
        "infer-rvc-python "
        "kokoro "
        "soundfile",
        # If this line fails, see note above.
        "python -m spacy download en_core_web_sm",
        "wget -O /root/hubert_base.pt https://huggingface.co/r3gm/sonitranslate_voice_models/resolve/main/hubert_base.pt",
        "wget -O /root/rmvpe.pt https://huggingface.co/r3gm/sonitranslate_voice_models/resolve/main/rmvpe.pt",
    )
    .env({"HF_HOME": "/cache/huggingface"})
)

# ======================================================
# GPU Pipeline Class (warm container)
# ======================================================
@app.cls(
    image=image,
    gpu="T4",
    max_containers=1,              # keep ONE warm GPU container
    volumes={"/models": vol_models, "/cache": vol_hf},
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
        model_path = "/models/myvoice.pth"
        index_path = "/models/myvoice.index"

        if not os.path.exists(model_path):
            raise RuntimeError(f"Missing RVC model: {model_path}")
        if not os.path.exists(index_path):
            raise RuntimeError(f"Missing RVC index: {index_path}")

        self.rvc = BaseLoader(only_cpu=False)
        self.rvc.apply_conf(
            tag="custom",
            file_model=model_path,
            file_index=index_path,
            pitch_algo="rmvpe+",
            pitch_lvl=0,
        )

        print("✅ Models ready")

    @modal.method()
    def synth_wav_bytes(self, text: str) -> bytes:
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
        wav_bytes = final_path.read_bytes()
        return wav_bytes


# ======================================================
# HTTP Endpoint (Direct) - NO FastAPI
# ======================================================
# This gives you an HTTPS endpoint that Cloudflare Worker can call.
@app.function(
    image=image,
    gpu="T4",
    max_containers=1,              # one warm container for the endpoint itself
    volumes={"/models": vol_models, "/cache": vol_hf},
    timeout=900,
    scaledown_window=60,
)
@modal.web_endpoint(method="POST")
def tts(request: dict):
    """
    Request JSON: { "text": "Hello" }
    Response: raw audio/wav bytes
    """
    text = (request or {}).get("text", "")
    if not isinstance(text, str) or not text.strip():
        return modal.Response("Missing 'text'", status_code=400)

    # IMPORTANT:
    # Do NOT call .remote() inside a web handler.
    # Instead, run the pipeline directly in this same container.
    # We instantiate the class and call its method locally.
    pipeline = AudioPipeline()
    wav_bytes = pipeline.synth_wav_bytes.local(text)

    return modal.Response(
        wav_bytes,
        headers={
            "Content-Type": "audio/wav",
            "Content-Disposition": "inline; filename=tts.wav",
        },
    )

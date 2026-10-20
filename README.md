# VoxSentinel V2

Noncommercial voice-clone detection research prototype for SIH PS26104.

FastAPI backend, upload and rolling microphone analysis, Wav2Vec2 V7, WavLM, Spectral CNN and VoxGuard, with an audio-reactive Three.js hologram. Model enablement is configured in `model_settings.py`.

## Snapshot limitations

This is a source backup of the working local application, not a standalone deployment package. Model checkpoints, personal voice recordings, environments and historical backups are deliberately excluded. Existing absolute paths in `app.py` and `voxguard_engine.py` point to the original development machine. Configure those paths and obtain the original model assets before running on another machine.

The original machine uses the existing environment at `/Users/shashankkumar/Documents/Codex/2026-10-03/ex/work/model-test/venv`. FFmpeg must be installed. The original requirements list is retained; the runtime also uses torchaudio, peft and einops. A fresh environment has not been validated.

Run from this folder with the configured Python environment:

```sh
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. GitHub stores the source; it does not run this Python inference backend.

## Model and third-party terms

VoxGuard uses gereon/voxguard-lora with Speech-Arena-2025/DF_Arena_1B_V_1. The base model has noncommercial restrictions; review upstream terms before distributing models or commercial use. Vendored Three.js r128 retains its upstream license notice. No blanket license is granted here over third-party components.

Model scores are not calibrated probabilities or proof of authenticity. Qwen results do not establish performance on other generators or microphone conditions.

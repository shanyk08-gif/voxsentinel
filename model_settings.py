# Edit these switches and restart the backend.
MODEL_ENABLED = {
    "wav2vec2": False,
    "wavlm": True,
    "spectral": True,
    "voxguard": True,
}
ENABLED_MODELS = tuple(name for name, enabled in MODEL_ENABLED.items() if enabled)

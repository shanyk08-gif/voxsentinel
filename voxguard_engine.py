
from pathlib import Path
import io
import subprocess
import sys
import threading
from unittest.mock import patch

import soundfile as sf
import torch
import torchaudio
from transformers import Wav2Vec2Config
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE = Path(__file__).resolve().parent
P = Path("/Users/shashankkumar/Documents/Codex/2026-10-03/ex/work/model-test")
DEVICE = torch.device("cpu")
torch.set_num_threads(4)
models, errors = {}, {}
inference_lock = threading.Lock()




sys.path.insert(0,str(P))
from DF_Arena_1B_V_1.configuration_antispoofing import DF_Arena_1B_Config
from DF_Arena_1B_V_1.modeling_antispoofing import DF_Arena_1B_Antispoofing
from peft import PeftModel
import DF_Arena_1B_V_1.conformer as conformer
config=Wav2Vec2Config.from_json_file(str(P/'wav2vec2-xls-r-1b/config.json'))
# Construct without allocating random 1B weights; checkpoint strictly supplies every tensor.
with torch.device('meta'), patch.object(Wav2Vec2Config,'from_pretrained',return_value=config), patch.object(conformer,'sinusoidal_embedding',side_effect=lambda n,d:torch.empty((1,n,d),device='meta')):
 model=DF_Arena_1B_Antispoofing(DF_Arena_1B_Config.from_json_file(str(P/'DF_Arena_1B_V_1/config.json')))
state=torch.load(P/'DF_Arena_1B_V_1/pytorch_model.bin',map_location='cpu',weights_only=True,mmap=True)
print(model.load_state_dict(state,strict=True,assign=True),flush=True);del state
model=PeftModel.from_pretrained(model,str(P/'voxguard-lora'),is_trainable=False)
print('Adapter loaded',model.peft_config,flush=True)
model.eval()
models["voxguard"] = model

def decode(data, suffix):
    import tempfile
    try:
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / ("input" + suffix)
            source.write_bytes(data)
            decoded = subprocess.run(
                ["ffmpeg", "-v", "error", "-i", str(source), "-ac", "1",
                 "-c:a", "pcm_f32le", "-f", "wav", "pipe:1"],
                capture_output=True, check=True, timeout=60,
            ).stdout
        x, sr = sf.read(io.BytesIO(decoded), dtype="float32")
    except (subprocess.SubprocessError, OSError, RuntimeError, ValueError):
        raise HTTPException(400, "Could not decode audio. Check the file and FFmpeg.")
    if not len(x):
        raise HTTPException(400, "Audio is empty.")
    x = torch.from_numpy(x.copy())
    if not torch.isfinite(x).all():
        raise HTTPException(400, "Audio contains invalid samples.")
    if sr != 16000:
        x = torchaudio.functional.resample(x, sr, 16000)
    # Preserve actual length: each detector selects its own window.
    return x


def pack(real, fake):
    synthetic = fake >= 0.5
    return {
        "verdict": "synthetic" if synthetic else "human",
        "label": "Synthetic indicators detected" if synthetic else "Likely human",
        "indicator": round(max(real, fake)*100, 1),
        "human": real*100,
        "synthetic": fake*100,
    }

def infer(x):
    with inference_lock, torch.inference_mode():
        logits = model(input_values=x)["logits"]
        fake = torch.softmax(logits, dim=-1)[0, 0].item()
    return {"voxguard": pack(1-fake, fake)}


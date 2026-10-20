from model_settings import ENABLED_MODELS
from pathlib import Path
import os, subprocess, tempfile
import numpy as np
import soundfile as sf
import torch
import torch.nn as nn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from transformers import AutoModelForAudioClassification, WavLMModel

BASE = Path(__file__).resolve().parent
PROJECT = Path("/Users/shashankkumar/Desktop/Coding/SIH 2026")
W2V_PATH = Path(os.getenv("VOX_WAV2VEC2", PROJECT/"V7 model"))
WLM_PATH = Path(os.getenv("VOX_WAVLM", PROJECT/"wavlm_generalization.pt"))
SPEC_PATH = Path(os.getenv("VOX_SPECTRAL", PROJECT/"spectral_model.pt"))
DEVICE = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
N = 16000*5
torch.set_num_threads(4)
models, errors = {}, {}

app = FastAPI(title="VoxSentinel")
app.mount("/static", StaticFiles(directory=BASE/"static"), name="static")

class WavLMDetector(nn.Module):
    def __init__(self):
        super().__init__()
        self.wavlm = WavLMModel.from_pretrained("microsoft/wavlm-base-plus")
        self.classifier = nn.Sequential(
            nn.Linear(self.wavlm.config.hidden_size,256),
            nn.ReLU(), nn.Dropout(.3), nn.Linear(256,2))
    def forward(self,x):
        return self.classifier(self.wavlm(x).last_hidden_state.mean(1))

class SpectralCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.features=nn.Sequential(
            nn.Conv2d(1,16,3,padding=1),nn.ReLU(),nn.MaxPool2d(2),
            nn.Conv2d(16,32,3,padding=1),nn.ReLU(),nn.MaxPool2d(2),
            nn.Conv2d(32,64,3,padding=1),nn.ReLU(),nn.MaxPool2d(2),
            nn.Conv2d(64,128,3,padding=1),nn.ReLU(),nn.AdaptiveAvgPool2d(1))
        self.classifier = nn.Sequential(
    nn.Flatten(),
    nn.Dropout(0.3),
    nn.Linear(128, 64),
    nn.ReLU(),
    nn.Dropout(0.2),
    nn.Linear(64, 2)
)
    def forward(self,x):
        return self.classifier(self.features(x))

def sd(x):
    if isinstance(x,dict):
        for k in ("model_state_dict","state_dict","model"):
            if k in x and isinstance(x[k],dict): return x[k]
    return x

def load_models():
    try:
        models["wav2vec2"]=AutoModelForAudioClassification.from_pretrained(
            str(W2V_PATH),local_files_only=True).to(DEVICE).eval()
    except Exception as e: errors["wav2vec2"]=str(e)
    try:
        m=WavLMDetector().to(DEVICE)
        m.load_state_dict(sd(torch.load(WLM_PATH,map_location=DEVICE)))
        models["wavlm"]=m.eval()
    except Exception as e: errors["wavlm"]=str(e)
    try:
        m=SpectralCNN().to(DEVICE)
        m.load_state_dict(sd(torch.load(SPEC_PATH,map_location=DEVICE)))
        models["spectral"]=m.eval()
    except Exception as e: errors["spectral"]=str(e)
load_models()

def prob(logits):
    p=torch.softmax(logits,-1)[0].detach().float().cpu().numpy()
    return float(p[0]),float(p[1])

def pack(real,fake):
    v="synthetic" if fake>=real else "human"
    return {"verdict":v,
            "label":"Synthetic indicators detected" if v=="synthetic" else "Likely human",
            "indicator":round(max(real,fake)*100,1),
            "human":real*100,"synthetic":fake*100}

def legacy_infer(x, enabled):
    t=torch.from_numpy(x)[None].to(DEVICE); r={}
    with torch.no_grad():
        if "wav2vec2" in enabled and "wav2vec2" in models:
            r["wav2vec2"]=pack(*prob(models["wav2vec2"](input_values=t).logits))
        if "wavlm" in enabled and "wavlm" in models:
            r["wavlm"]=pack(*prob(models["wavlm"](t)))
        if "spectral" in enabled and "spectral" in models:
            w=torch.hann_window(400,device=DEVICE)
            s=torch.stft(torch.from_numpy(x).to(DEVICE),n_fft=512,hop_length=160,
                         win_length=400,window=w,return_complex=True).abs()
            s=torch.log1p(s); s=(s-s.mean())/(s.std()+1e-6)
            r["spectral"]=pack(*prob(models["spectral"](s[None,None])))
    return r


import json
import math
import threading
import voxguard_engine as vg

MODEL_KEYS = ("wav2vec2", "wavlm", "spectral", "voxguard")
if not ENABLED_MODELS or set(ENABLED_MODELS) - set(MODEL_KEYS):
    raise RuntimeError("model_settings.py must enable at least one valid model")
models["voxguard"] = vg.model
analysis_lock = threading.Lock()

def thresholds_from_json(value):
    try:
        supplied = json.loads(value)
        if not isinstance(supplied, dict) or set(supplied) - set(MODEL_KEYS):
            raise ValueError()
        result = {}
        for key in MODEL_KEYS:
            number = float(supplied.get(key, 0.5))
            if not math.isfinite(number) or not 0.01 <= number <= 0.99:
                raise ValueError()
            result[key] = number
        return result
    except (ValueError, TypeError, OverflowError):
        raise HTTPException(422, "Thresholds must be numbers from 0.01 to 0.99.")

@app.get("/")
def index():
    return FileResponse(BASE/"static"/"index.html")

@app.get("/api/health")
def health():
    return {"device": str(DEVICE), "voxguard_device": "cpu",
            "models": {k: k in models for k in MODEL_KEYS}, "errors": errors}

@app.post("/api/analyze")
def analyze(file: UploadFile = File(...), thresholds: str = Form("{}"),
            live: bool = Form(False)):
    selected = thresholds_from_json(thresholds)
    enabled = set(ENABLED_MODELS)
    missing = [k for k in enabled if k not in models]
    if missing:
        raise HTTPException(503, "Missing detectors: " + ", ".join(missing) + ". Check /api/health.")
    ext = Path(file.filename or "audio.wav").suffix.lower()
    if ext not in {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".webm"}:
        raise HTTPException(415, "Unsupported audio format.")
    data = file.file.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "Maximum 20 MB.")
    if not analysis_lock.acquire(blocking=False):
        raise HTTPException(429, "Analysis busy; try again shortly.")
    try:
        audio = vg.decode(data, ext)
        # Upload: beginning of file. Live: most recent audio for each model.
        short = audio[-80000:] if live else audio[:80000]
        long = audio[-160000:] if live else audio[:160000]
        short = torch.nn.functional.pad(short, (0, 80000-len(short)))
        long = torch.nn.functional.pad(long, (0, 160000-len(long)))
        results = legacy_infer(short.numpy(), enabled)
        if "voxguard" in enabled:
            results.update(vg.infer(long))
    finally:
        analysis_lock.release()
    for key, item in results.items():
        item["threshold"] = selected[key]
        flag = item["synthetic"] >= selected[key] * 100
        item["verdict"] = "synthetic" if flag else "human"
        item["label"] = "Above threshold" if flag else "Below threshold"
        item["indicator"] = item["synthetic"]
    triggered = [k for k, item in results.items() if item["verdict"] == "synthetic"]
    score = max(item["synthetic"] for item in results.values())
    overall = {
        "verdict": "synthetic" if triggered else "human",
        "label": "Potential AI / cloned voice" if triggered else "No detector crossed its threshold",
        "indicator": score, "synthetic": score, "human": 100-score,
        "agreement": {"agree": len(triggered), "total": len(results)},
        "triggered": triggered,
    }
    return {"models": results, "overall": overall, "fusion": "any",
            "thresholds": selected, "live": live}

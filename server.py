"""실시간 연구 API + 정적 웹 서빙.  실행: uvicorn server:app --host 0.0.0.0 --port 8000"""
from __future__ import annotations

import pathlib
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from engine import agent, backtest, data, model
from engine import research as R

app = FastAPI(title="나만의 AI를 키움")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_lock = threading.Lock()   # 동시 학습 1건으로 제한


class SpecIn(BaseModel):
    spec: dict


class ParseIn(BaseModel):
    text: str
    current: dict | None = None


class OptimizeIn(BaseModel):
    spec: dict
    request: str


@app.get("/api/health")
def health():
    return {"ok": True, "mode": "live", "engine": R.ENGINE_VERSION, "agent": agent.available(), "data": data.manifest()}


@app.get("/api/catalog")
def catalog():
    return {"feature_groups": {g: {"label": data.GROUP_LABELS[g], "features": [
        {"id": f, "label": data.FEATURE_LABELS[f]} for f in fs]} for g, fs in data.FEATURE_GROUPS.items()},
        "unavailable": data.UNAVAILABLE_GROUPS, "horizons": list(data.HORIZONS),
        "algorithms": model.ALGORITHMS, "cost_models": backtest.COST_MODELS,
        "improvements": {k: {"label": v["label"], "plan": v["plan"], "candidates": v["candidates"]}
                         for k, v in R.IMPROVEMENTS.items()},
        "objective_presets": R.PRESET_WEIGHTS, "objective_scale": R.SCALE,
        "periods": {"development": [model.DEV_START, model.DEV_END], "locked_final": [model.FINAL_START, model.FINAL_END]}}


@app.post("/api/research/validate")
def validate(body: SpecIn):
    try:
        s = R.normalize(body.spec)
        return {"ok": True, "spec": s, "run_id": R.run_id(s), "model_id": model.model_id(s["model_spec"])}
    except ValueError as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/research/parse")
def parse(body: ParseIn):
    if not agent.available():
        raise HTTPException(501, "Claude API 키가 설정되지 않아 규칙 기반 해석을 사용합니다.")
    try:
        return agent.parse(body.text, body.current)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"에이전트 호출 실패: {e}")


@app.post("/api/runs")
def runs(body: SpecIn):
    try:
        with _lock:
            return R.execute(body.spec)
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/optimize")
def optimize(body: OptimizeIn):
    if body.request not in R.IMPROVEMENTS:
        raise HTTPException(422, "지원하지 않는 개선 요청")
    with _lock:
        return R.optimize(body.spec, body.request)


app.mount("/", StaticFiles(directory=pathlib.Path(__file__).parent / "web", html=True), name="web")

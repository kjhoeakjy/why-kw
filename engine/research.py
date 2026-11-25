"""ResearchSpec → 실제 학습·검증 실행, 후보 비교, 결과 저장."""
from __future__ import annotations

import hashlib
import json
import pathlib
import time

import pandas as pd

from . import backtest as bt
from . import data, model

ROOT = pathlib.Path(__file__).resolve().parents[1]
PRED_CACHE = ROOT / "data" / "cache" / "pred"
RUNS = ROOT / "artifacts" / "runs"
ENGINE_VERSION = "poc-1.0"

# 목적함수 정규화 기준(사전에 고정. 평가 구간 관측값으로 다시 정하지 않는다)
SCALE = {"cagr": 0.20, "mdd": 0.30, "trades_per_year": 200.0}
PRESET_WEIGHTS = {
    "balanced": {"net_return": 0.5, "drawdown": 0.35, "turnover": 0.15},
    "return": {"net_return": 0.8, "drawdown": 0.15, "turnover": 0.05},
    "low_risk": {"net_return": 0.3, "drawdown": 0.6, "turnover": 0.1},
    "low_trading": {"net_return": 0.35, "drawdown": 0.25, "turnover": 0.4},
}

_state: dict = {}


def panel() -> pd.DataFrame:
    if "panel" not in _state:
        _state["panel"] = data.build_panel()
    return _state["panel"]


def frames() -> bt.Frames:
    if "frames" not in _state:
        _state["frames"] = bt.Frames(panel())
    return _state["frames"]


def normalize(spec: dict) -> dict:
    ms = model.model_spec_normalize(spec.get("model_spec") or {})
    sp, pp = bt.policy_normalize(spec.get("strategy_policy"), spec.get("portfolio_policy"), ms["target"]["horizon_days"])
    obj = spec.get("objective") or {}
    w = obj.get("weights") or PRESET_WEIGHTS.get(obj.get("preset", "balanced"), PRESET_WEIGHTS["balanced"])
    tot = sum(max(0.0, float(w.get(k, 0))) for k in ("net_return", "drawdown", "turnover")) or 1.0
    w = {k: round(max(0.0, float(w.get(k, 0))) / tot, 4) for k in ("net_return", "drawdown", "turnover")}
    return {"mode": spec.get("mode", "MY_AI"), "profile": spec.get("profile") or {},
            "model_spec": ms, "strategy_policy": sp, "portfolio_policy": pp, "objective": {"weights": w},
            "validation": {"method": "walk_forward_yearly", "train_years": model.TRAIN_YEARS,
                           "purge_overlapping_labels": True, "development": [model.DEV_START, model.DEV_END],
                           "locked_final": [model.FINAL_START, model.FINAL_END]}}


def policy_id(spec: dict) -> str:
    return "p_" + hashlib.sha256(model.canonical([spec["strategy_policy"], spec["portfolio_policy"]]).encode()).hexdigest()[:10]


def run_id(spec: dict) -> str:
    key = [spec["model_spec"], spec["strategy_policy"], spec["portfolio_policy"], spec["objective"], ENGINE_VERSION]
    return "r_" + hashlib.sha256(model.canonical(key).encode()).hexdigest()[:12]


def get_model(ms: dict, log) -> tuple[pd.DataFrame, dict, str]:
    """동일 학습 명세면 계산된 모델을 재사용한다(재사용 여부를 반환)."""
    PRED_CACHE.mkdir(parents=True, exist_ok=True)
    mid = model.model_id(ms)
    f, g = PRED_CACHE / f"{mid}.parquet", PRED_CACHE / f"{mid}.json"
    if f.exists() and g.exists():
        log(f"[모델 재사용] 동일 학습 명세의 모델 {mid} 을 다시 학습하지 않고 사용")
        return pd.read_parquet(f), json.loads(g.read_text()), "reused"
    log(f"[신규 학습] 모델 {mid} · {ms['algorithm']} · 데이터 {ms['feature_groups']} · {ms['target']['horizon_days']}거래일")
    out = model.train_walk_forward(ms, panel(), log)
    out["pred"].to_parquet(f, index=False)
    g.write_text(json.dumps(out["info"], ensure_ascii=False))
    return out["pred"], out["info"], "trained"


def objective_value(dev: dict, w: dict) -> dict:
    r, d, t = dev["cagr"] / SCALE["cagr"], abs(dev["mdd"]) / SCALE["mdd"], dev["trades_per_year"] / SCALE["trades_per_year"]
    j = w["net_return"] * r - w["drawdown"] * d - w["turnover"] * t
    return {"J": round(j, 4), "terms": {"net_return": round(r, 3), "drawdown": round(d, 3), "turnover": round(t, 3)},
            "scale": SCALE, "formula": "J = a·(연환산 순수익률/20%) − b·(|최대낙폭|/30%) − c·(연간 거래 횟수/200), 개발 검증 구간 기준"}


def _series(eq: pd.Series, step: int = 5) -> list:
    s = eq.iloc[::step]
    if s.index[-1] != eq.index[-1]:
        s = pd.concat([s, eq.iloc[[-1]]])
    return [round(float(v)) for v in s.values], [str(d.date()) for d in s.index]


def execute(spec_in: dict, log=None, save: bool = True) -> dict:
    logs: list[str] = []

    def _log(m):
        logs.append(m)
        if log:
            log(m)

    t0 = time.time()
    spec = normalize(spec_in)
    rid = run_id(spec)
    _log(f"[명세 확정] 실행 {rid} · 데이터 스냅샷 {spec['model_spec']['data_snapshot_id']}")
    pred, minfo, how = get_model(spec["model_spec"], _log)
    res = bt.run(pred, spec["strategy_policy"], spec["portfolio_policy"], frames(), _log)
    eq = res["equity"]
    dev = bt.seg_metrics(eq, model.DEV_START, model.DEV_END, res["ledger"])
    fin = bt.seg_metrics(eq, model.FINAL_START, model.FINAL_END, res["ledger"])
    full = bt.seg_metrics(eq, model.DEV_START, model.FINAL_END, res["ledger"])
    bench = {}
    for key, s, label in (("market", res["bm_market"], "코스피 시가총액 가중(지수 대용, 비용·배당 미반영)"),
                          ("universe", res["bm_universe"], "유니버스 300종목 동일가중(비용 미반영)")):
        bench[key] = {"label": label, "dev": bt.seg_metrics(s, model.DEV_START, model.DEV_END, []),
                      "final": bt.seg_metrics(s, model.FINAL_START, model.FINAL_END, [])}
    vals, dts = _series(eq)
    ledger = res["ledger"]
    out = {
        "run_id": rid, "model_id": minfo["model_id"], "policy_id": policy_id(spec), "engine_version": ENGINE_VERSION,
        "spec": spec, "model_status": how,
        "model": minfo, "data": data.manifest(),
        "metrics": {"development": dev, "locked_final": fin, "full": full},
        "objective": objective_value(dev, spec["objective"]["weights"]),
        "benchmarks": bench,
        "trailing": {"as_of": str(eq.index[-1].date()), "strategy": bt.trailing(eq),
                     "market": bt.trailing(res["bm_market"])},
        "rolling_6m": bt.rolling_windows(eq, 6), "rolling_12m": bt.rolling_windows(eq, 12),
        "series": {"dates": dts, "strategy": vals, "market": _series(res["bm_market"])[0],
                   "universe": _series(res["bm_universe"])[0]},
        "ledger_summary": {"n_trades": res["n_trades"], "win_rate": res["win_rate"], "skipped": res["skipped"],
                           "cost_and_slippage_krw": round(res["fees_paid"]), "cost_assumption": res["cost_label"],
                           "n_ledger_rows": len(ledger)},
        "ledger_head": ledger[:12], "ledger_tail": ledger[-24:],
        "open_positions_at_end": res["open_positions"],
        "disclosures": [
            f"과거 데이터({data.SNAPSHOT_START}~{data.SNAPSHOT_END}) 기반 가상 연구 결과이며 미래 수익을 보장하지 않습니다.",
            "현재 시점의 종목 추천이나 매매 권유가 아닙니다. 실제 계좌·실주문은 연결되어 있지 않습니다.",
            "현금배당 미반영, 일봉 시가 체결 가정(호가·체결량 미반영), 비용은 고정 가정입니다.",
            "잠금 평가 구간은 후보 선택에 사용하지 않았습니다. 이 결과를 보고 다시 최적화하면 독립 평가가 아닙니다.",
        ],
        "logs": logs, "elapsed_seconds": round(time.time() - t0, 2),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    if save:
        RUNS.mkdir(parents=True, exist_ok=True)
        (RUNS / f"{rid}.json").write_text(json.dumps(out, ensure_ascii=False))
    return out


# ---------------------------------------------------------------- 개선(OPTIMIZE)
IMPROVEMENTS = {
    "reduce_loss": {
        "label": "큰 손실 줄이기",
        "plan": "① 변동성·위험 정보를 추가해 모델을 다시 학습 ② 기존 모델은 그대로 두고 변동성 상위 30% 종목 제외 ③ 시장이 60일 평균 아래일 때 신규 매수 중단",
        "candidates": [
            {"tag": "M", "change": "변동성·위험 변수 추가", "kind": "model", "patch": {"model_spec": {"add_groups": ["risk"]}}},
            {"tag": "P", "change": "변동성 상위 30% 종목 제외", "kind": "strategy", "patch": {"strategy_policy": {"volatility_filter": 0.3}}},
            {"tag": "P", "change": "하락장 신규 매수 중단", "kind": "strategy", "patch": {"strategy_policy": {"market_filter": True}}},
        ]},
    "less_trading": {
        "label": "거래 횟수 줄이기",
        "plan": "① 기존 모델 유지 + 상위권에 머무는 종목은 계속 보유 ② 예측·보유 기간을 20거래일로 늘려 모델을 다시 학습",
        "candidates": [
            {"tag": "P", "change": "상위 3배수 안이면 계속 보유", "kind": "strategy", "patch": {"strategy_policy": {"keep_buffer": 3.0}}},
            {"tag": "M", "change": "예측·보유 기간 20거래일", "kind": "model", "patch": {"model_spec": {"horizon_days": 20}}},
        ]},
    "more_data": {
        "label": "다른 정보 반영하기",
        "plan": "① 기업 규모(시가총액) 정보 추가 ② 변동성·위험 정보 추가 — 각각 새 모델로 학습해 비교",
        "candidates": [
            {"tag": "M", "change": "기업 규모 변수 추가", "kind": "model", "patch": {"model_spec": {"add_groups": ["size"]}}},
            {"tag": "M", "change": "변동성·위험 변수 추가", "kind": "model", "patch": {"model_spec": {"add_groups": ["risk"]}}},
        ]},
    "algorithm": {
        "label": "모델 알고리즘 비교",
        "plan": "같은 데이터·Target 으로 Ridge 와 LightGBM 을 각각 학습해 비교",
        "candidates": [
            {"tag": "M", "change": "LightGBM 으로 학습", "kind": "model", "patch": {"model_spec": {"algorithm": "lightgbm"}}},
            {"tag": "M", "change": "Ridge 로 학습", "kind": "model", "patch": {"model_spec": {"algorithm": "ridge"}}},
        ]},
}


def apply_patch(spec: dict, patch: dict) -> dict:
    s = json.loads(json.dumps(spec))
    for part, ch in patch.items():
        tgt = s.setdefault(part, {})
        for k, v in ch.items():
            if k == "add_groups":
                tgt["feature_groups"] = sorted(set(tgt.get("feature_groups", [])) | set(v))
            elif k == "remove_groups":
                tgt["feature_groups"] = sorted(set(tgt.get("feature_groups", [])) - set(v))
            elif k == "horizon_days":
                tgt["target"] = {"horizon_days": v}
                s.setdefault("strategy_policy", {})["holding_days"] = v
            else:
                tgt[k] = v
    return s


def optimize(base_spec: dict, request: str, log=None, custom: list | None = None) -> dict:
    """개선 요청을 명세 차이로 바꾸고 후보를 실제 실행해 개발 구간에서 비교한다."""
    base = execute(base_spec, log)
    imp = IMPROVEMENTS.get(request) or {"label": "사용자 정의 실험", "plan": "", "candidates": []}
    cands = custom if custom is not None else imp["candidates"]
    rows, seen = [], {base["run_id"]}

    def row(r, change, kind, version):
        d, f = r["metrics"]["development"], r["metrics"]["locked_final"]
        return {"version": version, "run_id": r["run_id"], "model_id": r["model_id"], "policy_id": r["policy_id"],
                "change": change, "kind": kind, "retrained": r["model_id"] != base["model_id"],
                "model_status": r["model_status"], "dev": d, "final": f, "J": r["objective"]["J"],
                "rank_ic_dev": r["model"]["ic"]["dev"]["rank_ic_mean"]}

    rows.append(row(base, "기존", "base", "V1"))
    for i, c in enumerate(cands):
        spec = apply_patch(base["spec"], c["patch"])
        try:
            r = execute(spec, log)
        except ValueError as e:
            rows.append({"version": f"V{i + 2}", "change": c["change"], "kind": c["kind"], "error": str(e)})
            continue
        if r["run_id"] in seen:
            rows.append({"version": f"V{i + 2}", "change": c["change"], "kind": c["kind"],
                         "error": "기존 명세와 동일하여 새 후보가 아닙니다(이미 반영된 설정)."})
            continue
        seen.add(r["run_id"])
        rows.append(row(r, c["change"], c["kind"], f"V{i + 2}"))
    ok = [r for r in rows if "J" in r]
    best = max(ok, key=lambda r: r["J"])
    b = rows[0]
    notes = []
    for r in ok[1:]:
        better, worse = [], []
        for key, name, sign in (("cagr", "연환산 순수익률", 1), ("mdd", "최대 낙폭", 1), ("trades_per_year", "거래 횟수", -1)):
            diff = (r["dev"][key] - b["dev"][key]) * sign
            (better if diff > 1e-9 else worse if diff < -1e-9 else []).append(name)
        notes.append({"version": r["version"], "better": better, "worse": worse})
    return {"request": request, "label": imp["label"], "plan": imp["plan"], "base_run_id": base["run_id"],
            "candidates": rows, "selected_on_development": best["version"], "tradeoffs": notes,
            "weights": base["spec"]["objective"]["weights"],
            "selection_rule": "개발 검증 구간의 목적함수 J 가 가장 높은 후보를 표시합니다. 잠금 평가 구간 수치는 선택에 쓰지 않고 선택 후 확인용으로만 보여줍니다.",
            "note": "개선 후보가 기존보다 좋다는 보장은 없습니다. 나빠진 결과도 그대로 기록합니다."}

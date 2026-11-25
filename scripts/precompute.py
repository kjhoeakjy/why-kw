"""지원하는 모든 명세 조합을 같은 엔진으로 실제 학습·검증해 web/data 에 저장한다.

정적 호스팅(QR)에서는 이 결과를 '사전 계산'으로 표시하고, 서버 모드에서는 요청 시 실시간으로 다시 계산한다.
"""
import itertools
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine import backtest, data, model  # noqa: E402
from engine import research as R  # noqa: E402

OUT = R.ROOT / "web" / "data"
FEATURE_SETS = {"p": ["price"], "pv": ["price", "volume"], "pvr": ["price", "volume", "risk"],
                "pvs": ["price", "volume", "size"], "pvrs": ["price", "volume", "risk", "size"]}
GRID = {"k": [5, 10], "buf": [1.0, 3.0], "vf": [0.0, 0.3], "mf": [False, True], "cash": [1_000_000, 10_000_000]}


def slim(r: dict) -> dict:
    s = r["series"]
    step = 2
    keep = list(range(0, len(s["dates"]), step))
    if keep[-1] != len(s["dates"]) - 1:
        keep.append(len(s["dates"]) - 1)
    r = dict(r)
    r["series"] = {k: [v[i] for i in keep] for k, v in s.items()}
    r["ledger_head"], r["ledger_tail"] = r["ledger_head"][:6], r["ledger_tail"][-14:]
    r.pop("model"), r.pop("data"), r.pop("disclosures")
    r["logs"] = [l for l in r["logs"] if not l.startswith("[학습]")]
    r["objective_by_preset"] = {k: R.objective_value(r["metrics"]["development"], w)["J"] for k, w in R.PRESET_WEIGHTS.items()}
    return r


def main():
    (OUT / "runs").mkdir(parents=True, exist_ok=True)
    (OUT / "models").mkdir(parents=True, exist_ok=True)
    t0, n, index = time.time(), 0, {"models": {}, "runs": 0}
    for (fk, fg), h, algo in itertools.product(FEATURE_SETS.items(), data.HORIZONS, model.ALGORITHMS):
        mkey = f"{fk}-{h}-{algo}"
        for k, buf, vf, mf, cash in itertools.product(*GRID.values()):
            spec = {"model_spec": {"feature_groups": fg, "algorithm": algo, "target": {"horizon_days": h}},
                    "strategy_policy": {"top_k": k, "holding_days": h, "keep_buffer": buf, "volatility_filter": vf,
                                        "market_filter": mf},
                    "portfolio_policy": {"initial_cash_krw": cash}}
            r = R.execute(spec, save=False)
            pkey = f"k{k}-b{int(buf)}-v{int(vf * 10)}-m{int(mf)}-c{cash // 1_000_000}"
            if mkey not in index["models"]:
                info = dict(r["model"])
                info["spec"] = r["spec"]["model_spec"]
                info["training_log"] = [l for l in r["logs"] if l.startswith("[학습") or l.startswith("[신규")]
                (OUT / "models" / f"{mkey}.json").write_text(json.dumps(info, ensure_ascii=False))
                index["models"][mkey] = r["model_id"]
            (OUT / "runs" / f"{mkey}__{pkey}.json").write_text(json.dumps(slim(r), ensure_ascii=False))
            n += 1
        print(f"{mkey}: {n} runs, {time.time() - t0:.0f}s", flush=True)
    index["runs"] = n
    catalog = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M"), "engine_version": R.ENGINE_VERSION, "index": index,
        "data": data.manifest(),
        "feature_groups": {g: {"label": data.GROUP_LABELS[g], "features": [
            {"id": f, "label": data.FEATURE_LABELS[f]} for f in fs]} for g, fs in data.FEATURE_GROUPS.items()},
        "unavailable": data.UNAVAILABLE_GROUPS, "feature_sets": FEATURE_SETS, "grid": GRID,
        "horizons": list(data.HORIZONS), "algorithms": model.ALGORITHMS, "cost_models": backtest.COST_MODELS,
        "improvements": {k: {"label": v["label"], "plan": v["plan"], "candidates": v["candidates"]}
                         for k, v in R.IMPROVEMENTS.items()},
        "objective_presets": R.PRESET_WEIGHTS, "objective_scale": R.SCALE,
        "periods": {"development": [model.DEV_START, model.DEV_END], "locked_final": [model.FINAL_START, model.FINAL_END]},
        "disclosures": [
            f"과거 데이터({data.SNAPSHOT_START}~{data.SNAPSHOT_END}) 기반 가상 연구 결과이며 미래 수익을 보장하지 않습니다.",
            "현재 시점의 종목 추천이나 매매 권유가 아닙니다. 실제 계좌·실주문은 연결되어 있지 않습니다.",
            "현금배당 미반영, 일봉 시가 체결 가정(호가·체결량 미반영), 비용은 고정 가정입니다.",
            "잠금 평가 구간은 후보 선택에 사용하지 않았습니다. 이 결과를 보고 다시 최적화하면 독립 평가가 아닙니다.",
        ],
    }
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False))
    print("done", n, f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()

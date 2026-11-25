"""사전 계산 조합 중 투자금 100만 원 기준에 대해 비용 가정별(비용 없음, 슬리피지 3배) 검증 구간 성과를 계산해 web/data/cost.json 에 저장한다."""
import itertools
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine import data, model  # noqa: E402
from engine import research as R  # noqa: E402
from scripts.precompute import FEATURE_SETS, GRID, OUT  # noqa: E402


def main(limit=None):
    out, t0, n = {}, time.time(), 0
    for (fk, fg), h, algo in itertools.product(FEATURE_SETS.items(), data.HORIZONS, model.ALGORITHMS):
        for k, buf, vf, mf, cash in itertools.product(GRID["k"], GRID["buf"], GRID["vf"], GRID["mf"], [1_000_000]):
            key = f"{fk}-{h}-{algo}__k{k}-b{int(buf)}-v{int(vf * 10)}-m{int(mf)}-c{cash // 1_000_000}"
            row = {}
            for cm in ("zero_cost", "high_slippage"):
                spec = {"model_spec": {"feature_groups": fg, "algorithm": algo, "target": {"horizon_days": h}},
                        "strategy_policy": {"top_k": k, "holding_days": h, "keep_buffer": buf, "volatility_filter": vf,
                                            "market_filter": mf, "cost_model_id": cm},
                        "portfolio_policy": {"initial_cash_krw": cash}}
                d = R.execute(spec, save=False)["metrics"]["development"]
                row[cm] = [round(d["cagr"], 4), round(d["mdd"], 4), round(d["end_value"])]
            out[key] = row
            n += 1
            if limit and n >= limit:
                print(f"{n} in {time.time() - t0:.0f}s", row); return
        print(f"{n} {time.time() - t0:.0f}s", flush=True)
    (OUT / "cost.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)

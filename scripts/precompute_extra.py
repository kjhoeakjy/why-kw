"""추가 정보 조합(가격+위험, 가격+규모, 가격+위험+규모)의 사전 계산. 결과는 web/data 에 추가하고 catalog.json 은 색인만 갱신한다."""
import itertools
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine import data, model  # noqa: E402
from engine import research as R  # noqa: E402
from scripts.precompute import GRID, OUT, slim  # noqa: E402

EXTRA = {"pr": ["price", "risk"], "ps": ["price", "size"], "prs": ["price", "risk", "size"]}


def run(fk):
    fg, t0, out = EXTRA[fk], time.time(), {}
    for h, algo in itertools.product(data.HORIZONS, model.ALGORITHMS):
        mkey = f"{fk}-{h}-{algo}"
        for k, buf, vf, mf, cash in itertools.product(*GRID.values()):
            spec = {"model_spec": {"feature_groups": fg, "algorithm": algo, "target": {"horizon_days": h}},
                    "strategy_policy": {"top_k": k, "holding_days": h, "keep_buffer": buf, "volatility_filter": vf, "market_filter": mf},
                    "portfolio_policy": {"initial_cash_krw": cash}}
            r = R.execute(spec, save=False)
            pkey = f"k{k}-b{int(buf)}-v{int(vf * 10)}-m{int(mf)}-c{cash // 1_000_000}"
            if mkey not in out:
                info = dict(r["model"])
                info["spec"] = r["spec"]["model_spec"]
                info["training_log"] = [l for l in r["logs"] if l.startswith("[학습") or l.startswith("[신규")]
                (OUT / "models" / f"{mkey}.json").write_text(json.dumps(info, ensure_ascii=False))
                out[mkey] = r["model_id"]
            (OUT / "runs" / f"{mkey}__{pkey}.json").write_text(json.dumps(slim(r), ensure_ascii=False))
        print(f"{mkey}: {time.time() - t0:.0f}s", flush=True)
    (OUT / f"_extra_{fk}.json").write_text(json.dumps(out))


def merge():
    p = OUT / "catalog.json"
    c = json.loads(p.read_text())
    for fk, fg in EXTRA.items():
        f = OUT / f"_extra_{fk}.json"
        c["index"]["models"].update(json.loads(f.read_text()))
        c["feature_sets"][fk] = fg
        f.unlink()
    c["index"]["runs"] = len(list((OUT / "runs").glob("*.json")))
    p.write_text(json.dumps(c, ensure_ascii=False))
    print("merged", c["index"]["runs"], len(c["index"]["models"]))


if __name__ == "__main__":
    merge() if sys.argv[1] == "merge" else run(sys.argv[1])

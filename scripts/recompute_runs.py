"""색인에 있는 모든 조합의 가상 운용을 재실행하여 web/data/runs 를 갱신한다(학습된 예측값 재사용). 인자: 분할 번호, 분할 수."""
import itertools
import json
import sys
import time
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine import research as R  # noqa: E402
from scripts.precompute import GRID, OUT, slim  # noqa: E402


def main(part, parts):
    cat = json.loads((OUT / "catalog.json").read_text())
    keys = sorted(cat["index"]["models"])
    t0, n = time.time(), 0
    for i, mkey in enumerate(keys):
        if i % parts != part:
            continue
        fk, h, algo = mkey.split("-")
        fg = cat["feature_sets"][fk]
        for k, buf, vf, mf, cash in itertools.product(*GRID.values()):
            spec = {"model_spec": {"feature_groups": fg, "algorithm": algo, "target": {"horizon_days": int(h)}},
                    "strategy_policy": {"top_k": k, "holding_days": int(h), "keep_buffer": buf, "volatility_filter": vf, "market_filter": mf},
                    "portfolio_policy": {"initial_cash_krw": cash}}
            r = R.execute(spec, save=False)
            pkey = f"k{k}-b{int(buf)}-v{int(vf * 10)}-m{int(mf)}-c{cash // 1_000_000}"
            (OUT / "runs" / f"{mkey}__{pkey}.json").write_text(json.dumps(slim(r), ensure_ascii=False))
            n += 1
        print(f"{mkey}: {n} {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]), int(sys.argv[2]))

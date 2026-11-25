"""고객 분포 가정별 주문 쏠림 실험과 단순 전략 기준선. 결과: docs/crowding.json
가정: 고객 1인당 2019년 초 1,000만 원, 설정 512건(모델 32 × 운용 16). 참여율 = 동일 종목·동일 일자 순주문 금액 합계 / 20일 평균 거래대금."""
import itertools
import json
import pathlib
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine import backtest as bt, model  # noqa: E402
from engine import research as R  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
CAT = json.loads((ROOT / "web/data/catalog.json").read_text())
CASH = 10_000_000


def main():
    panel, fr = R.panel(), R.frames()
    adv = panel.pivot(index="Date", columns="Code", values="amt20")
    rows, cagr = [], {}
    for mkey in sorted(CAT["index"]["models"]):
        fk, h, algo = mkey.split("-")
        ms = R.normalize({"model_spec": {"feature_groups": CAT["feature_sets"][fk], "algorithm": algo, "target": {"horizon_days": int(h)}}})["model_spec"]
        pred, _, _ = R.get_model(ms, lambda m: None)
        for k, buf, vf, mf in itertools.product([5, 10], [1.0, 3.0], [0.0, 0.3], [False, True]):
            sp, pp = bt.policy_normalize({"top_k": k, "holding_days": int(h), "keep_buffer": buf, "volatility_filter": vf, "market_filter": mf}, {"initial_cash_krw": CASH}, int(h))
            res = bt.run(pred, sp, pp, fr)
            key = f"{mkey}__k{k}-b{int(buf)}-v{int(vf * 10)}-m{int(mf)}"
            cagr[key] = bt.seg_metrics(res["equity"], model.DEV_START, model.DEV_END, res["ledger"])["cagr"]
            for l in res["ledger"]:
                if l["side"] in ("매수", "매도"):
                    rows.append((key, l["date"], l["code"], l["amount"] if l["side"] == "매수" else -l["amount"]))
        print(mkey, len(rows), flush=True)
    df = pd.DataFrame(rows, columns=["cfg", "date", "code", "amt"])
    df["date"] = pd.to_datetime(df["date"])
    df = df[df.date <= model.DEV_END]
    keys = sorted(cagr)
    base = "pv-5-ridge__k5-b1-v0-m0"
    top = sorted(keys, key=lambda x: -cagr[x])[:10]
    N = 10_000
    def w_uniform(): return {k: N / len(keys) for k in keys}
    def w_conc(group, share=0.8):
        w = {k: N * (1 - share) / len(keys) for k in keys}
        for g in group: w[g] += N * share / len(group)
        return w
    scen = {"uniform": w_uniform(), "default80": w_conc([base]), "top10_80": w_conc(top)}
    mret = fr.mkt_ret.loc[(fr.mkt_ret.index >= model.DEV_START) & (fr.mkt_ret.index <= model.DEV_END)]
    bad = set(mret[mret <= mret.quantile(0.05)].index)
    out = {"assumption": {"customers": N, "cash_per_customer": CASH, "period": [model.DEV_START, model.DEV_END], "configs": len(keys)}, "scenarios": {}}
    for name, w in scen.items():
        d = df.assign(f=df.amt * df.cfg.map(w)).groupby(["date", "code"]).f.sum().reset_index()
        d["adv"] = [adv.at[a, b] if (a in adv.index and b in adv.columns) else np.nan for a, b in zip(d.date, d.code)]
        d = d[d.adv > 0]
        d["part"] = d.f.abs() / d.adv
        dm = d.groupby("date").part.max()
        sell = d[d.f < 0]
        sb = sell[sell.date.isin(bad)].groupby("date").part.max()
        worst = d.loc[d.part.idxmax()]
        out["scenarios"][name] = {"daily_max_median": float(dm.median()), "daily_max_p95": float(dm.quantile(0.95)), "daily_max_max": float(dm.max()),
                                  "days_over_10pct_share": float((dm > 0.10).mean()), "n_days": int(len(dm)),
                                  "sell_bad_days_max": float(sb.max()) if len(sb) else None,
                                  "worst": {"date": str(worst.date.date()), "name": fr.names.get(worst.code, worst.code), "flow_krw": float(worst.f), "adv_krw": float(worst.adv)}}
        print(name, out["scenarios"][name], flush=True)
    out["top10"] = [(k, round(cagr[k], 4)) for k in top]
    # 단순 전략 기준선(100만 원, 5종목, 정기 교체)
    u = panel[panel.in_universe & (panel.Date >= "2018-06-01")]
    bl = {}
    for nm, col, sign in (("momentum_60d", "mom_60", 1), ("low_vol_60d", "vol_60", -1)):
        pred = pd.DataFrame({"Date": u.Date, "Code": u.Code, "score": sign * u[col]}).dropna()
        for h in (5, 20):
            sp, pp = bt.policy_normalize({"top_k": 5, "holding_days": h}, {"initial_cash_krw": 1_000_000}, h)
            res = bt.run(pred, sp, pp, fr)
            m = bt.seg_metrics(res["equity"], model.DEV_START, model.DEV_END, res["ledger"])
            bl[f"{nm}_h{h}"] = {"cagr": m["cagr"], "mdd": m["mdd"], "trades_per_year": m["trades_per_year"]}
    mk = bt.seg_metrics(res["bm_market"], model.DEV_START, model.DEV_END, [])
    un = bt.seg_metrics(res["bm_universe"], model.DEV_START, model.DEV_END, [])
    bl["market_proxy"] = {"cagr": mk["cagr"], "mdd": mk["mdd"]}; bl["universe_equal"] = {"cagr": un["cagr"], "mdd": un["mdd"]}
    out["baselines"] = bl
    print(bl, flush=True)
    (ROOT / "docs/crowding.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

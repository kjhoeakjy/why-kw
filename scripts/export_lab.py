"""브라우저 내 학습·검증용 자료 내보내기. 결과: web/data/lab/
- 선형 모델은 연도별 충분통계량(X'X, X'y)으로 내보내 브라우저에서 임의의 변수 조합으로 학습한다(전체 표본 학습과 동일한 해).
- 가상 운용은 일별 수정주가 수익률(로그, 1e-4 단위 정수)로 브라우저에서 재계산한다."""
import gzip
import json
import pathlib
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine import data, model  # noqa: E402
from engine import research as R  # noqa: E402

OUT = R.ROOT / "web" / "data" / "lab"
HS = [5, 10, 20, 60]
STEP = 5
NEW_GROUPS = {
    "trend": ["mom_250", "low252_ratio"],
    "pattern": ["up_limit_20", "streak_up", "gap_20", "intra_20", "rev_1"],
    "beta": ["beta_60", "skew_60"],
    "age": ["listed_days"],
}
NEW_LABELS = {"mom_250": "최근 250일 수익률(직전 20일 제외)", "low252_ratio": "52주 최저가 대비 위치", "up_limit_20": "최근 20일 상한가 횟수",
              "streak_up": "연속 상승 일수", "gap_20": "20일 평균 시가 갭", "intra_20": "20일 평균 장중 수익률", "rev_1": "전일 수익률",
              "beta_60": "60일 시장 민감도(베타)", "skew_60": "60일 수익률 왜도", "listed_days": "상장 경과 일수"}
GROUP_LABELS = {**data.GROUP_LABELS, "trend": "장기 추세", "pattern": "급등·갭 이력", "beta": "시장 민감도", "age": "상장 경과"}


def add_features(df: pd.DataFrame, mkt: pd.Series) -> pd.DataFrame:
    g = df.groupby("Code", sort=False)
    c, r = df.adj_close, df.ret

    def roll(s, n, fn, minp=None):
        return s.groupby(df.Code, sort=False).rolling(n, min_periods=minp or n).agg(fn).reset_index(level=0, drop=True)

    def shift(s, n):
        return s.groupby(df.Code, sort=False).shift(n)

    df["mom_250"] = shift(c, 20) / shift(c, 250) - 1
    df["low252_ratio"] = c / roll(c, 252, "min", 120)
    df["up_limit_20"] = roll((r >= 0.29).astype(float), 20, "sum")
    up = (r > 0).astype(int)
    grp = (up == 0).groupby(df.Code, sort=False).cumsum()
    df["streak_up"] = up.groupby([df.Code, grp], sort=False).cumsum().clip(upper=10).astype(float)
    pc = shift(c, 1)
    df["gap_20"] = roll(df.adj_open / pc - 1, 20, "mean", 10)
    df["intra_20"] = roll(c / df.adj_open - 1, 20, "mean", 10)
    df["rev_1"] = r
    m = df.Date.map(mkt).fillna(0.0)
    erm, er, em, emm = roll(r * m, 60, "mean"), roll(r, 60, "mean"), roll(m, 60, "mean"), roll(m * m, 60, "mean")
    df["beta_60"] = (erm - er * em) / (emm - em * em).where((emm - em * em) > 0)
    df["skew_60"] = roll(r, 60, "skew")
    df["listed_days"] = g.cumcount().clip(upper=1250).astype(float)
    ao = df.adj_open
    entry = shift(ao, -1)
    for h in HS:
        df[f"fwd_{h}"] = shift(ao, -(1 + h)) / entry - 1
        df[f"label_end_{h}"] = shift(df.Date, -(1 + h))
    df["next_open"] = shift(df.Open, -1)
    df["next_close"] = shift(df.Close, -1)
    return df


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    panel, fr = R.panel(), R.frames()
    mkt = data.market_proxy(panel)
    panel = add_features(panel, mkt)
    groups = {**data.FEATURE_GROUPS, **NEW_GROUPS}
    labels = {**data.FEATURE_LABELS, **NEW_LABELS}
    feats = [f for g in groups.values() for f in g]
    F = len(feats)

    u = panel.loc[panel.in_universe].copy()
    X = (u.groupby("Date")[feats].rank(pct=True) - 0.5).fillna(0.0)
    Xq = np.clip(np.round(X.values * 254), -127, 127).astype(np.int8)
    Xf = Xq.astype(np.float64) / 254.0
    Y = {}
    for h in HS:
        y = u[f"fwd_{h}"]
        lo, hi = y.groupby(u.Date).transform(lambda s: s.quantile(0.01)), y.groupby(u.Date).transform(lambda s: s.quantile(0.99))
        yc = y.clip(lo, hi)
        yr = (yc - yc.groupby(u.Date).transform("mean")).values
        yu = np.where(np.isnan(yr), np.nan, (yr > 0).astype(float) - 0.5)
        Y[h] = np.stack([yr, yu], 1)

    # 연도별 충분통계량: S(전체), T(Label 종료일이 다음 해로 넘어가는 표본)
    years = list(range(int(str(u.Date.min())[:4]), int(model.FINAL_END[:4]) + 1))
    W = 1 + F + 2 + F * F + F * 2
    gram = np.zeros((len(years), len(HS), 2, W))
    yinfo = []
    yr_arr = u.Date.dt.year.values
    for yi, yv in enumerate(years):
        my = yr_arr == yv
        info = {"year": yv, "h": {}}
        for hi_, h in enumerate(HS):
            ok = my & ~np.isnan(Y[h][:, 0])
            tail = ok & ~(u[f"label_end_{h}"].values < np.datetime64(f"{yv + 1}-01-01"))
            for ti, msk in enumerate((ok, tail)):
                if msk.sum() == 0:
                    continue
                xx, yy = Xf[msk], Y[h][msk]
                gram[yi, hi_, ti] = np.concatenate([[msk.sum()], xx.sum(0), yy.sum(0), (xx.T @ xx).ravel(), (xx.T @ yy).ravel()])
            keep = ok & ~tail
            d_ok = u.Date.values[ok]
            info["h"][str(h)] = {"from": str(pd.Timestamp(d_ok.min()).date()) if ok.sum() else None,
                                 "to_all": str(pd.Timestamp(d_ok.max()).date()) if ok.sum() else None,
                                 "to_purged": str(pd.Timestamp(u.Date.values[keep].max()).date()) if keep.sum() else None,
                                 "label_end_max": str(pd.Timestamp(u.loc[keep, f"label_end_{h}"].max()).date()) if keep.sum() else None}
        yinfo.append(info)
        print("gram", yv, int(my.sum()), flush=True)

    # 일자·결정일·종목
    days = fr.dates[(fr.dates >= model.DEV_START) & (fr.dates <= model.FINAL_END)]
    nd = len(days)
    dec = list(range(0, nd - 1, STEP))
    dset = set(days[dec])
    ud = u[u.Date.isin(dset)]
    codes = sorted(ud.Code.unique())
    cidx = {c: i for i, c in enumerate(codes)}
    nc, nD = len(codes), len(dec)
    print("days", nd, "decisions", nD, "codes", nc, flush=True)

    alld = fr.dates
    i0 = alld.get_loc(days[0])
    win = alld[i0 - 1: i0 + nd]
    ac = fr.adj.reindex(index=win, columns=codes)
    ao = fr.adj_open.reindex(index=win, columns=codes)
    acf = ac.ffill()
    prev = acf.shift(1).iloc[1:]
    lr = np.log(acf.iloc[1:] / prev).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    lo = np.log(ao.iloc[1:] / prev).replace([np.inf, -np.inf], np.nan)
    trad = fr.tradable.reindex(index=days, columns=codes).fillna(False).values
    lr_q = np.clip(np.round(lr.values * 1e4), -32767, 32767).astype(np.int16)
    lo_v = np.clip(np.round(lo.values * 1e4), -32767, 32767)
    lo_q = np.where(np.isnan(lo.values) | ~trad, -32768, lo_v).astype(np.int16)

    slots = np.full((nD, 300), 65535, np.uint16)
    Xd = np.zeros((nD, 300, F), np.int8)
    fwd = np.full((nD, 300, len(HS)), -32768, np.int16)
    f32 = {k: np.full((nD, 300), np.nan, np.float32) for k in ("next_open", "next_close", "vol_60", "amt20", "Marcap", "listed_days")}
    upos = {d: g for d, g in zip(*np.unique(u.Date.values, return_index=True))}
    order = np.argsort(u.Date.values, kind="stable")
    ud_sorted_dates = u.Date.values[order]
    for j, di in enumerate(dec):
        d = np.datetime64(days[di])
        a, b = np.searchsorted(ud_sorted_dates, d, "left"), np.searchsorted(ud_sorted_dates, d, "right")
        rows = order[a:b]
        n = len(rows)
        sub = u.iloc[rows]
        slots[j, :n] = [cidx[c] for c in sub.Code.values]
        Xd[j, :n] = Xq[rows]
        for hi_, h in enumerate(HS):
            v = sub[f"fwd_{h}"].values
            fwd[j, :n, hi_] = np.where(np.isnan(v), -32768, np.clip(np.round(v * 1e4), -32767, 32767))
        for k in f32:
            f32[k][j, :n] = sub[k].values.astype(np.float32)
    kospi = np.array([1 if (panel.loc[panel.Code == c, "Market"].iloc[-1] == "KOSPI") else 0 for c in codes], np.uint8)
    mk = fr.mkt_ret.reindex(days).fillna(0.0).values.astype(np.float32)
    un = fr.univ_ret.reindex(days).fillna(0.0).values.astype(np.float32)
    below = fr.mkt_below_ma.reindex(days).fillna(False).values.astype(np.uint8)
    mvol = (mkt.rolling(60).std() * np.sqrt(252)).reindex(days).ffill().fillna(0.2).values.astype(np.float32)

    arrays = {"core": [("slots", slots), ("X", Xd), ("fwd", fwd)] + [(k, v) for k, v in f32.items()] +
                      [("kospi", kospi), ("mkt", mk), ("univ", un), ("below", below), ("mvol", mvol), ("gram", gram)],
              "px": [("lr", lr_q), ("lo", lo_q)]}
    meta = {"days": [str(d.date()) for d in days], "dec": dec, "codes": codes, "names": [fr.names.get(c, c) for c in codes],
            "features": feats, "feature_labels": labels, "groups": groups, "group_labels": GROUP_LABELS, "horizons": HS,
            "gram_years": years, "gram_width": W, "year_info": yinfo, "dev": [model.DEV_START, model.DEV_END], "final": [model.FINAL_START, model.FINAL_END],
            "snapshot": data.snapshot_id(), "arrays": {}, "lgb": {}}
    for fn, lst in arrays.items():
        buf, off = b"", 0
        for name, arr in lst:
            raw = np.ascontiguousarray(arr).tobytes()
            pad = (-len(buf)) % 8
            buf += b"\0" * pad
            meta["arrays"][name] = {"file": fn, "offset": len(buf), "dtype": str(arr.dtype), "shape": list(arr.shape)}
            buf += raw
        (OUT / f"{fn}.bin.gz").write_bytes(gzip.compress(buf, 9))
        print(fn, len(buf), (OUT / f"{fn}.bin.gz").stat().st_size, flush=True)

    # 트리 기반(LightGBM) 사전 학습 점수: 결정일·대상 종목 순서에 맞춰 내보냄
    cat = json.loads((R.ROOT / "web/data/catalog.json").read_text())
    for mkey in sorted(cat["index"]["models"]):
        fk, h, algo = mkey.split("-")
        if algo != "lightgbm":
            continue
        ms = R.normalize({"model_spec": {"feature_groups": cat["feature_sets"][fk], "algorithm": algo, "target": {"horizon_days": int(h)}}})["model_spec"]
        pred, info, _ = R.get_model(ms, lambda m: None)
        sc = pred.pivot(index="Date", columns="Code", values="score").reindex(index=days[dec], columns=codes)
        out = np.zeros((nD, 300), np.int16)
        v = sc.values
        for j in range(nD):
            s = slots[j]
            ok = s != 65535
            x = v[j, s[ok]]
            out[j, :ok.sum()] = np.where(np.isnan(x), -32768, np.clip(np.round(x * 1e5), -32767, 32767))
        key = "+".join(sorted(cat["feature_sets"][fk])) + f"|{h}"
        (OUT / f"lgb_{fk}_{h}.bin.gz").write_bytes(gzip.compress(out.tobytes(), 9))
        meta["lgb"][key] = {"file": f"lgb_{fk}_{h}.bin.gz", "ic": info["ic"], "importance": info["importance_last_fold"], "folds": info["folds"]}
        print("lgb", mkey, flush=True)
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False))
    print("done", flush=True)


if __name__ == "__main__":
    main()

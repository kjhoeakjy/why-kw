"""브라우저 내 학습·검증용 자료 내보내기. 결과: web/data/lab/
- 외부 실제 자료(scripts/fetch_real_data.sh): 투자자별 순매수, 외국인 보유율, 업종·테마 구성, 공시 제목, 코스피 지수, 해외 지수·환율,
  ETF·선물·옵션·미국 주식 일별 시세. 가정값이나 이론가를 쓰지 않는다.
- 선형 모델은 연도별 충분통계량(X'X, X'y)으로 내보내 브라우저에서 임의의 변수 조합으로 학습한다(전체 표본 학습과 동일한 해).
- 가상 운용은 일별 수정주가 수익률(로그, 1e-4 단위 정수)로 브라우저에서 재계산한다."""
import gzip
import json
import os
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
NEW_GROUPS.update({
    "flow": ["frgn_5", "frgn_20", "inst_5", "inst_20", "indiv_20", "frate", "frate_chg_20"],
    "sector": ["ind_ret_5", "ind_ret_20", "rel_ind_20", "theme_ret_20"],
    "disc": ["disc_cnt_20", "alert_20"],
})
NEW_LABELS.update({"frgn_5": "외국인 5일 순매수 강도", "frgn_20": "외국인 20일 순매수 강도", "inst_5": "기관 5일 순매수 강도", "inst_20": "기관 20일 순매수 강도",
                   "indiv_20": "개인 20일 순매수 강도", "frate": "외국인 보유율", "frate_chg_20": "외국인 보유율 20일 변화",
                   "ind_ret_5": "소속 업종 5일 수익률", "ind_ret_20": "소속 업종 20일 수익률", "rel_ind_20": "업종 대비 20일 초과 수익률", "theme_ret_20": "소속 테마 20일 수익률(최고)",
                   "disc_cnt_20": "최근 20일 공시 건수", "alert_20": "최근 20일 시장경보 지정"})
GROUP_LABELS = {**data.GROUP_LABELS, "trend": "장기 추세", "pattern": "급등·갭 이력", "beta": "시장 민감도", "age": "상장 경과",
                "flow": "투자자별 수급", "sector": "업종·테마 동향", "disc": "공시·시장경보"}
EXT = pathlib.Path(os.environ.get("REAL_DATA", "/home/claude/shl"))
ETFS = [("069500", "KODEX 200", "국내 지수"), ("229200", "KODEX 코스닥150", "국내 지수"), ("122630", "KODEX 레버리지", "레버리지"), ("233740", "KODEX 코스닥150레버리지", "레버리지"),
        ("114800", "KODEX 인버스", "인버스"), ("252670", "KODEX 200선물인버스2X", "인버스"), ("251340", "KODEX 코스닥150선물인버스", "인버스"),
        ("153130", "KODEX 단기채권", "현금성"), ("157450", "TIGER 단기통안채", "현금성"), ("114260", "KODEX 국고채3년", "채권"), ("148070", "KIWOOM 국고채10년", "채권"),
        ("305080", "TIGER 미국채10년선물", "채권"), ("304660", "KODEX 미국30년국채울트라선물(H)", "채권"),
        ("143850", "TIGER 미국S&P500선물(H)", "해외 지수"), ("133690", "TIGER 미국나스닥100", "해외 지수"), ("132030", "KODEX 골드선물(H)", "원자재·통화"), ("261240", "KODEX 미국달러선물", "원자재·통화"),
        ("289480", "TIGER 200커버드콜", "커버드콜")]
US_NAMES = {"AAPL": "애플", "MSFT": "마이크로소프트", "NVDA": "엔비디아", "AMZN": "아마존", "GOOGL": "알파벳", "META": "메타", "TSLA": "테슬라", "AVGO": "브로드컴", "BRK-B": "버크셔해서웨이",
            "LLY": "일라이릴리", "JPM": "JP모건", "V": "비자", "UNH": "유나이티드헬스", "XOM": "엑슨모빌", "MA": "마스터카드", "COST": "코스트코", "HD": "홈디포", "PG": "P&G", "JNJ": "존슨앤드존슨", "NFLX": "넷플릭스"}


def ymd(s):
    return pd.to_datetime(s.astype(str).str[:8], format="%Y%m%d")


def real_market():
    m = pd.read_parquet(EXT / "market.parquet")
    m["Date"] = ymd(m.date)
    return m.pivot_table(index="Date", columns="symbol", values="close", aggfunc="last").sort_index()


def add_real_features(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """수급(2022~), 외국인 보유율(2019~), 업종·테마(현재 구성 기준), 공시 제목 기반 변수. 자료가 없는 기간·종목은 결측(중립값 처리)."""
    key = ["Code", "Date"]
    fl = pd.read_parquet(EXT / "flows.parquet").rename(columns={"code": "Code"})
    fl["Date"] = ymd(fl.date)
    px = pd.read_parquet(EXT / "prices.parquet", columns=["code", "date", "frate"]).rename(columns={"code": "Code"})
    px["Date"] = ymd(px.date)
    df = df.merge(fl[key + ["frgn", "inst", "indiv"]], on=key, how="left").merge(px[key + ["frate"]], on=key, how="left")
    df = df.sort_values(key).reset_index(drop=True)
    g = lambda s: s.groupby(df.Code, sort=False)
    vol = df.Volume.astype(float)
    for col, n, name in (("frgn", 5, "frgn_5"), ("frgn", 20, "frgn_20"), ("inst", 5, "inst_5"), ("inst", 20, "inst_20"), ("indiv", 20, "indiv_20")):
        num = g(df[col]).rolling(n, min_periods=n).sum().reset_index(level=0, drop=True)
        den = g(vol).rolling(n, min_periods=n).sum().reset_index(level=0, drop=True)
        df[name] = num / den.where(den > 0)
    df.loc[df.frate.isna() | (df.Date < "2019-01-02"), "frate"] = np.nan
    df["frate_chg_20"] = df.frate - g(df.frate).shift(20)
    # 업종·테마
    grp = json.loads((EXT / "groups.json").read_text())
    ind_names = [x["name"] for x in grp["industry"]]
    ind_of = {}
    for i, x in enumerate(grp["industry"]):
        for c in x["codes"]:
            ind_of.setdefault(c, i)
    df["ind"] = df.Code.map(ind_of)
    for n in (5, 20):
        m = df.groupby(["Date", "ind"])[f"mom_{n}"].transform("mean")
        df[f"ind_ret_{n}"] = m.where(df.ind.notna())
    df["rel_ind_20"] = df.mom_20 - df.ind_ret_20
    wide = df.pivot(index="Date", columns="Code", values="mom_20")
    best = pd.DataFrame(-np.inf, index=wide.index, columns=wide.columns)
    for x in grp["theme"]:
        cs = [c for c in x["codes"] if c in wide.columns]
        if len(cs) < 3:
            continue
        tm = wide[cs].mean(axis=1).values[:, None]
        best[cs] = np.fmax(best[cs].values, np.where(np.isnan(tm), -np.inf, tm))
    th = best.replace(-np.inf, np.nan).stack().rename("theme_ret_20").reset_index()
    df = df.merge(th, on=["Date", "Code"], how="left")
    # 공시
    ds = pd.read_parquet(EXT / "disclosures.parquet").rename(columns={"code": "Code"})
    ds["Date"] = ymd(ds.dt)
    ds = ds[ds.Date >= "2014-06-01"]
    ds["al"] = ds.title.str.contains("투자주의|투자경고|투자위험|단기과열|관리종목|불성실공시", regex=True).astype(float)
    dd = ds.groupby(key).agg(dn=("title", "size"), al=("al", "max")).reset_index()
    df = df.merge(dd, on=key, how="left").sort_values(key).reset_index(drop=True)
    has = df.Code.isin(set(ds.Code.unique()))
    df["dn"], df["al"] = df.dn.fillna(0.0), df.al.fillna(0.0)
    df["disc_cnt_20"] = df.dn.groupby(df.Code, sort=False).rolling(20, min_periods=1).sum().reset_index(level=0, drop=True).where(has)
    df["alert_20"] = df.al.groupby(df.Code, sort=False).rolling(20, min_periods=1).max().reset_index(level=0, drop=True).where(has)
    return df.drop(columns=["frgn", "inst", "indiv", "dn", "al"]), {"ind_names": ind_names, "ind_of": ind_of}


EXT_GROUPS = {"analyst": ["rep_cnt_60", "tp_up", "tp_rev_120"],
              "fund": ["ep", "bp", "sp", "roe", "opm", "debt", "sales_yoy"],
              "div": ["dy"]}
EXT_LABELS = {"rep_cnt_60": "최근 60일 애널리스트 보고서 수", "tp_up": "목표주가 대비 상승 여력(최근 120일 평균)", "tp_rev_120": "목표주가 변경률(증권사별 직전 대비, 최근 120일)",
              "ep": "이익수익률(최근 4분기 순이익/시가총액)", "bp": "순자산/시가총액", "sp": "매출액(최근 4분기)/시가총액", "roe": "자기자본이익률(최근 4분기)",
              "opm": "영업이익률(최근 4분기)", "debt": "부채비율", "sales_yoy": "매출액 전년 동기 대비 증감률(누적)",
              "dy": "배당수익률(최근 사업연도 주당 현금배당금)"}
EXT_GROUP_LABELS = {"analyst": "애널리스트 보고서", "fund": "실적·재무", "div": "배당"}
EXT_SOURCES = {"analyst": "애널리스트 종목 보고서 투자의견·목표주가(네이버 페이 증권 리서치)", "fund": "분기·반기·사업보고서 주요 계정(DART 전자공시 Open API, 접수일 다음 거래일부터 반영)",
               "div": "사업보고서 배당에 관한 사항(DART 전자공시 Open API, 접수일 다음 거래일부터 반영)"}


def _first_on_or_after(dates: np.ndarray, d: np.ndarray, strict=False) -> np.ndarray:
    i = np.searchsorted(dates, d, "right" if strict else "left")
    out = np.full(len(d), np.datetime64("NaT"), "datetime64[ns]")
    ok = i < len(dates)
    out[ok] = dates[i[ok]]
    return out


def _roll(df, s, n, fn="sum", minp=1):
    return s.groupby(df.Code, sort=False).rolling(n, min_periods=minp).agg(fn).reset_index(level=0, drop=True)


def add_ext_features(df: pd.DataFrame) -> tuple[pd.DataFrame, list]:
    """애널리스트 보고서·DART 재무·배당. 수집 파일이 있는 자료만 변수로 추가(없는 자료는 변수 자체를 만들지 않음)."""
    key = ["Code", "Date"]
    tdays = np.sort(df.Date.unique())
    df = df.sort_values(key).reset_index(drop=True)
    adjf = df.adj_close / df.Close.where(df.Close > 0)                     # 수정주가 환산 계수
    have = []
    p = EXT / "research.parquet"
    if p.exists():
        rs = pd.read_parquet(p)
        rs = rs[rs.code.isin(set(df.Code))].copy()
        rs["Date"] = _first_on_or_after(tdays, pd.to_datetime(rs.date).values)
        rs = rs.dropna(subset=["Date"]).rename(columns={"code": "Code"})
        rs = rs.merge(df[key + ["Close"]].assign(af=adjf), on=key, how="left")
        rs["goal_adj"] = rs.goal * rs.af
        rs = rs.sort_values(["Code", "broker", "Date"])
        prev = rs.groupby(["Code", "broker"]).goal_adj.shift(1)
        pdt = rs.groupby(["Code", "broker"]).Date.shift(1)
        rs["rev"] = (rs.goal_adj / prev - 1).where((rs.Date - pdt) <= pd.Timedelta(days=365))
        dd = rs.groupby(key).agg(rn=("researchId", "size"), gs=("goal_adj", "sum"), gn=("goal_adj", "count"), vs=("rev", "sum"), vn=("rev", "count")).reset_index()
        df = df.merge(dd, on=key, how="left")
        for c in ("rn", "gs", "gn", "vs", "vn"):
            df[c] = df[c].fillna(0.0)
        df["rep_cnt_60"] = _roll(df, df.rn, 60)
        gn = _roll(df, df.gn, 120)
        df["tp_up"] = (_roll(df, df.gs, 120) / gn.where(gn > 0)) / df.adj_close - 1
        vn = _roll(df, df.vn, 120)
        df["tp_rev_120"] = _roll(df, df.vs, 120) / vn.where(vn > 0)
        df.loc[df.Date < pd.Timestamp(rs.Date.min()) + pd.Timedelta(days=180), ["rep_cnt_60", "tp_up", "tp_rev_120"]] = np.nan
        df = df.drop(columns=["rn", "gs", "gn", "vs", "vn"])
        have.append("analyst")
        print("analyst", len(rs), flush=True)
    p = EXT / "dart_fin.parquet"
    if p.exists():
        f = pd.read_parquet(p)
        is_ = f.acct.isin(["sales", "op", "ni"])
        cum = np.where(f.q.isin([2, 3]) & f.cur_cum.notna(), f.cur_cum, f.cur)
        pcum = np.where(f.q.isin([2, 3]) & f.prev_cum.notna(), f.prev_cum, f.prev)
        f = f.assign(cum=cum, pcum=pcum)
        ann = f[f.q == 4].set_index(["code", "year", "acct"]).cur
        prev_ann = ann.reindex(pd.MultiIndex.from_arrays([f.code, f.year - 1, f.acct])).values
        f["ttm"] = np.where(f.q == 4, f.cur, f.cum + prev_ann - f.pcum)
        f["val"] = np.where(is_, f.ttm, f.cur)
        w = f.pivot_table(index=["code", "year", "q"], values="val", columns="acct", aggfunc="first")
        g = f[f.acct == "sales"].set_index(["code", "year", "q"])
        w["sales_yoy"] = (g.cum / g.pcum.where(g.pcum > 0) - 1).reindex(w.index)
        w["rcept"] = f.groupby(["code", "year", "q"]).rcept.max()
        w = w.reset_index().dropna(subset=["rcept"])
        w["Date"] = _first_on_or_after(tdays, pd.to_datetime(w.rcept, format="%Y%m%d").values, strict=True)
        w = w.dropna(subset=["Date"]).rename(columns={"code": "Code"}).sort_values(["Code", "Date", "year", "q"]).drop_duplicates(key, keep="last")
        cols = [c for c in ("sales", "op", "ni", "assets", "liab", "equity", "sales_yoy") if c in w]
        df = df.merge(w[key + cols].add_prefix("_f_").rename(columns={"_f_Code": "Code", "_f_Date": "Date"}), on=key, how="left")
        fc = ["_f_" + c for c in cols]
        df["_f_age"] = df.Date.where(df["_f_" + cols[0]].notna() | df[fc].notna().any(axis=1))
        df[fc + ["_f_age"]] = df.groupby("Code", sort=False)[fc + ["_f_age"]].ffill()
        stale = (df.Date - df._f_age) > pd.Timedelta(days=400)
        mc = df.Marcap.where(df.Marcap > 0)
        eq = df.get("_f_equity")
        df["ep"], df["bp"], df["sp"] = df.get("_f_ni") / mc, eq / mc, df.get("_f_sales") / mc
        df["roe"] = df.get("_f_ni") / eq.where(eq > 0)
        df["opm"] = df.get("_f_op") / df.get("_f_sales").where(df.get("_f_sales") > 0)
        df["debt"] = df.get("_f_liab") / eq.where(eq > 0)
        df["sales_yoy"] = df.get("_f_sales_yoy")
        df.loc[stale, EXT_GROUPS["fund"]] = np.nan
        df = df.drop(columns=fc + ["_f_age"])
        have.append("fund")
        print("fund", len(w), flush=True)
    p = EXT / "dart_div.parquet"
    if p.exists():
        v = pd.read_parquet(p).dropna(subset=["dps"])
        v["Date"] = _first_on_or_after(tdays, pd.to_datetime(v.rcept, format="%Y%m%d").values, strict=True)
        v = v.dropna(subset=["Date"]).rename(columns={"code": "Code"}).sort_values(["Code", "Date", "year"]).drop_duplicates(key, keep="last")
        df = df.merge(v[key + ["dps"]], on=key, how="left")
        df["dps_adj"] = df.dps * adjf                                       # 공시 시점 주식 수 기준 배당금을 수정주가 기준으로 환산
        df["_d_age"] = df.Date.where(df.dps.notna())
        df[["dps_adj", "_d_age"]] = df.groupby("Code", sort=False)[["dps_adj", "_d_age"]].ffill()
        df["dy"] = (df.dps_adj / df.adj_close).where((df.Date - df._d_age) <= pd.Timedelta(days=400))
        df = df.drop(columns=["dps", "dps_adj", "_d_age"])
        have.append("div")
        print("div", len(v), flush=True)
    return df, have


def real_products(days: pd.DatetimeIndex, mk: pd.DataFrame) -> tuple[np.ndarray, list]:
    """실제 ETF·미국 주식 일별 수익률(원화). 미국 주식은 직전 미국 장 종가에 당일 원/달러 환율 적용."""
    e = pd.read_csv(EXT / "study_etf_daily.csv.gz", dtype={"code": str, "date": str})
    e["Date"] = ymd(e.date)
    ep = e.pivot_table(index="Date", columns="code", values="close", aggfunc="last")
    cols, meta = [], []
    for code, name, cat in ETFS:
        s = ep[code].reindex(days).ffill()
        assert s.notna().all(), code
        cols.append(s)
        meta.append({"id": "E" + code, "code": code, "name": name, "cat": cat})
    u = pd.read_csv(EXT / "study_us_daily.csv.gz", dtype={"date": str})
    u["Date"] = ymd(u.date)
    up = u.pivot_table(index="Date", columns="symbol", values="close", aggfunc="last").sort_index()
    fx = mk["USDKRW"].reindex(days.union(mk.index)).ffill().reindex(days)
    for sym, name in US_NAMES.items():
        s = up[sym].dropna()
        pos = np.searchsorted(s.index.values, days.values, "left") - 1          # 해당 한국 거래일 이전 마지막 미국 장
        v = pd.Series(np.where(pos >= 0, s.values[np.clip(pos, 0, None)], np.nan), index=days) * fx
        assert v.notna().all(), sym
        cols.append(v)
        meta.append({"id": "U" + sym, "code": sym, "name": name, "cat": "해외주식"})
    px = pd.concat(cols, axis=1).values
    lr = np.zeros_like(px)
    lr[1:] = np.log(px[1:] / px[:-1])
    return np.clip(np.round(lr * 1e4), -32767, 32767).astype(np.int16), meta


def real_derivs(days: pd.DatetimeIndex) -> dict:
    """코스피200 선물 근월물 일별 수익률과 월물 옵션(풋 95%, 콜 105%) 연속 보유 손익. 실제 종가 기준."""
    f = pd.read_csv(EXT / "study_fut_daily.csv.gz", dtype={"date": str, "exp": str})
    f = f[f["prod"] == "A01"].copy()
    f["Date"] = ymd(f.date)
    fp = f.pivot_table(index="Date", columns="exp", values="close", aggfunc="last").sort_index()
    exps = sorted(fp.columns)
    last = {x: fp[x].dropna().index.max() for x in exps}
    fut_r = pd.Series(np.nan, index=fp.index)
    front = pd.Series(np.nan, index=fp.index)
    for i, d in enumerate(fp.index):
        live = [x for x in exps if last[x] >= d and not np.isnan(fp.at[d, x])]
        if not live:
            continue
        x = live[0]
        front[d] = fp.at[d, x]
        if i and not np.isnan(fp.iat[i - 1, fp.columns.get_loc(x)]):
            fut_r[d] = fp.at[d, x] / fp.iat[i - 1, fp.columns.get_loc(x)] - 1
    o = pd.read_csv(EXT / "study_opt_daily.csv.gz", dtype={"date": str, "exp": str, "code": str})
    o = o[o.code.str[:3].isin(["201", "301", "B01", "C01"])].copy()
    o["Date"] = ymd(o.date)
    out = {"fut": fut_r.reindex(days).values.astype(np.float32)}
    info = {}
    for cp, mny, name in (("P", 0.95, "put"), ("C", 1.05, "call")):
        oc = o[o.cp == cp]
        months = sorted(oc.exp.unique())
        exp_day = {m: oc[oc.exp == m].Date.max() for m in months}
        r = pd.Series(np.nan, index=fp.index)
        roll = pd.Series(0, index=fp.index)
        trades = []
        cur = None
        for d in fp.index:
            if cur is not None:
                c = cur["px"].get(d)
                if c is not None and not np.isnan(c):
                    r[d] = (c - cur["last"]) / cur["f0"]
                    cur["last"] = c
                else:
                    r[d] = 0.0
                if d >= cur["end"]:
                    trades.append({"entry": str(cur["d0"].date()), "exit": str(d.date()), "strike": cur["k"], "exp": cur["m"], "entry_price": cur["c0"], "exit_price": cur["last"], "underlying": cur["f0"]})
                    cur = None
            if cur is None and not np.isnan(front.get(d, np.nan)):
                nxt = [m for m in months if exp_day[m] > d + pd.Timedelta(days=10)]
                if not nxt:
                    continue
                m = nxt[0]
                day = oc[(oc.exp == m) & (oc.Date == d) & (oc.close > 0) & (oc.vol > 0)]
                if day.empty:
                    continue
                row = day.iloc[(day.strike - front[d] * mny).abs().argmin()]
                if abs(row.strike / front[d] - mny) > 0.03:
                    continue
                px = oc[(oc.code == row.code)].set_index("Date").close.to_dict()
                cur = {"px": px, "last": row.close, "c0": float(row.close), "f0": float(front[d]), "k": float(row.strike), "m": m, "d0": d, "end": exp_day[m]}
                roll[d] = 1
                if np.isnan(r[d]):
                    r[d] = 0.0
        out[name] = r.reindex(days).values.astype(np.float32)
        out[name + "_roll"] = roll.reindex(days).fillna(0).values.astype(np.uint8)
        info[name] = {"n_trades": len(trades), "first": trades[0]["entry"] if trades else None, "last": trades[-1]["exit"] if trades else None, "trades": trades}
        print(name, len(trades), trades[:1], flush=True)
    ok = fut_r.reindex(days).dropna()
    info["fut"] = {"first": str(ok.index.min().date()), "last": str(ok.index.max().date())}
    return out, info


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
    rm = real_market()
    mkt = rm["KOSPI"].dropna().pct_change().dropna()          # 실제 코스피 지수 일별 수익률
    panel = add_features(panel, mkt)
    panel, sect = add_real_features(panel)
    panel, have = add_ext_features(panel)
    groups = {**data.FEATURE_GROUPS, **NEW_GROUPS, **{g: EXT_GROUPS[g] for g in have}}
    labels = {**data.FEATURE_LABELS, **NEW_LABELS, **EXT_LABELS}
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
    f32 = {k: np.full((nD, 300), np.nan, np.float32) for k in ("next_open", "next_close", "vol_60", "amt20", "Marcap", "listed_days", "alert_20")}
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
    assert mkt.reindex(days).notna().all(), "코스피 지수 결측"
    mk = mkt.reindex(days).values.astype(np.float32)
    kq = rm["KOSDAQ"].dropna().pct_change().reindex(days).fillna(0.0).values.astype(np.float32)
    un = fr.univ_ret.reindex(days).fillna(0.0).values.astype(np.float32)
    lvl = rm["KOSPI"].dropna()
    below = (lvl < lvl.rolling(60).mean()).reindex(days).fillna(False).values.astype(np.uint8)
    # 해외 지표: 한국 거래일 d 의 결정(종가 이후)은 같은 날짜의 미국 장 마감(다음 날 새벽)까지 반영, 주문은 d+1 시가
    us = lambda s: rm[s].dropna()
    nas = us("NASDAQ").pct_change().reindex(days).fillna(0.0).values.astype(np.float32)
    vix = us("VIX").reindex(days.union(rm.index)).ffill().reindex(days).values.astype(np.float32)
    fxs = us("USDKRW")
    fx20 = (fxs / fxs.shift(20) - 1).reindex(days.union(fxs.index)).ffill().reindex(days).fillna(0.0).values.astype(np.float32)
    prod_lr, prod_meta = real_products(days, rm)
    drv, drv_info = real_derivs(days)
    ind = np.array([sect["ind_of"].get(c, -1) for c in codes], np.int16)

    arrays = {"core": [("slots", slots), ("X", Xd), ("fwd", fwd)] + [(k, v) for k, v in f32.items()] +
                      [("kospi", kospi), ("ind", ind), ("mkt", mk), ("kq", kq), ("univ", un), ("below", below), ("nas", nas), ("vix", vix), ("fx20", fx20),
                       ("prod", prod_lr)] + list(drv.items()) + [("gram", gram)],
              "px": [("lr", lr_q), ("lo", lo_q)]}
    meta = {"days": [str(d.date()) for d in days], "dec": dec, "codes": codes, "names": [fr.names.get(c, c) for c in codes],
            "features": feats, "feature_labels": labels, "groups": groups, "group_labels": {**GROUP_LABELS, **EXT_GROUP_LABELS}, "horizons": HS,
            "gram_years": years, "gram_width": W, "year_info": yinfo, "dev": [model.DEV_START, model.DEV_END], "final": [model.FINAL_START, model.FINAL_END],
            "snapshot": data.snapshot_id(), "arrays": {}, "lgb": {}, "products": prod_meta, "industries": sect["ind_names"], "derivs": drv_info,
            "sources": {"stock": "KRX 전종목 일별 시세(FinanceData/marcap)", "index": "코스피·코스닥 지수(네이버 금융)", "flow": "투자자별 순매수 2022-01~, 외국인 보유율 2019-01~(네이버 금융)",
                        "sector": "업종 79개·테마 265개 구성 종목(네이버 금융, 수집 시점 구성)", "disc": "공시 제목(네이버 금융)", "etf": "ETF 일별 시세(네이버 금융)",
                        "deriv": "코스피200 선물·옵션 일별 시세(한국투자증권 API)", "us": "미국 주식·지수·환율 일별 시세(야후 파이낸스)", **{g: EXT_SOURCES[g] for g in have}}}
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

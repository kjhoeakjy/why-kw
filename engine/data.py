"""시점 기반(Point-in-Time) 데이터 패널.

- 원천: data/raw/marcap-YYYY.parquet (KRX 전종목 일별 시세, 상장폐지 종목 포함)
- 모든 특징은 결정일 t 의 종가까지 관측 가능한 값만 사용한다.
- Label 은 t+1 시가 진입, t+1+h 시가 청산 수익률이며 label_end 날짜를 함께 저장한다.
"""
from __future__ import annotations

import hashlib
import json
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
CACHE = ROOT / "data" / "cache"

SNAPSHOT_END = "2026-09-30"      # 자료 식별번호 기준일(이후 자료는 사용·표시하지 않음)
SNAPSHOT_START = "2015-01-02"
UNIVERSE_SIZE = 300              # 결정일 기준 20일 평균 거래대금 상위 종목 수
HORIZONS = (5, 20)

FEATURE_GROUPS = {
    "price": ["mom_5", "mom_20", "mom_60", "mom_120", "ma20_gap", "ma60_gap", "high252_ratio"],
    "volume": ["amt_ratio_5_60", "amt_ratio_1_20", "log_amt20", "turnover20"],
    "risk": ["vol_20", "vol_60", "downside_vol_60", "mdd_60", "range_20", "max_ret_20"],
    "size": ["log_marcap"],
}
FEATURE_LABELS = {
    "mom_5": "최근 5일 수익률", "mom_20": "최근 20일 수익률", "mom_60": "최근 60일 수익률",
    "mom_120": "최근 120일 수익률(직전 5일 제외)", "ma20_gap": "20일 이동평균 대비 위치",
    "ma60_gap": "60일 이동평균 대비 위치", "high252_ratio": "52주 최고가 대비 위치",
    "amt_ratio_5_60": "거래대금 5일/60일 비율", "amt_ratio_1_20": "거래대금 당일/20일 비율",
    "log_amt20": "20일 평균 거래대금", "turnover20": "20일 평균 회전율",
    "vol_20": "20일 변동성", "vol_60": "60일 변동성", "downside_vol_60": "60일 하락 변동성",
    "mdd_60": "60일 최대 낙폭", "range_20": "20일 평균 일중 변동폭", "max_ret_20": "20일 최대 일간 상승률",
    "log_marcap": "시가총액",
}
GROUP_LABELS = {"price": "가격 흐름", "volume": "거래량·거래대금", "risk": "변동성·위험", "size": "기업 규모"}
UNAVAILABLE_GROUPS = {
    "flows": "투자자별 수급: 시점 정보가 확인된 자료 미확보",
    "fundamentals": "기업 실적·재무: 공시 시점 기준 자료 미확보",
    "dividend": "배당: 기업행위 자료 미확보(수익률에도 배당 미반영)",
    "news": "뉴스·공시 텍스트: 이용 권리 미확인으로 제외",
}
ALL_FEATURES = [f for g in FEATURE_GROUPS.values() for f in g]


def _load_raw() -> pd.DataFrame:
    files = sorted(RAW.glob("marcap-*.parquet"))
    if not files:
        raise FileNotFoundError("data/raw 가 비어 있습니다. scripts/download_data.py 를 먼저 실행하세요.")
    cols = ["Date", "Code", "Name", "Open", "High", "Low", "Close", "Volume", "Amount",
            "ChangesRatio", "Marcap", "Market", "Dept"]
    df = pd.concat([pd.read_parquet(f, columns=cols) for f in files], ignore_index=True)
    df = df[(df.Date >= SNAPSHOT_START) & (df.Date <= SNAPSHOT_END)]
    df = df[df.Market.isin(["KOSPI", "KOSDAQ", "KOSDAQ GLOBAL"])]
    code = df.Code.astype(str)
    df = df[code.str.fullmatch(r"\d{6}") & code.str.endswith("0")]          # 보통주만
    name = df.Name.astype(str)
    df = df[~name.str.contains("스팩|리츠|인프라", regex=True)]
    df = df.drop_duplicates(["Code", "Date"]).sort_values(["Code", "Date"]).reset_index(drop=True)
    return df


def snapshot_id() -> str:
    files = sorted(RAW.glob("marcap-*.parquet"))
    h = hashlib.sha256()
    for f in files:
        h.update(f.name.encode())
        h.update(str(f.stat().st_size).encode())
    h.update(SNAPSHOT_END.encode())
    return "krx_daily_" + h.hexdigest()[:10]


def build_panel(force: bool = False) -> pd.DataFrame:
    """전 종목 특징·Label 패널을 만들고 캐시한다."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"panel_{snapshot_id()}.parquet"
    if out.exists() and not force:
        return pd.read_parquet(out)

    df = _load_raw()
    g = df.groupby("Code", sort=False)
    r = (df.ChangesRatio.fillna(0.0) / 100.0).clip(lower=-0.95)
    df["ret"] = r
    # 기업행위 반영 수정종가(상대값). KRX 등락률은 기준가 대비이므로 분할·병합이 반영된다. 현금배당은 미반영.
    df["adj_close"] = (1.0 + r).groupby(df.Code, sort=False).cumprod()
    traded = (df.Open > 0) & (df.Volume > 0)
    df["tradable"] = traded
    factor = df.adj_close / df.Close.where(df.Close > 0)
    df["adj_open"] = np.where(traded, df.Open * factor, np.nan)
    df["adj_high"] = np.where(traded, df.High * factor, df.adj_close)
    df["adj_low"] = np.where(traded, df.Low * factor, df.adj_close)
    df["prev_close"] = g.Close.shift(1)

    c = df.adj_close

    def roll(s, n, fn, minp=None):
        return s.groupby(df.Code, sort=False).rolling(n, min_periods=minp or n).agg(fn).reset_index(level=0, drop=True)

    def shift(s, n):
        return s.groupby(df.Code, sort=False).shift(n)

    df["mom_5"] = c / shift(c, 5) - 1
    df["mom_20"] = c / shift(c, 20) - 1
    df["mom_60"] = c / shift(c, 60) - 1
    df["mom_120"] = shift(c, 5) / shift(c, 125) - 1
    df["ma20_gap"] = c / roll(c, 20, "mean") - 1
    df["ma60_gap"] = c / roll(c, 60, "mean") - 1
    df["high252_ratio"] = c / roll(c, 252, "max", 120)
    amt = df.Amount.astype(float)
    a5, a20, a60 = roll(amt, 5, "mean"), roll(amt, 20, "mean"), roll(amt, 60, "mean")
    df["amt20"] = a20
    df["amt_ratio_5_60"] = a5 / a60.where(a60 > 0)
    df["amt_ratio_1_20"] = amt / a20.where(a20 > 0)
    df["log_amt20"] = np.log1p(a20)
    df["turnover20"] = roll(amt / df.Marcap.where(df.Marcap > 0), 20, "mean")
    df["vol_20"] = roll(r, 20, "std")
    df["vol_60"] = roll(r, 60, "std")
    df["downside_vol_60"] = roll(r.clip(upper=0), 60, "std")
    df["mdd_60"] = c / roll(c, 60, "max") - 1
    df["range_20"] = roll((df.adj_high - df.adj_low) / c, 20, "mean")
    df["max_ret_20"] = roll(r, 20, "max")
    df["log_marcap"] = np.log(df.Marcap.where(df.Marcap > 0))
    df["listed_days"] = g.cumcount()

    # Label: t+1 시가 진입 → t+1+h 시가 청산. 거래정지로 시가가 없으면 결측.
    ao = df.adj_open
    entry = shift(ao, -1)
    for h in HORIZONS:
        exit_ = shift(ao, -(1 + h))
        df[f"fwd_{h}"] = exit_ / entry - 1
        df[f"label_end_{h}"] = shift(df.Date, -(1 + h))

    # 결정일 기준 유니버스: 관리·환기 종목 제외, 종가 1,000원 이상, 상장 130거래일 이상, 거래대금 상위
    dept = df.Dept.fillna("").astype(str)
    elig = (~dept.str.contains("관리|환기")) & (df.Close >= 1000) & (df.listed_days >= 130) & df.tradable
    elig &= df[ALL_FEATURES].notna().all(axis=1)
    rank = df.amt20.where(elig).groupby(df.Date).rank(ascending=False, method="first")
    df["in_universe"] = rank <= UNIVERSE_SIZE

    keep = ["Date", "Code", "Name", "Market", "Open", "Close", "prev_close", "Volume", "Marcap", "ret",
            "adj_close", "adj_open", "tradable", "in_universe", "amt20"] + ALL_FEATURES + \
           [f"fwd_{h}" for h in HORIZONS] + [f"label_end_{h}" for h in HORIZONS]
    df = df[keep]
    df.to_parquet(out, index=False)
    meta = {
        "snapshot_id": snapshot_id(), "rows": int(len(df)), "codes": int(df.Code.nunique()),
        "start": str(df.Date.min().date()), "end": str(df.Date.max().date()),
        "universe_rows": int(df.in_universe.sum()),
        "source": "KRX 전종목 일별 시세 (FinanceData/marcap 공개 데이터셋)",
        "notes": ["상장폐지 종목 포함(시점별 유니버스)", "현금배당 미반영", "보통주만, 스팩·리츠 제외"],
    }
    (CACHE / "manifest.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return df


def manifest() -> dict:
    p = CACHE / "manifest.json"
    if not p.exists():
        build_panel()
    return json.loads(p.read_text())


def market_proxy(panel: pd.DataFrame) -> pd.Series:
    """코스피 보통주 시가총액 가중 일간 수익률(지수 대용, 배당 미반영)."""
    k = panel[panel.Market == "KOSPI"]
    w = k.Marcap / (1.0 + k.ret)          # 전일 시가총액 근사
    num = (w * k.ret).groupby(k.Date).sum()
    den = w.groupby(k.Date).sum()
    return (num / den).sort_index()

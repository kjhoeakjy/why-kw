"""가상 거래원장 백테스트.

결정(t 종가 이후) → 진입·청산(t+1 시가) 을 분리한다. 정수 주식 수, 현금, 비용, 거래 불가를 반영한다.
가격은 수정주가 비율로 평가하므로 분할·병합은 반영되고 현금배당은 반영되지 않는다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import data
from .model import DEV_START, DEV_END, FINAL_START, FINAL_END

COST_MODELS = {
    "kr_default": {"fee": 0.00015, "sell_tax": 0.0020, "slippage": 0.0010,
                   "label": "수수료 0.015%(매수·매도), 매도 시 거래세 0.20%, 슬리피지 편도 0.10% 가정"},
    "zero_cost": {"fee": 0.0, "sell_tax": 0.0, "slippage": 0.0, "label": "비용 없음(이상적 체결 가정)"},
    "high_slippage": {"fee": 0.00015, "sell_tax": 0.0020, "slippage": 0.0030,
                      "label": "수수료 0.015%, 거래세 0.20%, 슬리피지 편도 0.30% 가정"},
}
UPPER_LIMIT_SKIP = 1.29   # 시가가 전일 종가 대비 +29% 이상이면 매수 불가로 처리


def policy_normalize(sp: dict | None, pp: dict | None, horizon: int) -> tuple[dict, dict]:
    sp, pp = dict(sp or {}), dict(pp or {})
    k = int((sp.get("selection") or {}).get("k", sp.get("top_k", 5)))
    hold = int(sp.get("holding_days", horizon))
    if hold != horizon:
        raise ValueError("보유 기간은 학습 Target 의 예측 기간과 같아야 합니다(Label 과 가상 체결의 정합성).")
    cost = sp.get("cost_model_id", "kr_default")
    if cost not in COST_MODELS:
        raise ValueError(f"지원하지 않는 비용 가정: {cost}")
    s = {"decision": "after_close", "entry": "next_open", "holding_days": hold,
         "selection": {"type": "top_k", "k": max(1, min(k, 30))},
         "keep_buffer": float(sp.get("keep_buffer", 1.0)),           # 1.0=매번 교체, 3.0=상위 3k 안이면 계속 보유
         "volatility_filter": float(sp.get("volatility_filter", 0.0)),  # 0.3=60일 변동성 상위 30% 제외
         "market_filter": bool(sp.get("market_filter", False)),         # 시장이 60일 평균 아래면 신규 매수 중단
         "cost_model_id": cost}
    p = {"initial_cash_krw": int(pp.get("initial_cash_krw", 1_000_000)),
         "max_position_weight": float(pp.get("max_position_weight", 1.0 / s["selection"]["k"])),
         "cash_floor_weight": float(pp.get("cash_floor_weight", 0.0)),
         "existing_positions": sorted(set(pp.get("existing_positions") or []))}
    return s, p


class Frames:
    """백테스트용 wide 프레임(한 번만 만든다)."""

    def __init__(self, panel: pd.DataFrame):
        d = panel[panel.Date >= "2018-06-01"]
        codes = d.loc[d.in_universe, "Code"].unique()
        d = d[d.Code.isin(codes)]
        piv = lambda c: d.pivot(index="Date", columns="Code", values=c)
        self.open, self.close, self.adj = piv("Open"), piv("Close"), piv("adj_close")
        self.adj_open, self.prev_close = piv("adj_open"), piv("prev_close")
        self.tradable = piv("tradable").fillna(False).astype(bool)
        self.univ = piv("in_universe").fillna(False).astype(bool)
        self.vol60 = piv("vol_60")
        self.dates = self.close.index
        self.names = d.drop_duplicates("Code", keep="last").set_index("Code").Name.to_dict()
        m = data.market_proxy(panel)
        self.mkt_ret = m.reindex(self.dates).fillna(0.0)
        lvl = (1 + m).cumprod()
        self.mkt_below_ma = (lvl < lvl.rolling(60).mean()).reindex(self.dates).fillna(False)
        nr = d.groupby("Code").ret.shift(-1)          # 다음 거래일 수익률(유니버스 편입 다음 날 보유 가정)
        self.univ_ret = nr[d.in_universe].groupby(d.Date[d.in_universe]).mean().shift(1).reindex(self.dates).fillna(0.0)


def run(pred: pd.DataFrame, sp: dict, pp: dict, fr: Frames, log=None) -> dict:
    log = log or (lambda m: None)
    cm = COST_MODELS[sp["cost_model_id"]]
    k, hold = sp["selection"]["k"], sp["holding_days"]
    score = pred.pivot(index="Date", columns="Code", values="score")
    dates = fr.dates[(fr.dates >= DEV_START) & (fr.dates <= FINAL_END)]
    idx = {d: i for i, d in enumerate(fr.dates)}
    cash = float(pp["initial_cash_krw"])
    pos: dict[str, dict] = {}      # code -> {shares, cost_adj(진입 수정시가), raw_entry, value_entry, entry_date}
    pending_sell: set[str] = set()
    ledger, skipped = [], {"untradable_buy": 0, "unaffordable": 0, "untradable_sell": 0, "market_filter": 0}
    equity, fees_paid, turnover_val = [], 0.0, 0.0
    orders: dict | None = None
    excl = set(pp["existing_positions"])

    def pos_value(code, d, col="adj"):
        p = pos[code]
        px = getattr(fr, col).at[d, code]
        if not np.isfinite(px):
            px = fr.adj.at[d, code]
        if not np.isfinite(px):
            return p["last_value"]
        v = p["value_entry"] * px / p["cost_adj"]
        p["last_value"] = v
        return v

    for n, d in enumerate(dates):
        # 1) 전일 결정된 주문을 오늘 시가에 실행
        if orders is not None:
            for code in list(pending_sell | set(orders["sell"])):
                if code not in pos:
                    pending_sell.discard(code)
                    continue
                if not fr.tradable.at[d, code]:
                    pending_sell.add(code)
                    skipped["untradable_sell"] += 1
                    continue
                gross = pos_value(code, d, "adj_open") * (1 - cm["slippage"])
                cost = gross * (cm["fee"] + cm["sell_tax"])
                p = pos.pop(code)
                cash += gross - cost
                fees_paid += cost + gross * cm["slippage"] / (1 - cm["slippage"])
                turnover_val += gross
                ledger.append({"date": str(d.date()), "side": "매도", "code": code, "name": fr.names.get(code, code),
                               "shares": p["shares"], "price": round(float(fr.open.at[d, code])),
                               "amount": round(gross), "cost": round(cost),
                               "pnl": round(gross - cost - p["paid"]), "held_from": p["entry_date"]})
                pending_sell.discard(code)
            eq_now = cash + sum(pos_value(c, d, "adj_open") for c in pos)
            buys = orders["buy"]
            for j, code in enumerate(buys):
                o, pc = fr.open.at[d, code], fr.prev_close.at[d, code]
                if (not fr.tradable.at[d, code]) or (np.isfinite(pc) and pc > 0 and o >= pc * UPPER_LIMIT_SKIP):
                    skipped["untradable_buy"] += 1
                    ledger.append({"date": str(d.date()), "side": "미체결", "code": code, "name": fr.names.get(code, code),
                                   "shares": 0, "price": round(float(o)) if np.isfinite(o) else 0, "amount": 0,
                                   "cost": 0, "note": "거래정지 또는 상한가 근접"})
                    continue
                target = eq_now * min(pp["max_position_weight"], 1.0 / k)
                free = cash - eq_now * pp["cash_floor_weight"]
                budget = min(target, free / max(1, len(buys) - j) if free > 0 else 0)
                px = o * (1 + cm["slippage"])
                shares = int(budget // (px * (1 + cm["fee"])))
                if shares <= 0:
                    skipped["unaffordable"] += 1
                    ledger.append({"date": str(d.date()), "side": "매수불가", "code": code, "name": fr.names.get(code, code),
                                   "shares": 0, "price": round(float(o)), "amount": 0, "cost": 0,
                                   "note": "배정 금액 1주 미만"})
                    continue
                gross = shares * px
                cost = gross * cm["fee"]
                cash -= gross + cost
                fees_paid += cost + shares * o * cm["slippage"]
                turnover_val += gross
                pos[code] = {"shares": shares, "cost_adj": fr.adj_open.at[d, code], "raw_entry": o,
                             "value_entry": shares * o, "paid": gross + cost, "entry_date": str(d.date()),
                             "last_value": shares * o}
                ledger.append({"date": str(d.date()), "side": "매수", "code": code, "name": fr.names.get(code, code),
                               "shares": shares, "price": round(float(o)), "amount": round(gross), "cost": round(cost)})
            orders = None
        # 2) 종가 평가
        equity.append(cash + sum(pos_value(c, d) for c in pos))
        # 3) 리밸런싱 결정(종가 이후, t 시점까지의 정보만 사용)
        if n % hold == 0 and d in score.index and n < len(dates) - 1:
            s = score.loc[d].dropna()
            s = s[[c for c in s.index if fr.univ.at[d, c] and c not in excl]]
            if sp["volatility_filter"] > 0:
                v = fr.vol60.loc[d, s.index]
                s = s[v <= v.quantile(1 - sp["volatility_filter"])]
            rank = s.rank(ascending=False)
            keep = {c for c in pos if c in rank.index and rank[c] <= k * sp["keep_buffer"]} if sp["keep_buffer"] > 1 else set()
            risk_off = sp["market_filter"] and bool(fr.mkt_below_ma.at[d])
            if risk_off:
                skipped["market_filter"] += 1
                new = []
            else:
                new = [c for c in s.sort_values(ascending=False).index if c not in keep][: max(0, k - len(keep))]
            sell = [c for c in pos if c not in keep and c not in new]
            buy = [c for c in new if c not in pos]
            orders = {"sell": sell, "buy": buy}

    eq = pd.Series(equity, index=dates)
    init = float(pp["initial_cash_krw"])
    bm_mkt = init * (1 + fr.mkt_ret.loc[dates]).cumprod() / (1 + fr.mkt_ret.loc[dates[0]])
    bm_univ = init * (1 + fr.univ_ret.loc[dates]).cumprod() / (1 + fr.univ_ret.loc[dates[0]])
    trades = [l for l in ledger if l["side"] in ("매수", "매도")]
    sells = [l for l in ledger if l["side"] == "매도"]
    log(f"[가상 체결] {dates[0].date()}~{dates[-1].date()} 거래 {len(trades):,}건 · 미체결 {skipped['untradable_buy']}건 · "
        f"매수불가 {skipped['unaffordable']}건 · 비용 {fees_paid:,.0f}원")
    return {"equity": eq, "bm_market": bm_mkt, "bm_universe": bm_univ, "ledger": ledger, "skipped": skipped,
            "fees_paid": fees_paid, "turnover_value": turnover_val, "n_trades": len(trades),
            "win_rate": float(np.mean([l["pnl"] > 0 for l in sells])) if sells else None,
            "open_positions": [{"code": c, "name": fr.names.get(c, c), "shares": p["shares"], "since": p["entry_date"]}
                               for c, p in pos.items()],
            "cost_label": cm["label"]}


def seg_metrics(eq: pd.Series, a: str, b: str, ledger: list, fees_total_ratio: float | None = None) -> dict:
    s = eq[(eq.index >= a) & (eq.index <= b)]
    if len(s) < 20:
        return {}
    r = s.pct_change().dropna()
    yrs = len(s) / 252
    tot = s.iloc[-1] / s.iloc[0] - 1
    dd = s / s.cummax() - 1
    trough = dd.idxmin()
    peak = s[:trough].idxmax()
    rec = s[trough:][s[trough:] >= s[peak]]
    n_tr = sum(1 for l in ledger if l["side"] in ("매수", "매도") and a <= l["date"] <= b)
    cost = sum(l["cost"] for l in ledger if a <= l["date"] <= b)
    vol = float(r.std() * np.sqrt(252))
    return {"from": str(s.index[0].date()), "to": str(s.index[-1].date()), "years": round(yrs, 2),
            "total_return": round(float(tot), 4), "cagr": round(float((1 + tot) ** (1 / yrs) - 1), 4),
            "mdd": round(float(dd.min()), 4), "mdd_peak": str(peak.date()), "mdd_trough": str(trough.date()),
            "mdd_recovered": str(rec.index[0].date()) if len(rec) else None,
            "vol_ann": round(vol, 4), "sharpe_rf0": round(float(r.mean() * 252 / vol), 2) if vol > 0 else None,
            "n_trades": n_tr, "trades_per_year": round(n_tr / yrs, 1), "explicit_cost_krw": round(cost),
            "start_value": round(float(s.iloc[0])), "end_value": round(float(s.iloc[-1]))}


def trailing(eq: pd.Series, months=(1, 3, 6, 12)) -> dict:
    out, end = {}, eq.index[-1]
    for m in months:
        st = end - pd.DateOffset(months=m)
        s = eq[eq.index >= st]
        out[f"{m}m"] = round(float(s.iloc[-1] / s.iloc[0] - 1), 4) if len(s) > 5 and eq.index[0] <= st else None
    return out


def rolling_windows(eq: pd.Series, months: int = 6) -> dict:
    """월초 시작 기준 동일 보유기간 결과 분포. 구간이 겹치므로 독립 표본이 아니다."""
    starts = eq.groupby([eq.index.year, eq.index.month]).head(1).index
    vals = []
    for st in starts:
        en = st + pd.DateOffset(months=months)
        if en > eq.index[-1]:
            break
        vals.append(eq[eq.index <= en].iloc[-1] / eq[st] - 1)
    if len(vals) < 6:
        return {}
    v = np.array(vals)
    return {"months": months, "n_windows": int(len(v)), "p10": round(float(np.quantile(v, .1)), 4),
            "median": round(float(np.median(v)), 4), "p90": round(float(np.quantile(v, .9)), 4),
            "loss_share": round(float((v < 0).mean()), 3), "worst": round(float(v.min()), 4),
            "note": "구간이 중첩되어 독립 표본이 아니며 과거 빈도는 미래 확률이 아님"}

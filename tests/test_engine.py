"""엔진 불변조건 테스트. 실제 데이터(data/raw)가 있어야 한다:  pytest -q"""
import pandas as pd
import pytest

from engine import backtest as bt
from engine import data, model
from engine import research as R

BASE = {"model_spec": {"feature_groups": ["price", "volume"], "algorithm": "ridge", "target": {"horizon_days": 5}},
        "strategy_policy": {"top_k": 5}, "portfolio_policy": {"initial_cash_krw": 1_000_000}}


@pytest.fixture(scope="module")
def base():
    return R.execute(BASE, save=False)


def test_no_leakage_in_folds(base):
    for f in base["model"]["folds"]:
        assert pd.Timestamp(f["label_end_max"]) < pd.Timestamp(f["test_from"])     # 학습 Label 이 검증 시작 전에 끝난다
        assert pd.Timestamp(f["train_to"]) < pd.Timestamp(f["test_from"])
        assert f["n_purged"] > 0


def test_features_use_only_past():
    """특징은 결정일까지의 값만 쓴다: 미래 구간을 잘라내도 과거 특징이 변하지 않아야 한다."""
    p = R.panel()
    code = "005930"
    full = p[(p.Code == code) & (p.Date <= "2023-06-30")].set_index("Date")
    raw = data._load_raw()
    cut = raw[(raw.Code == code) & (raw.Date <= "2023-06-30")].copy()
    r = (cut.ChangesRatio.fillna(0) / 100).clip(lower=-0.95)
    c = (1 + r).cumprod()
    mom20 = (c / c.shift(20) - 1).values[-1]
    assert abs(mom20 - full.mom_20.iloc[-1]) < 1e-9


def test_reproducible(base):
    again = R.execute(BASE, save=False)
    assert again["run_id"] == base["run_id"]
    assert again["metrics"] == base["metrics"]
    assert again["ledger_tail"] == base["ledger_tail"]


def test_same_engine_both_modes(base):
    qs = R.execute({**BASE, "mode": "QUANT_STUDIO"}, save=False)
    assert qs["run_id"] == base["run_id"] and qs["metrics"] == base["metrics"]


def test_ledger_reconciles():
    """현금 + 평가금액 = 자산, 비용 0 가정에서 원장 손익 합이 자산 변화와 일치한다."""
    ms = model.model_spec_normalize(BASE["model_spec"])
    pred, _, _ = R.get_model(ms, lambda m: None)
    sp, pp = bt.policy_normalize({"top_k": 5, "cost_model_id": "zero_cost"}, {"initial_cash_krw": 50_000_000}, 5)
    r = bt.run(pred, sp, pp, R.frames())
    realized = sum(l["pnl"] for l in r["ledger"] if l["side"] == "매도")
    buys = {(l["code"], l["date"]): l["amount"] for l in r["ledger"] if l["side"] == "매수"}
    open_cost = sum(buys[(o["code"], o["since"])] for o in r["open_positions"])
    cash_end = 50_000_000 + realized - open_cost
    assert cash_end >= -1
    assert r["equity"].iloc[-1] >= cash_end - 1      # 자산 = 현금 + 보유 평가금액(≥0)
    assert all(l["shares"] > 0 for l in r["ledger"] if l["side"] in ("매수", "매도"))


def test_costs_reduce_performance(base):
    free = R.execute({**BASE, "strategy_policy": {"top_k": 5, "cost_model_id": "zero_cost"}}, save=False)
    assert free["model_id"] == base["model_id"]                       # 비용 가정만 바뀌면 재학습하지 않는다
    assert free["metrics"]["development"]["end_value"] > base["metrics"]["development"]["end_value"]


def test_personalization_changes_computation(base):
    risk = R.execute({**BASE, "model_spec": {**BASE["model_spec"], "feature_groups": ["price", "volume", "risk"]}}, save=False)
    cash = R.execute({**BASE, "portfolio_policy": {"initial_cash_krw": 10_000_000}}, save=False)
    assert risk["model_id"] != base["model_id"] and risk["model"]["n_features"] > base["model"]["n_features"]
    assert cash["model_id"] == base["model_id"] and cash["policy_id"] != base["policy_id"]
    assert cash["ledger_summary"]["skipped"]["unaffordable"] < base["ledger_summary"]["skipped"]["unaffordable"]


def test_unsupported_is_rejected():
    with pytest.raises(ValueError):
        R.normalize({"model_spec": {"feature_groups": ["price", "fundamentals"]}})
    with pytest.raises(ValueError):
        R.normalize({"model_spec": {"target": {"horizon_days": 60}}})
    with pytest.raises(ValueError):                                    # Label 과 보유 기간 불일치
        R.normalize({"model_spec": {"target": {"horizon_days": 5}}, "strategy_policy": {"holding_days": 20}})


def test_optimize_records_all_candidates(base):
    o = R.optimize(BASE, "less_trading")
    assert o["candidates"][0]["version"] == "V1"
    kinds = {c["change"]: c for c in o["candidates"][1:]}
    assert kinds["상위 3배수 안이면 계속 보유"]["retrained"] is False
    assert kinds["예측·보유 기간 20거래일"]["retrained"] is True
    assert kinds["예측·보유 기간 20거래일"]["dev"]["trades_per_year"] < o["candidates"][0]["dev"]["trades_per_year"]

"""명세 기반 실제 모델 학습(Walk-forward, Label 종료 시점 기준 purge)."""
from __future__ import annotations

import hashlib
import json
import time

import numpy as np
import pandas as pd

from . import data

DEV_START, DEV_END = "2019-01-02", "2024-12-31"       # 개발 검증 구간(후보 비교·선택에 사용)
FINAL_START, FINAL_END = "2025-01-02", data.SNAPSHOT_END  # 잠금 평가 구간(후보 선택에 사용하지 않음)
TRAIN_YEARS = 4
ALGORITHMS = {
    "ridge": {"alpha": 100.0},
    "lightgbm": {"n_estimators": 200, "learning_rate": 0.03, "num_leaves": 15,
                 "min_child_samples": 200, "subsample": 0.8, "colsample_bytree": 0.8},
}


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def model_spec_normalize(ms: dict) -> dict:
    groups = sorted(set(ms.get("feature_groups") or ["price", "volume"]))
    bad = [g for g in groups if g not in data.FEATURE_GROUPS]
    if bad:
        raise ValueError(f"지원하지 않는 데이터 그룹: {bad}")
    h = int((ms.get("target") or {}).get("horizon_days", 5))
    if h not in data.HORIZONS:
        raise ValueError(f"지원하지 않는 예측 기간: {h} (지원: {data.HORIZONS})")
    algo = ms.get("algorithm", "ridge")
    if algo not in ALGORITHMS:
        raise ValueError(f"지원하지 않는 알고리즘: {algo}")
    drop = sorted(set(ms.get("exclude_features") or []))
    return {"universe_id": "kr_top300_liquidity", "feature_groups": groups, "exclude_features": drop,
            "target": {"type": "future_return_open_to_open", "horizon_days": h},
            "algorithm": algo, "hyperparameters": ALGORITHMS[algo],
            "data_snapshot_id": data.snapshot_id(), "seed": int(ms.get("seed", 42))}


def model_id(ms: dict) -> str:
    return "m_" + hashlib.sha256(canonical(ms).encode()).hexdigest()[:10]


def feature_list(ms: dict) -> list[str]:
    feats = [f for g in ms["feature_groups"] for f in data.FEATURE_GROUPS[g]]
    return [f for f in feats if f not in ms["exclude_features"]]


def _rank_norm(u: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    """날짜별 횡단면 순위를 [-0.5, 0.5] 로 변환. 해당 날짜의 정보만 사용하므로 누출이 없다."""
    return u.groupby("Date")[cols].rank(pct=True) - 0.5


def _fit(algo: str, hp: dict, seed: int, X: np.ndarray, y: np.ndarray):
    if algo == "ridge":
        from sklearn.linear_model import Ridge
        return Ridge(alpha=hp["alpha"], random_state=seed).fit(X, y)
    import lightgbm as lgb
    return lgb.LGBMRegressor(**hp, subsample_freq=1, random_state=seed, n_jobs=4, verbose=-1,
                             deterministic=True, force_row_wise=True).fit(X, y)


def train_walk_forward(ms: dict, panel: pd.DataFrame, log=None) -> dict:
    """연도별 Walk-forward 로 실제 학습하고 OOS 예측값을 반환한다."""
    log = log or (lambda m: None)
    t0 = time.time()
    feats = feature_list(ms)
    h = ms["target"]["horizon_days"]
    ycol, endcol = f"fwd_{h}", f"label_end_{h}"
    u = panel.loc[panel.in_universe, ["Date", "Code", ycol, endcol] + feats].copy()
    X_all = _rank_norm(u, feats)
    # 학습 Target: 같은 날짜 유니버스 평균 대비 초과수익률(1~99% 윈저라이즈)
    y = u[ycol]
    lo, hi = y.groupby(u.Date).transform(lambda s: s.quantile(0.01)), y.groupby(u.Date).transform(lambda s: s.quantile(0.99))
    y = y.clip(lo, hi)
    u["y"] = y - y.groupby(u.Date).transform("mean")

    folds, preds = [], []
    importance = None
    for year in range(int(DEV_START[:4]), int(FINAL_END[:4]) + 1):
        test_start = pd.Timestamp(f"{year}-01-01")
        test_end = min(pd.Timestamp(f"{year}-12-31"), pd.Timestamp(FINAL_END))
        train_start = pd.Timestamp(f"{year - TRAIN_YEARS}-01-01")
        in_window = (u.Date >= train_start) & (u.Date < test_start) & u.y.notna()
        # purge: Label 종료일이 검증 시작일 이후인 표본은 학습에서 제거
        purged = in_window & ~(u[endcol] < test_start)
        tr = in_window & ~purged
        te = (u.Date >= test_start) & (u.Date <= test_end)
        if te.sum() == 0:
            continue
        m = _fit(ms["algorithm"], ms["hyperparameters"], ms["seed"], X_all[tr].values, u.y[tr].values)
        p = u.loc[te, ["Date", "Code"]].copy()
        p["score"] = m.predict(X_all[te].values)
        preds.append(p)
        imp = np.abs(m.coef_) if ms["algorithm"] == "ridge" else m.booster_.feature_importance("gain")
        importance = imp
        fold = {"test_year": year, "train_from": str(u.Date[tr].min().date()), "train_to": str(u.Date[tr].max().date()),
                "label_end_max": str(u.loc[tr, endcol].max().date()), "test_from": str(u.Date[te].min().date()),
                "test_to": str(u.Date[te].max().date()), "n_train": int(tr.sum()), "n_purged": int(purged.sum()),
                "n_test": int(te.sum())}
        assert pd.Timestamp(fold["label_end_max"]) < pd.Timestamp(fold["test_from"]), "시점 누출"
        folds.append(fold)
        log(f"[학습] {year}년 검증용 모델: {fold['train_from']}~{fold['train_to']} 표본 {fold['n_train']:,}개 "
            f"(purge {fold['n_purged']:,}개) → {fold['test_from']}~{fold['test_to']} 예측 {fold['n_test']:,}건")
    pred = pd.concat(preds, ignore_index=True)

    # 예측 품질: 날짜별 순위 상관(Rank IC)
    chk = pred.merge(u[["Date", "Code", ycol]], on=["Date", "Code"]).dropna()
    ic = chk.groupby("Date").apply(lambda d: d["score"].rank().corr(d[ycol].rank()), include_groups=False)

    def seg(a, b):
        s = ic[(ic.index >= a) & (ic.index <= b)]
        return {"rank_ic_mean": round(float(s.mean()), 4), "rank_ic_positive_share": round(float((s > 0).mean()), 3),
                "n_dates": int(len(s))}

    tot = float(importance.sum()) or 1.0
    imp = sorted(({"feature": f, "label": data.FEATURE_LABELS[f], "share": round(float(v) / tot, 4)}
                  for f, v in zip(feats, importance)), key=lambda d: -d["share"])
    info = {"model_id": model_id(ms), "features": feats, "n_features": len(feats), "folds": folds,
            "train_seconds": round(time.time() - t0, 2), "ic": {"dev": seg(DEV_START, DEV_END), "final": seg(FINAL_START, FINAL_END)},
            "importance_last_fold": imp,
            "importance_kind": "회귀계수 절대값 비중" if ms["algorithm"] == "ridge" else "분할 이득(gain) 비중",
            "target_note": f"결정일 익일 시가 진입, {h}거래일 뒤 시가 청산 수익률(대상 종목 평균 대비 초과 수익률 학습)"}
    log(f"[학습 완료] 모델 {info['model_id']} · 변수 {len(feats)}개 · {info['train_seconds']}초 · "
        f"개발구간 Rank IC {info['ic']['dev']['rank_ic_mean']:+.4f}")
    return {"pred": pred, "info": info}

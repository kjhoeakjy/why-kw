"""실제 실행 결과를 docs/results.md 로 정리한다(모든 수치는 엔진 출력)."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from engine import data, model  # noqa: E402
from engine import research as R  # noqa: E402

P = lambda x: f"{x * 100:+.1f}%"
W = lambda v: f"{round(v):,}원"


def spec(fg=("price", "volume"), h=5, algo="ridge", k=5, cash=1_000_000, **sp):
    return {"model_spec": {"feature_groups": list(fg), "algorithm": algo, "target": {"horizon_days": h}},
            "strategy_policy": {"top_k": k, "holding_days": h, **sp}, "portfolio_policy": {"initial_cash_krw": cash}}


def line(name, r):
    d, f, m = r["metrics"]["development"], r["metrics"]["locked_final"], r["model"]
    return (f"| {name} | `{r['model_id']}` | {m['n_features']} | {m['ic']['dev']['rank_ic_mean']:+.3f} | {P(d['cagr'])} | {P(d['mdd'])} | "
            f"{d['trades_per_year']:.0f} | {W(d['end_value'])} | {P(f['total_return'])} | {P(f['mdd'])} |")


HEAD = ("| 실험 | 모델 ID | 변수 | Rank IC(개발) | 연 수익률(개발) | MDD(개발) | 거래/년 | 100만원→(개발 종료) | 잠금 평가 수익률 | 잠금 MDD |\n"
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")


def opt_table(o):
    rows = ["| 버전 | 변경 | 종류 | 연 수익률(개발) | MDD(개발) | 거래/년 | J | 잠금 평가 수익률 |", "|---|---|---|---:|---:|---:|---:|---:|"]
    for c in o["candidates"]:
        if "error" in c:
            rows.append(f"| {c['version']} | {c['change']} | – | {c['error']} | | | | |")
            continue
        kind = "기존" if c["kind"] == "base" else ("모델 재학습" if c["retrained"] else "운용 방식 변경(재학습 없음)")
        rows.append(f"| {c['version']} | {c['change']} | {kind} | {P(c['dev']['cagr'])} | {P(c['dev']['mdd'])} | "
                    f"{c['dev']['trades_per_year']:.0f} | {c['J']:+.3f} | {P(c['final']['total_return'])} |")
    return "\n".join(rows) + f"\n\n개발 구간 목적함수(균형) 기준 선택: **{o['selected_on_development']}**"


def main():
    man = data.manifest()
    base = R.execute(spec())
    bm = base["benchmarks"]
    out = [f"""# 실제 실행 결과

이 문서의 모든 수치는 `engine/` 이 실제 과거 데이터로 계산한 값이며 `python scripts/report.py` 로 다시 만들 수 있습니다.
수익성을 주장하기 위한 자료가 아닙니다. 고객의 입력이 실제 계산을 바꾸는지, 그 결과가 재현되는지를 확인한 기록입니다.

## 데이터

| 항목 | 값 |
|---|---|
| 원천 | {man['source']} |
| 기간 | {man['start']} ~ {man['end']} |
| 패널 행 수 / 종목 수 | {man['rows']:,} / {man['codes']:,} (상장폐지 종목 포함) |
| 유니버스 | 결정일 기준 20일 평균 거래대금 상위 {data.UNIVERSE_SIZE}종목, 유니버스 표본 {man['universe_rows']:,} |
| 스냅샷 ID | `{man['snapshot_id']}` |
| 개발 검증 / 잠금 평가 | {model.DEV_START}~{model.DEV_END} / {model.FINAL_START}~{model.FINAL_END} |
| 비용 가정 | {base['ledger_summary']['cost_assumption']} |

기준 지수(같은 기간, 비용·배당 미반영): 코스피 대용 개발 연 {P(bm['market']['dev']['cagr'])} · 잠금 {P(bm['market']['final']['total_return'])},
유니버스 동일가중 개발 연 {P(bm['universe']['dev']['cagr'])} · 잠금 {P(bm['universe']['final']['total_return'])}.

## E1. 데이터를 바꾸면 모델이 달라지는가 (5거래일, Ridge, 상위 5종목, 100만원)

{HEAD}"""]
    for name, fg in (("가격", ("price",)), ("가격+거래량 (기준 V1)", ("price", "volume")), ("가격+거래량+위험", ("price", "volume", "risk")),
                     ("가격+거래량+규모", ("price", "volume", "size")), ("가격+거래량+위험+규모", ("price", "volume", "risk", "size"))):
        out.append(line(name, R.execute(spec(fg=fg))))
    out.append(f"\n## E2. 투자 기간·알고리즘을 바꾸면 (가격+거래량)\n\n{HEAD}")
    for h in (5, 20):
        for algo in ("ridge", "lightgbm"):
            out.append(line(f"{h}거래일 · {algo}", R.execute(spec(h=h, algo=algo))))
    out.append(f"\n## E3. 같은 모델, 개인 조건만 바꾸면 (재학습 없음)\n\n{HEAD}")
    for name, kw in (("100만원 · 5종목", {}), ("1,000만원 · 5종목", {"cash": 10_000_000}), ("100만원 · 10종목", {"k": 10}),
                     ("100만원 · 5종목 · 상위권 유지 보유", {"keep_buffer": 3.0})):
        r = R.execute(spec(**kw))
        out.append(line(f"{name} (못 산 주문 {r['ledger_summary']['skipped']['unaffordable']}건)", r))
    out.append(f"\n## E4. 체결·비용 가정이 성과를 얼마나 바꾸는가 (같은 신호)\n\n{HEAD}")
    for name, cm in (("비용 없음(이상적 체결)", "zero_cost"), ("기본 비용 가정", "kr_default"), ("슬리피지 3배", "high_slippage")):
        out.append(line(name, R.execute(spec(cost_model_id=cm))))
    out.append("\n같은 예측 모델이라도 비용 가정에 따라 결과의 부호가 바뀝니다. 주 단위로 전 종목을 교체하는 전략은 비용 부담이 큽니다.")
    for req in ("reduce_loss", "less_trading", "more_data"):
        o = R.optimize(spec(), req)
        out.append(f"\n## 개선 요청: “{o['label']}”\n\n계획: {o['plan']}\n\n{opt_table(o)}")
    out.append("""
## 읽는 법

- Rank IC 가 양수(예측 순위와 실제 순위가 같은 방향)여도, 상위 몇 종목만 사서 비용을 내면 손실이 날 수 있습니다. 예측력과 투자 성과는 다른 문제입니다.
- 개선 후보가 기존보다 나빠진 경우도 그대로 적었습니다.
- 잠금 평가 구간(2025~2026.9)은 시장 전체가 크게 오른 기간입니다. 이 구간의 높은 수익률을 모델의 실력으로 읽으면 안 됩니다.
- 이 표를 본 뒤 설정을 다시 고르면 잠금 평가는 더 이상 독립 평가가 아닙니다.
""")
    (R.ROOT / "docs" / "results.md").write_text("\n".join(out))
    print("written")


if __name__ == "__main__":
    main()

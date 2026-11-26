# 나만의 AI를 키움 시연

2026 신입사원 Challenge Mission "Why Kiwoom?" 제안의 실행형 PoC입니다.
기획서: [docs/KIWOOM_AI_FACTORY_기획서_v6.md](docs/KIWOOM_AI_FACTORY_기획서_v6.md) · 실제 실행 결과: [docs/results.md](docs/results.md)

> 과제 시연용이며 실제 키움증권 서비스가 아닙니다. 과거 데이터와 가상 투자금만 사용하고, 실계좌·실주문·현재 종목 추천 기능은 없습니다.

## 무엇을 보여주나

고객이 고른 기준이 **연구 명세(ResearchSpec) → 실제 모델 학습 → 가상 거래원장 검증 → 개선 후보 비교**로 이어지는 과정을 모바일 화면에서 직접 실행합니다.

| 장면 | MY AI (간편) | QUANT STUDIO (직접 연구) |
|---|---|---|
| 1. CREATE & TRAIN | 중요 정보·보유 기간·투자금 선택 또는 말로 입력 | 데이터·Target·알고리즘·전략·목적함수 직접 설정 |
| 2. VALIDATE | 원 단위 평가금액, 가장 컸던 하락, 시작 시점별 결과 | CAGR·MDD·Sharpe·Rank IC, Walk-forward 기록, 거래원장 |
| 3. OPTIMIZE | "큰 손실 줄이기 / 거래 줄이기 / 다른 정보 반영" | 후보 실험, 알고리즘 비교, 목적함수 J |

두 모드는 같은 엔진을 씁니다. 같은 명세면 run_id와 결과가 같습니다(`tests/test_engine.py`).
버전 탭에서 **연구 레시피 링크**를 만들면 받은 사람이 계좌 없이 자신의 기준으로 복제해 다시 실행합니다(Mission 2의 Recipe Fork).

## 구조

```
engine/data.py      시점 기반 패널: 특징 18개, Label, 결정일 기준 유니버스(거래대금 상위 300)
engine/model.py     Ridge / LightGBM 연 단위 Walk-forward, Label 종료일 기준 purge
engine/backtest.py  가상 거래원장: 종가 후 결정 → 다음 시가 체결, 정수 주식, 비용, 거래정지·상한가·투자금 부족
engine/research.py  ResearchSpec 정규화, 모델 재사용, 목적함수, 개선 후보 비교
engine/agent.py     Claude API tool calling 으로 자연어 → 명세 (키가 있을 때만)
server.py           FastAPI 실시간 학습 서버 + 웹 서빙
scripts/            데이터 내려받기, 전체 조합 사전 실행
web/                모바일 웹(빌드 불필요). web/data = 엔진이 실제로 계산한 결과
```

## 실행

```bash
pip install -r requirements.txt
python scripts/download_data.py          # KRX 일별 시세 2015~2026 (약 260MB, 저장소에는 포함하지 않음)
pytest -q                                # 누출·재현성·원장 검산
uvicorn server:app --port 8000           # 실시간 모드: 요청할 때마다 실제 학습
# 선택: export ANTHROPIC_API_KEY=...     # 자연어 요청을 Claude 가 명세로 변환
python scripts/precompute.py             # 정적 모드용 결과 다시 만들기 (640건, 약 20분)
```

- **실시간 모드**: `http://localhost:8000` — 화면 상단에 "실시간 학습 서버" 표시. 새 조합은 그 자리에서 학습합니다(Ridge 약 7초, LightGBM 약 15초).
- **정적 모드**: `web/` 폴더만 호스팅(GitHub Pages 등) — "사전 계산 모드" 표시. 같은 엔진으로 미리 실행한 640건을 불러옵니다. QR 공유는 이 모드로 충분합니다.

## 데이터와 가정

- 원천: 한국거래소 전종목 일별 시세를 정리한 공개 데이터셋(FinanceData/marcap), 2015-01-02 ~ 2026-09-30, 상장폐지 종목 포함.
- 보통주만, 스팩·리츠·관리종목 제외. 수익률은 KRX 등락률 기준(분할 반영, **현금배당 미반영**).
- 개발 검증 2019~2024, 잠금 평가 2025-01 ~ 2026-09. 잠금 구간은 후보 선택에 쓰지 않습니다.
- 비용: 수수료 0.015%, 매도 거래세 0.20%, 슬리피지 편도 0.10% (가정).
- 실적·재무·배당(DART 정기보고서, 2018년 이후 2,144종목)은 `DART_API_KEY` 설정 후 `python scripts/fetch_dart.py`, 애널리스트 보고서(투자의견·목표주가, 2018년 이후 54,808건)는 `python scripts/fetch_naver_research.py` 로 수집합니다. 실적·재무·배당은 보고서 접수일 다음 거래일부터 학습에 반영합니다. 공매도와 1년 이전 뉴스는 자료 미확보로 제외합니다.
- 원자료는 커밋하지 않습니다. 공개 호스팅 전 데이터 이용·재배포 조건과 사내 승인 여부를 확인하세요.

## 한계

- 일봉 시가 체결 가정이며 호가·체결량은 반영하지 않습니다.
- 하이퍼파라미터는 고정값이며 탐색하지 않았습니다.
- 결과는 수익성을 주장하기 위한 것이 아니라, 고객의 요청이 실제 계산을 바꾸고 재현된다는 점을 보이기 위한 것입니다.

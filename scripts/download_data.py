"""실제 KRX 일별 시세(FinanceData/marcap 공개 데이터셋)를 data/raw 로 내려받는다.

원천: 한국거래소 정보데이터시스템 전종목 시세를 연도별로 정리한 공개 저장소.
원자료는 저장소에 커밋하지 않는다(.gitignore). 재배포 권리는 별도 확인 대상이다.
"""
import pathlib
import sys
import urllib.request

BASE = "https://raw.githubusercontent.com/FinanceData/marcap/master/data/marcap-{y}.parquet"
OUT = pathlib.Path(__file__).resolve().parents[1] / "data" / "raw"


def main(start=2015, end=2026):
    OUT.mkdir(parents=True, exist_ok=True)
    for y in range(start, end + 1):
        dst = OUT / f"marcap-{y}.parquet"
        if dst.exists():
            print("skip", dst.name)
            continue
        print("download", y)
        urllib.request.urlretrieve(BASE.format(y=y), dst)


if __name__ == "__main__":
    main(*[int(a) for a in sys.argv[1:3]])

"""애널리스트 종목 보고서 수집(네이버 페이 증권 리서치). 결과: $REAL_DATA/research.parquet
- 목록: 작성일, 종목, 증권사, 제목. 상세: 투자의견, 목표주가, 작성일 주가(보고서 본문에 표기된 값).
- 사용: python scripts/fetch_naver_research.py [시작일 YYYY-MM-DD]  (기본 2018-01-01, 중단 후 재실행 시 이어받음)"""
import concurrent.futures as cf
import json
import os
import pathlib
import re
import sys
import time

import pandas as pd
import requests

EXT = pathlib.Path(os.environ.get("REAL_DATA", "/home/claude/shl"))
OUT = EXT / "research.parquet"
CACHE = EXT / "research_detail.jsonl"
LIST = "https://m.stock.naver.com/front-api/research/list"
DETAIL = "https://m.stock.naver.com/investment/research/company/{}"
S = requests.Session()
S.headers["User-Agent"] = "Mozilla/5.0"


def get(url, **kw):
    for i in range(5):
        try:
            r = S.get(url, timeout=20, **kw)
            if r.status_code == 200:
                return r
        except requests.RequestException:
            pass
        time.sleep(1 + 2 * i)
    raise RuntimeError(url)


def fetch_list(start: str) -> pd.DataFrame:
    rows, page = [], 1
    while True:
        res = get(LIST, params={"category": "company", "page": page, "pageSize": 100}).json()["result"]
        if not res:
            break
        rows += res
        if res[-1]["writeDate"] < start:
            break
        if page % 50 == 0:
            print("list", page, res[-1]["writeDate"], flush=True)
        page += 1
    df = pd.DataFrame(rows).drop_duplicates("researchId")
    return df[df.writeDate >= start]


PAT = re.compile(r'"opinion":"([^"]*)","goalPrice":"([^"]*)"(?:,"priceAtWriteDate":"([^"]*)")?')


def fetch_detail(rid: int) -> dict:
    t = get(DETAIL.format(rid)).text
    m = PAT.search(t)
    return {"researchId": rid, "opinion": m.group(1) if m else None, "goal": m.group(2) if m else None, "px_at": m.group(3) if m else None}


def main():
    start = sys.argv[1] if len(sys.argv) > 1 else "2018-01-01"
    lst = fetch_list(start)
    print("reports", len(lst), lst.writeDate.min(), lst.writeDate.max(), flush=True)
    done = {}
    if CACHE.exists():
        for line in CACHE.read_text().splitlines():
            d = json.loads(line)
            done[d["researchId"]] = d
    todo = [r for r in lst.researchId.tolist() if r not in done]
    with open(CACHE, "a") as fh, cf.ThreadPoolExecutor(4) as ex:
        for i, d in enumerate(ex.map(fetch_detail, todo)):
            done[d["researchId"]] = d
            fh.write(json.dumps(d, ensure_ascii=False) + "\n")
            if i % 1000 == 0:
                fh.flush()
                print("detail", i, len(todo), flush=True)
    det = pd.DataFrame(list(done.values()))
    num = lambda s: pd.to_numeric(s.astype(str).str.replace(",", ""), errors="coerce")
    det["goal"], det["px_at"] = num(det.goal), num(det.px_at)
    df = lst[["researchId", "itemCode", "itemName", "brokerName", "writeDate", "title"]].merge(det, on="researchId", how="left")
    df = df.rename(columns={"itemCode": "code", "brokerName": "broker", "writeDate": "date"})
    df.to_parquet(OUT, index=False)
    print("saved", OUT, len(df), int(df.goal.notna().sum()), flush=True)


if __name__ == "__main__":
    main()

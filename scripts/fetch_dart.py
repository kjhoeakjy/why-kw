"""DART 정기보고서 재무 주요 계정과 배당 수집(금융감독원 전자공시 Open API). 결과: $REAL_DATA/dart_fin.parquet, dart_div.parquet
- 환경 변수 DART_API_KEY 필요. 일일 호출 한도 2만 건.
- 재무: 다중회사 주요계정(fnlttMultiAcnt), 2018~현재 사업연도, 1분기·반기·3분기·사업보고서. 연결 재무제표 우선, 없으면 별도.
- 배당: 사업보고서 배당에 관한 사항(alotMatter), 보통주 주당 현금배당금.
- 시점: 접수번호 앞 8자리(접수일)를 공개일로 기록하고, 학습 변수는 접수일 다음 거래일부터 사용한다.
- 사용: python scripts/fetch_dart.py [대상 종목 목록 json]  (기본: web/data/lab/meta.json 의 codes). 중단 후 재실행 시 이어받음."""
import io
import json
import os
import pathlib
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

import pandas as pd
import requests

ROOT = pathlib.Path(__file__).resolve().parents[1]
EXT = pathlib.Path(os.environ.get("REAL_DATA", "/home/claude/shl"))
KEY = os.environ.get("DART_API_KEY", "")
API = "https://opendart.fss.or.kr/api/"
REPRT = {"11013": 1, "11012": 2, "11014": 3, "11011": 4}       # 1분기, 반기, 3분기, 사업보고서
ACCTS = {"매출액": "sales", "수익(매출액)": "sales", "영업수익": "sales", "영업이익": "op", "영업이익(손실)": "op", "당기순이익": "ni", "당기순이익(손실)": "ni",
         "자산총계": "assets", "부채총계": "liab", "자본총계": "equity"}
S = requests.Session()
CACHE = EXT / "dart_cache"


def call(name: str, **params) -> dict:
    ck = CACHE / (name + "_" + "_".join(f"{k}-{v}" for k, v in sorted(params.items()))[:180].replace(",", "") + ".json")
    if ck.exists():
        return json.loads(ck.read_text())
    for i in range(5):
        try:
            r = S.get(API + name, params={"crtfc_key": KEY, **params}, timeout=30)
            d = r.json()
            if d.get("status") in ("000", "013"):          # 013: 자료 없음
                ck.write_text(json.dumps(d, ensure_ascii=False))
                return d
            if d.get("status") == "020":
                raise SystemExit("DART 일일 호출 한도 초과. 내일 재실행 시 이어받음.")
            print("dart", name, d.get("status"), d.get("message"), flush=True)
        except (requests.RequestException, ValueError):
            pass
        time.sleep(1 + 2 * i)
    raise RuntimeError(name)


def corp_codes() -> dict:
    p = EXT / "dart_corpcode.json"
    if p.exists():
        return json.loads(p.read_text())
    r = S.get(API + "corpCode.xml", params={"crtfc_key": KEY}, timeout=60)
    z = zipfile.ZipFile(io.BytesIO(r.content))
    root = ET.fromstring(z.read(z.namelist()[0]))
    m = {}
    for e in root.iter("list"):
        sc = (e.findtext("stock_code") or "").strip()
        if sc:
            m[sc] = e.findtext("corp_code").strip()
    p.write_text(json.dumps(m))
    return m


def amt(s) -> float:
    s = str(s or "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return float("nan")


def main():
    if not KEY:
        raise SystemExit("DART_API_KEY 환경 변수가 없음")
    CACHE.mkdir(parents=True, exist_ok=True)
    src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "web/data/lab/meta.json"
    codes = json.loads(src.read_text())
    codes = codes["codes"] if isinstance(codes, dict) else codes
    cc = corp_codes()
    corp = {c: cc[c] for c in codes if c in cc}
    rev = {v: k for k, v in corp.items()}
    print("codes", len(codes), "dart", len(corp), flush=True)
    ids = sorted(corp.values())
    rows = []
    this_year = pd.Timestamp.today().year
    for y in range(2018, this_year + 1):
        for rc, q in REPRT.items():
            for i in range(0, len(ids), 100):
                d = call("fnlttMultiAcnt.json", corp_code=",".join(ids[i:i + 100]), bsns_year=str(y), reprt_code=rc)
                for x in d.get("list", []):
                    k = ACCTS.get(x.get("account_nm", "").replace(" ", ""))
                    if not k:
                        continue
                    rows.append({"code": x.get("stock_code") or rev.get(x.get("corp_code")), "year": y, "q": q, "fs": x.get("fs_div"), "acct": k,
                                 "rcept": x.get("rcept_no", "")[:8], "cur": amt(x.get("thstrm_amount")), "cur_cum": amt(x.get("thstrm_add_amount")),
                                 "prev": amt(x.get("frmtrm_amount")), "prev_cum": amt(x.get("frmtrm_add_amount"))})
            print("fin", y, rc, len(rows), flush=True)
    fin = pd.DataFrame(rows)
    fin = fin[fin.code.notna()]
    # 연결(CFS) 우선
    fin["pri"] = (fin.fs != "CFS").astype(int)
    fin = fin.sort_values("pri").drop_duplicates(["code", "year", "q", "acct"]).drop(columns="pri")
    fin.to_parquet(EXT / "dart_fin.parquet", index=False)
    print("saved fin", len(fin), flush=True)

    drows = []
    for n, (code, cid) in enumerate(sorted(corp.items())):
        for y in range(2018, this_year):
            d = call("alotMatter.json", corp_code=cid, bsns_year=str(y), reprt_code="11011")
            for x in d.get("list", []):
                if "현금배당금" in x.get("se", "") and "주당" in x.get("se", "") and (x.get("stock_knd") or "보통주").startswith("보통"):
                    drows.append({"code": code, "year": y, "rcept": x.get("rcept_no", "")[:8], "dps": amt(x.get("thstrm"))})
        if n % 100 == 0:
            print("div", n, len(corp), flush=True)
    div = pd.DataFrame(drows).drop_duplicates(["code", "year"])
    div.to_parquet(EXT / "dart_div.parquet", index=False)
    print("saved div", len(div), flush=True)


if __name__ == "__main__":
    main()

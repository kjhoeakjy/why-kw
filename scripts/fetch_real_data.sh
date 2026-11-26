#!/bin/sh
# 실제 자료 수신: 공개 저장소 kjhoeakjy/stock_high_low 의 자료 브랜치(매일 자동 수집분). 사용: sh scripts/fetch_real_data.sh [대상 폴더]
set -e
D=${1:-/home/claude/shl}; mkdir -p "$D"; cd "$D"
[ -d .git ] || { git init -q; git remote add origin https://github.com/kjhoeakjy/stock_high_low.git; }
git fetch -q --depth 1 origin stock-data
git checkout -q FETCH_HEAD -- flows.parquet prices.parquet market.parquet groups.json disclosures.parquet universe.json
git fetch -q --depth 1 origin study-data
git checkout -q FETCH_HEAD -- study_etf_daily.csv.gz study_etf_list.csv study_fut_daily.csv.gz study_opt_daily.csv.gz study_us_daily.csv.gz

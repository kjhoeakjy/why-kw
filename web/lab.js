/* 브라우저 내 학습·가상 운용 엔진.
   - 선형 모델: 연도별 충분통계량(X'X, X'y)으로 임의의 변수 조합을 연 단위 전진 분석으로 학습(전체 표본 학습과 동일한 해).
   - 가상 운용: 일별 수정주가 수익률로 정수 주식 수, 현금, 거래 비용, 거래 불가를 반영하여 재계산.
   - 상품 편입은 실제 ETF·미국 주식 일별 시세, 헤지는 코스피200 선물·옵션 실제 종가로 계산. 가정값·이론가 미사용. */
(function (root) {
  'use strict';
  const NA16 = -32768, VERSION = 'lab-2.0';
  let M = null; const A = {}; const lgbCache = {};
  const COST = { kr_default: { fee: 0.00015, tax: 0.0020, slip: 0.0010, label: '수수료 0.015%(매수·매도), 매도 시 거래세 0.20%, 슬리피지 편도 0.10% 가정' },
    zero_cost: { fee: 0, tax: 0, slip: 0, label: '비용 없음' }, high_slippage: { fee: 0.00015, tax: 0.0020, slip: 0.0030, label: '슬리피지 편도 0.30% 가정' } };
  const TYPES = { int8: Int8Array, uint8: Uint8Array, int16: Int16Array, uint16: Uint16Array, float32: Float32Array, float64: Float64Array };

  async function gunzip(url, readFile) {
    if (readFile) { const zlib = require('zlib'); const b = zlib.gunzipSync(readFile(url)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
    const res = await fetch(url); if (!res.ok) throw new Error('자료 수신 실패');
    return await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  async function load(base, progress, readFile) {
    if (M) return M;
    progress = progress || (() => {});
    const meta = readFile ? JSON.parse(readFile(base + 'meta.json').toString()) : await fetch(base + 'meta.json').then(r => r.json());
    const bufs = {};
    progress('학습 자료 수신'); bufs.core = await gunzip(base + 'core.bin.gz', readFile);
    progress('시세 자료 수신'); bufs.px = await gunzip(base + 'px.bin.gz', readFile);
    for (const [k, a] of Object.entries(meta.arrays)) { const n = a.shape.reduce((x, y) => x * y, 1); A[k] = new TYPES[a.dtype](bufs[a.file], a.offset, n); }
    meta.base = base; meta.readFile = readFile;
    meta.nd = meta.days.length; meta.nc = meta.codes.length; meta.nD = meta.dec.length; meta.F = meta.features.length;
    meta.fi = Object.fromEntries(meta.features.map((f, i) => [f, i]));
    meta.decAt = new Int32Array(meta.nd).fill(-1); meta.dec.forEach((d, j) => { meta.decAt[d] = j; });
    meta.yearOf = meta.days.map(d => +d.slice(0, 4));
    M = meta; return M;
  }
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, '0'); };

  /* ---------- 학습 ---------- */
  function cholSolve(Am, b, n) {
    const L = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = Am[i * n + j]; for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
    }
    const y = new Float64Array(n), x = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
    return x;
  }
  function fitFold(ms, testYear) {
    const F = M.F, W = M.gram_width, hi = M.horizons.indexOf(ms.h), ti = ms.target === 'up' ? 1 : 0, ys = M.gram_years;
    const first = ms.win ? Math.max(ys[0], testYear - ms.win) : ys[0];
    const g = new Float64Array(W);
    for (let y = first; y < testYear; y++) {
      const yi = ys.indexOf(y); if (yi < 0) continue;
      const o = ((yi * M.horizons.length + hi) * 2) * W;
      for (let i = 0; i < W; i++) g[i] += A.gram[o + i];
      if (y === testYear - 1) for (let i = 0; i < W; i++) g[i] -= A.gram[o + W + i];
    }
    const n = g[0]; if (n < 1000) return null;
    const sx = g.subarray(1, 1 + F), sy = g[1 + F + ti], XX = g.subarray(1 + F + 2, 1 + F + 2 + F * F), Xy = g.subarray(1 + F + 2 + F * F);
    let idx = ms.feats.map(f => M.fi[f]).filter(i => i != null); const dropped = [];
    let w;
    for (;;) {
      const p = idx.length, Am = new Float64Array(p * p), b = new Float64Array(p);
      for (let a = 0; a < p; a++) { b[a] = Xy[idx[a] * 2 + ti] - sx[idx[a]] * sy / n; for (let c = 0; c < p; c++) Am[a * p + c] = XX[idx[a] * F + idx[c]] - sx[idx[a]] * sx[idx[c]] / n + (a === c ? ms.alpha : 0); }
      w = cholSolve(Am, b, p);
      let worst = -1, wv = 0;
      idx.forEach((fi, a) => { const bel = (ms.belief || {})[M.features[fi]]; if (bel && w[a] * bel < 0 && Math.abs(w[a]) > wv) { wv = Math.abs(w[a]); worst = a; } });
      if (worst < 0 || idx.length <= 1) break;
      dropped.push(M.features[idx[worst]]); idx = idx.filter((_, a) => a !== worst);
    }
    const coef = new Float64Array(F); idx.forEach((fi, a) => { coef[fi] = w[a]; });
    const info = M.year_info, hk = String(ms.h), yFirst = info.find(x => x.year === first), yLast = info.find(x => x.year === testYear - 1);
    const o2 = ((ys.indexOf(testYear - 1) * M.horizons.length + hi) * 2) * W;
    return { coef, n, dropped, fold: { test_year: testYear, train_from: yFirst.h[hk].from, train_to: yLast.h[hk].to_purged, label_end_max: yLast.h[hk].label_end_max, n_train: Math.round(n), n_purged: Math.round(A.gram[o2 + W]) } };
  }
  function rankArr(v) {
    const n = v.length, o = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b]), r = new Float64Array(n);
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && v[o[j + 1]] === v[o[i]]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[o[k]] = rk; i = j + 1; }
    return r;
  }
  function corr(a, b) { const n = a.length; let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; } sa /= n; sb /= n; let x = 0, y = 0, z = 0; for (let i = 0; i < n; i++) { const p = a[i] - sa, q = b[i] - sb; x += p * q; y += p * p; z += q * q; } return y > 0 && z > 0 ? x / Math.sqrt(y * z) : NaN; }
  const modelKey = ms => JSON.stringify([ms.algo, [...ms.feats].sort(), ms.h, ms.target, ms.alpha, ms.win, Object.entries(ms.belief || {}).filter(([k, v]) => v && ms.feats.includes(k)).sort()]);
  const lgbKey = ms => { const g = Object.keys(M.groups).filter(k => M.groups[k].every(f => ms.feats.includes(f))); const n = g.reduce((s, k) => s + M.groups[k].length, 0); return n === ms.feats.length ? g.sort().join('+') + '|' + ms.h : null; };
  const lgbAvailable = ms => { const k = lgbKey(ms); return !!(k && M.lgb[k]); };
  const modelCache = new Map();
  async function train(ms) {
    const key = modelKey(ms); if (modelCache.has(key)) return { ...modelCache.get(key), reused: true };
    const t0 = Date.now(), F = M.F, nD = M.nD, hi = M.horizons.indexOf(ms.h), score = new Float32Array(nD * 300).fill(NaN);
    const log = [], folds = []; let imp, kind, dropped = [];
    if (ms.algo === 'lightgbm') {
      const k = lgbKey(ms), e = k && M.lgb[k]; if (!e) throw new Error('트리 기반 학습은 기본 정보 조합(가격·거래량·위험·규모), 약 1주·약 1개월에서 제공');
      if (!lgbCache[k]) lgbCache[k] = new Int16Array(await gunzip(M.base + e.file, M.readFile));
      const q = lgbCache[k]; for (let i = 0; i < q.length; i++) if (q[i] !== NA16) score[i] = q[i] / 1e5;
      folds.push(...e.folds); imp = e.importance; kind = '분할 이득(gain) 비중';
      e.folds.forEach(f => log.push(`[학습] ${f.test_year}년 검증용 모델: ${f.train_from}~${f.train_to} 표본 ${f.n_train.toLocaleString()}개 (사전 학습 결과 사용)`));
    } else {
      const byYear = {}; let last;
      for (let y = +M.dev[0].slice(0, 4); y <= +M.final[1].slice(0, 4); y++) {
        const f = fitFold(ms, y); if (!f) continue; byYear[y] = f; last = f; folds.push(f.fold);
        log.push(`[학습] ${y}년 검증용 모델: ${f.fold.train_from}~${f.fold.train_to} 표본 ${f.fold.n_train.toLocaleString()}개 (분리 ${f.fold.n_purged.toLocaleString()}개)`);
      }
      for (let j = 0; j < nD; j++) {
        const f = byYear[M.yearOf[M.dec[j]]]; if (!f) continue; const c = f.coef;
        for (let s = 0; s < 300; s++) { if (A.slots[j * 300 + s] === 65535) break; let v = 0; const o = (j * 300 + s) * F; for (let k = 0; k < F; k++) if (c[k] !== 0) v += c[k] * A.X[o + k]; score[j * 300 + s] = v / 254; }
      }
      const tot = Array.from(last.coef).reduce((s, v) => s + Math.abs(v), 0) || 1;
      imp = ms.feats.map(f => ({ feature: f, label: M.feature_labels[f], share: Math.abs(last.coef[M.fi[f]]) / tot, sign: Math.sign(last.coef[M.fi[f]]) })).sort((a, b) => b.share - a.share);
      kind = '회귀계수 절대값 비중'; dropped = [...new Set(Object.values(byYear).flatMap(f => f.dropped))];
      if (dropped.length) log.push(`[판단 반영] 지정 방향과 반대로 학습된 변수 제외: ${dropped.map(f => M.feature_labels[f]).join(', ')}`);
    }
    // 예측 품질: 결정일별 순위 상관
    const ics = [];
    for (let j = 0; j < nD; j++) {
      const a = [], b = [];
      for (let s = 0; s < 300; s++) { const sc = score[j * 300 + s], fw = A.fwd[(j * 300 + s) * M.horizons.length + hi]; if (!Number.isNaN(sc) && fw !== NA16) { a.push(sc); b.push(fw); } }
      if (a.length > 30) ics.push([M.days[M.dec[j]], corr(rankArr(a), rankArr(b))]);
    }
    const seg = (x, y) => { const s = ics.filter(([d, v]) => d >= x && d <= y && !Number.isNaN(v)).map(v => v[1]); return { rank_ic_mean: s.length ? +(s.reduce((p, q) => p + q, 0) / s.length).toFixed(4) : 0, rank_ic_positive_share: s.length ? +(s.filter(v => v > 0).length / s.length).toFixed(3) : 0, n_dates: s.length }; };
    const hl = ms.h, out = { score, info: { model_id: 'm_' + hash(key), features: ms.feats, n_features: ms.feats.length, folds, ic: { dev: seg(...M.dev), final: seg(...M.final) },
      importance_last_fold: imp, importance_kind: kind, dropped, train_ms: Date.now() - t0,
      target_note: `결정일 익일 시가 진입, ${hl}거래일 뒤 시가 청산 ${ms.target === 'up' ? '초과 수익 여부' : '수익률'}(대상 종목 평균 대비) 학습. 순위 상관은 교체 결정일 기준`,
      training_log: [`[신규 학습] ${ms.algo === 'lightgbm' ? '트리 기반(LightGBM)' : '선형 회귀(Ridge)'} · 변수 ${ms.feats.length}개 · ${hl}거래일`, ...log, `[학습 완료] 검증 구간 순위 상관 ${seg(...M.dev).rank_ic_mean}`] } };
    modelCache.set(key, out); return out;
  }

  /* ---------- 가상 운용 ---------- */
  function quantile(sorted, q) { const n = sorted.length; if (!n) return NaN; const p = (n - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo); }
  function backtest(score, pol, cash0) {
    const nd = M.nd, nc = M.nc, cm = COST[pol.cost || 'kr_default'], k = pol.k, hold = pol.h, lr = A.lr, lo = A.lo;
    const logC = new Float64Array(nc), eq = new Float64Array(nd), ledger = [], skipped = { untradable_buy: 0, unaffordable: 0, untradable_sell: 0, market_filter: 0, stop: 0, take: 0, day_limit: 0, floor: 0 };
    const inds = pol.inds && pol.inds.length ? new Set(pol.inds) : null, maxPer = pol.scap ? Math.max(1, Math.round(pol.scap * pol.k)) : 0;
    const pos = new Map(), pending = new Set(); let cash = cash0, orders = null, urgent = false, fees = 0, turnover = 0, halted = false, prevEq = cash0;
    const excl = new Set(pol.excl || []), only = pol.only && pol.only.length ? new Set(pol.only) : null, closeExec = pol.ex === 'close';
    const name = c => M.names[c];
    const valOpen = (p, c, d) => { const g = lo[d * nc + c]; const v = g === NA16 ? p.valueEntry * Math.exp(logC[c] + lr[d * nc + c] / 1e4 - p.entryLog) : p.valueEntry * Math.exp(logC[c] + g / 1e4 - p.entryLog); p.last = v; return v; };
    const valClose = (p, c) => { const v = p.valueEntry * Math.exp(logC[c] - p.entryLog); p.last = v; return v; };
    const sellOne = (c, d, v) => { const p = pos.get(c), gross = v * (1 - cm.slip), cost = gross * (cm.fee + cm.tax); pos.delete(c); cash += gross - cost; fees += cost + gross * cm.slip / (1 - cm.slip); turnover += gross;
      ledger.push({ date: M.days[d], side: '매도', code: M.codes[c], name: name(c), shares: p.shares, price: Math.round(p.rawEntry * Math.exp((closeExec ? logC[c] : logC[c] + (lo[d * nc + c] === NA16 ? 0 : lo[d * nc + c] / 1e4)) - p.entryLog)), amount: Math.round(gross), cost: Math.round(cost), pnl: Math.round(gross - cost - p.paid), held_from: p.entryDate, note: p.exitNote }); pending.delete(c); };
    const execute = d => {
      const sells = new Set([...pending, ...(orders ? orders.sell : [])]);
      for (const c of sells) { if (!pos.has(c)) { pending.delete(c); continue; } if (lo[d * nc + c] === NA16) { pending.add(c); skipped.untradable_sell++; continue; } sellOne(c, d, closeExec ? valClose(pos.get(c), c) : valOpen(pos.get(c), c, d)); }
      urgent = urgent && pending.size > 0; if (!orders) return;
      let eqNow = cash; for (const [c, p] of pos) eqNow += closeExec ? valClose(p, c) : valOpen(p, c, d);
      const buys = orders.buy;
      buys.forEach((b, j) => {
        const c = b.c, g = lo[d * nc + c];
        if (g === NA16 || (!closeExec && g / 1e4 >= Math.log(1.29))) { skipped.untradable_buy++; ledger.push({ date: M.days[d], side: '미체결', code: M.codes[c], name: name(c), shares: 0, price: 0, amount: 0, cost: 0, note: '거래정지 또는 상한가 근접' }); return; }
        const o = closeExec ? b.rawClose : b.rawOpen, target = eqNow * Math.min(pol.wcap || 1, b.w), free = cash - eqNow * (pol.cashFloor || 0);
        const budget = Math.min(target, free > 0 ? free / Math.max(1, buys.length - j) * (pol.wt && pol.wt !== 'eq' ? b.w * buys.length / orders.wsum : 1) : 0), px = o * (1 + cm.slip), shares = Math.floor(budget / (px * (1 + cm.fee)));
        if (!(shares > 0) || !(o > 0)) { skipped.unaffordable++; ledger.push({ date: M.days[d], side: '매수불가', code: M.codes[c], name: name(c), shares: 0, price: Math.round(o || 0), amount: 0, cost: 0, note: '배정 금액 1주 미만' }); return; }
        const gross = shares * px, cost = gross * cm.fee; cash -= gross + cost; fees += cost + shares * o * cm.slip; turnover += gross;
        pos.set(c, { shares, entryLog: closeExec ? logC[c] : logC[c] + g / 1e4, rawEntry: o, valueEntry: shares * o, paid: gross + cost, entryDate: M.days[d], last: shares * o });
        ledger.push({ date: M.days[d], side: '매수', code: M.codes[c], name: name(c), shares, price: Math.round(o), amount: Math.round(gross), cost: Math.round(cost) });
      });
      orders = null;
    };
    for (let d = 0; d < nd; d++) {
      if (!closeExec && (orders || urgent)) execute(d);
      for (let c = 0, o = d * nc; c < nc; c++) logC[c] += lr[o + c] / 1e4;
      if (closeExec && (orders || urgent)) execute(d);
      let e = cash; for (const [c, p] of pos) e += valClose(p, c);
      eq[d] = e;
      // 위험 관리 규칙(종가 판정, 다음 거래일 매도)
      if (pol.stop || pol.take) for (const [c, p] of pos) { const r = p.last / p.paid - 1; if (pol.stop && r <= -pol.stop && !pending.has(c)) { pending.add(c); p.exitNote = '손절 기준 도달'; skipped.stop++; urgent = true; } else if (pol.take && r >= pol.take && !pending.has(c)) { pending.add(c); p.exitNote = '이익 실현 기준 도달'; skipped.take++; urgent = true; } }
      if (pol.dayLimit && pos.size && e / prevEq - 1 <= -pol.dayLimit) { for (const [c, p] of pos) { pending.add(c); p.exitNote = '일일 손실 한도 도달'; } skipped.day_limit++; urgent = true; }
      if (pol.floor && !halted && e <= cash0 * pol.floor) { for (const [c, p] of pos) { pending.add(c); p.exitNote = '원금 보호선 도달'; } halted = true; skipped.floor++; urgent = true; }
      prevEq = e;
      // 교체 결정(종가 이후, 해당 시점까지의 정보만 사용)
      const j = M.decAt[d];
      if (d % hold === 0 && j >= 0 && d < nd - 1 && !halted) {
        let cand = [];
        for (let s = 0; s < 300; s++) { const c = A.slots[j * 300 + s]; if (c === 65535) break; const sc = score[j * 300 + s]; if (Number.isNaN(sc)) continue; cand.push({ c, sc, s }); }
        const at = (arr, x) => arr[j * 300 + x.s];
        if (pol.uni === 'kospi') cand = cand.filter(x => A.kospi[x.c]);
        if (pol.uni === 'top100' || pol.uni === 'top200') { const n = pol.uni === 'top100' ? 100 : 200, th = cand.map(x => at(A.Marcap, x)).sort((a, b) => b - a)[Math.min(n, cand.length) - 1]; cand = cand.filter(x => at(A.Marcap, x) >= th); }
        if (pol.nonew) cand = cand.filter(x => at(A.listed_days, x) >= 250);
        if (pol.noalert) cand = cand.filter(x => !(at(A.alert_20, x) > 0));
        if (inds) cand = cand.filter(x => inds.has(A.ind[x.c]));
        if (excl.size) cand = cand.filter(x => !excl.has(x.c));
        if (only) cand = cand.filter(x => only.has(x.c));
        if (pol.vf > 0) { const v = cand.map(x => at(A.vol_60, x)).filter(x => !Number.isNaN(x)).sort((a, b) => a - b), q = quantile(v, 1 - pol.vf); cand = cand.filter(x => at(A.vol_60, x) <= q); }
        const rk = rankArr(cand.map(x => -x.sc)); cand.forEach((x, i) => { x.rank = rk[i]; });
        const byC = new Map(cand.map(x => [x.c, x]));
        const keep = new Set(); if (pol.buf > 1) for (const c of pos.keys()) { const x = byC.get(c); if (x && x.rank <= k * pol.buf && !pending.has(c)) keep.add(c); }
        const riskOff = (pol.mf && A.below[d]) || (pol.nasStop && A.nas[d] <= -pol.nasStop) || (pol.vixStop && A.vix[d] >= pol.vixStop) || (pol.fxStop && A.fx20[d] >= pol.fxStop);
        let nw = [];
        if (riskOff) skipped.market_filter++;
        else if (!maxPer) nw = cand.filter(x => !keep.has(x.c)).sort((a, b) => b.sc - a.sc).slice(0, Math.max(0, k - keep.size));
        else { const cnt = new Map(); for (const c of keep) { const g = A.ind[c]; if (g >= 0) cnt.set(g, (cnt.get(g) || 0) + 1); }
          for (const x of cand.filter(x => !keep.has(x.c)).sort((a, b) => b.sc - a.sc)) { if (nw.length >= k - keep.size) break; const g = A.ind[x.c]; if (g >= 0 && (cnt.get(g) || 0) >= maxPer) continue; if (g >= 0) cnt.set(g, (cnt.get(g) || 0) + 1); nw.push(x); } }
        const nwSet = new Set(nw.map(x => x.c));
        const sell = [...pos.keys()].filter(c => !keep.has(c) && !nwSet.has(c));
        let buy = nw.filter(x => !pos.has(x.c));
        const wOf = (x, i) => pol.wt === 'score' ? (nw.length - nw.indexOf(x)) : pol.wt === 'ivol' ? 1 / Math.max(at(A.vol_60, x) || 0.03, 0.005) : 1;
        const raw = nw.map(wOf), tot = raw.reduce((a, b) => a + b, 0) || 1, share = nw.length / k;
        buy = buy.map(x => ({ c: x.c, w: pol.wt && pol.wt !== 'eq' ? raw[nw.indexOf(x)] / tot * share : 1 / k, rawOpen: at(A.next_open, x), rawClose: at(A.next_close, x) }));
        orders = { sell, buy, wsum: buy.reduce((a, b) => a + b.w, 0) || 1 };
      }
    }
    const trades = ledger.filter(l => l.side === '매수' || l.side === '매도'), sells = ledger.filter(l => l.side === '매도');
    return { eq, ledger, skipped, fees, turnover, n_trades: trades.length, win_rate: sells.length ? sells.filter(l => l.pnl > 0).length / sells.length : null,
      open: [...pos].map(([c, p]) => ({ code: M.codes[c], name: name(c), shares: p.shares, since: p.entryDate })), cost_label: cm.label };
  }

  /* ---------- 상품 구성(실제 시세) ---------- */
  function compose(stockEq, p) {
    const nd = M.nd, nP = M.products.length, tot = new Float64Array(nd), cm = COST.kr_default, parts = [], notes = [];
    const add = new Float64Array(nd);
    for (const q of p.prods || []) { const v = new Float64Array(nd); let x = q.amt * (1 - cm.fee - cm.slip); for (let d = 0; d < nd; d++) { if (d) x *= Math.exp(A.prod[d * nP + q.i] / 1e4); v[d] = x; add[d] += x; } parts.push({ label: M.products[q.i].name, cat: M.products[q.i].cat, start: q.amt, end: x }); }
    const hd = new Float64Array(nd);
    if (p.holdings && p.holdings.length) { const lc = new Float64Array(M.nc); for (let d = 0; d < nd; d++) { let v = 0; for (const h of p.holdings) { if (d) lc[h.c] += A.lr[d * M.nc + h.c] / 1e4; v += h.amt * Math.exp(lc[h.c]); } hd[d] = v; }
      parts.push({ label: '보유 종목', cat: '국내주식', start: p.holdings.reduce((a, h) => a + h.amt, 0), end: hd[nd - 1] }); notes.push('보유 종목은 검증 기간 계속 보유 기준'); }
    let hedge = 0, put = 0, call = 0, nPut = 0, nCall = 0, hedgeDays = 0;
    for (let d = 0; d < nd; d++) {
      const base = d ? stockEq[d - 1] + hd[d - 1] : 0, f = A.fut[d];
      if (d && p.hedge && !Number.isNaN(f) && (p.hedgeCond !== 'down' || A.below[d - 1])) { hedge += -p.hedge * base * f; hedgeDays++; }
      if (p.put) { const r = A.put[d]; if (!Number.isNaN(r)) put += nPut * r; if (A.put_roll[d]) nPut = p.put * (stockEq[d] + hd[d]); }
      if (p.call) { const r = A.call[d]; if (!Number.isNaN(r)) call -= nCall * r; if (A.call_roll[d]) nCall = p.call * (stockEq[d] + hd[d]); }
      tot[d] = stockEq[d] + add[d] + hd[d] + hedge + put + call;
    }
    const dv = M.derivs;
    if (p.hedge) { parts.push({ label: '코스피200 선물 매도 헤지 누적 손익', cat: '파생상품', start: 0, end: hedge }); notes.push(`선물 헤지는 실제 근월물 종가 기준, 자료 기간 ${dv.fut.first} 이후 적용(${hedgeDays}거래일)`); }
    if (p.put) { parts.push({ label: '코스피200 풋옵션 매수 누적 손익', cat: '파생상품', start: 0, end: put }); notes.push(`풋옵션은 행사가 95% 부근 월물 실제 종가 기준, 자료 기간 ${dv.put.first} 이후 ${dv.put.n_trades}회 매수`); }
    if (p.call) { parts.push({ label: '코스피200 콜옵션 매도 누적 손익', cat: '파생상품', start: 0, end: call }); notes.push(`콜옵션은 행사가 105% 부근 월물 실제 종가 기준, 자료 기간 ${dv.call.first} 이후 ${dv.call.n_trades}회 매도`); }
    if (p.hedge || p.put || p.call) notes.push('선물·옵션은 계약 단위, 증거금, 수수료 미반영');
    return { tot, parts, notes };
  }

  /* ---------- 지표 ---------- */
  const r4 = v => Math.round(v * 1e4) / 1e4;
  function addMonths(s, n) { const y = +s.slice(0, 4), mo = +s.slice(5, 7) - 1 + n, d = +s.slice(8, 10), Y = y + Math.floor(mo / 12), Mo = ((mo % 12) + 12) % 12, last = new Date(Date.UTC(Y, Mo + 1, 0)).getUTCDate(); return `${Y}-${String(Mo + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; }
  function segMetrics(eq, a, b, ledger) {
    const D = M.days; let i0 = D.findIndex(d => d >= a), i1 = D.length - 1; while (i1 >= 0 && D[i1] > b) i1--;
    const n = i1 - i0 + 1; if (i0 < 0 || n < 20) return {};
    const yrs = n / 252, tot = eq[i1] / eq[i0] - 1; let pk = -Infinity, pki = i0, mdd = 0, tr = i0, pkAt = i0, sum = 0, sq = 0;
    for (let i = i0; i <= i1; i++) { if (eq[i] > pk) { pk = eq[i]; pki = i; } const dd = eq[i] / pk - 1; if (dd < mdd) { mdd = dd; tr = i; pkAt = pki; } if (i > i0) { const r = eq[i] / eq[i - 1] - 1; sum += r; sq += r * r; } }
    let rec = null; for (let i = tr; i <= i1; i++) if (eq[i] >= eq[pkAt]) { rec = D[i]; break; }
    const mean = sum / (n - 1), vol = Math.sqrt(Math.max(0, (sq - (n - 1) * mean * mean) / (n - 2))) * Math.sqrt(252);
    const L = (ledger || []).filter(l => l.date >= a && l.date <= b), nt = L.filter(l => l.side === '매수' || l.side === '매도').length;
    return { from: D[i0], to: D[i1], years: +yrs.toFixed(2), total_return: r4(tot), cagr: r4(Math.pow(1 + tot, 1 / yrs) - 1), mdd: r4(mdd), mdd_peak: D[pkAt], mdd_trough: D[tr], mdd_recovered: mdd < 0 ? rec : D[i0],
      vol_ann: r4(vol), sharpe_rf0: vol > 0 ? +(mean * 252 / vol).toFixed(2) : null, n_trades: nt, trades_per_year: +(nt / yrs).toFixed(1), explicit_cost_krw: Math.round(L.reduce((s, l) => s + l.cost, 0)), start_value: Math.round(eq[i0]), end_value: Math.round(eq[i1]) };
  }
  function trailing(eq) { const D = M.days, end = D[D.length - 1], out = {}; for (const m of [1, 3, 6, 12]) { const st = addMonths(end, -m), i = D.findIndex(d => d >= st); out[m + 'm'] = D.length - i > 5 && D[0] <= st ? r4(eq[D.length - 1] / eq[i] - 1) : null; } return out; }
  function rolling(eq, months) {
    const D = M.days, vals = [];
    for (let i = 0; i < D.length; i++) { if (i && D[i].slice(0, 7) === D[i - 1].slice(0, 7)) continue; const en = addMonths(D[i], months); if (en > D[D.length - 1]) break; let j = i; while (j + 1 < D.length && D[j + 1] <= en) j++; vals.push(eq[j] / eq[i] - 1); }
    if (vals.length < 6) return {}; const s = [...vals].sort((a, b) => a - b);
    return { months, n_windows: s.length, p10: r4(quantile(s, 0.1)), median: r4(quantile(s, 0.5)), p90: r4(quantile(s, 0.9)), loss_share: +(s.filter(v => v < 0).length / s.length).toFixed(3), worst: r4(s[0]), note: '구간이 중첩되어 독립 표본이 아니며 과거 빈도는 미래 확률이 아님' };
  }
  function yearly(eq, mk, un, ledger) {
    const D = M.days, out = [], ys = [...new Set(M.yearOf)];
    for (const y of ys) { const i0 = M.yearOf.indexOf(y), i1 = M.yearOf.lastIndexOf(y), b = i0 > 0 ? i0 - 1 : i0, ret = x => r4(x[i1] / x[b] - 1); let pk = -Infinity, mdd = 0; for (let i = b; i <= i1; i++) { pk = Math.max(pk, eq[i]); mdd = Math.min(mdd, eq[i] / pk - 1); }
      const L = ledger.filter(l => l.date.slice(0, 4) === String(y));
      out.push({ year: y, days: i1 - i0 + 1, start_value: Math.round(eq[b]), end_value: Math.round(eq[i1]), ret: ret(eq), mdd: r4(mdd), market: ret(mk), universe: ret(un), n_trades: L.filter(l => l.side === '매수' || l.side === '매도').length, cost: Math.round(L.reduce((s, l) => s + l.cost, 0)) }); }
    return out;
  }
  const weekly = x => { const o = []; for (let i = 0; i < x.length; i += 5) o.push(Math.round(x[i])); if ((x.length - 1) % 5) o.push(Math.round(x[x.length - 1])); return o; };
  const weeklyDates = () => { const D = M.days, o = []; for (let i = 0; i < D.length; i += 5) o.push(D[i]); if ((D.length - 1) % 5) o.push(D[D.length - 1]); return o; };
  function bench(init) { const nd = M.nd, mk = new Float64Array(nd), un = new Float64Array(nd); let a = init, b = init; for (let d = 0; d < nd; d++) { if (d) { a *= 1 + A.mkt[d]; b *= 1 + A.univ[d]; } mk[d] = a; un[d] = b; } return { mk, un }; }

  /* ---------- 실행 ---------- */
  async function run(spec) {
    const t0 = Date.now(), ms = spec.model, pol = spec.policy, pf = spec.portfolio || {};
    const mdl = await train(ms);
    const prods = (pf.prods || []).map(q => ({ i: M.products.findIndex(x => x.id === q.id), amt: pf.cash * q.pct })).filter(q => q.i >= 0 && q.amt > 0);
    const alloc = prods.reduce((a, q) => a + q.amt, 0), stockCash = Math.max(0, pf.cash - alloc);
    const holdings = (pf.holdings || []).map(h => ({ c: M.codes.indexOf(h.code), amt: h.amt })).filter(h => h.c >= 0);
    const p2 = { ...pol, excl: [...(pol.excl || []).map(c => M.codes.indexOf(c)).filter(c => c >= 0), ...holdings.map(h => h.c)], only: (pol.only || []).map(c => M.codes.indexOf(c)).filter(c => c >= 0),
      inds: (pol.inds || []).map(n => M.industries.indexOf(n)).filter(i => i >= 0) };
    const res = backtest(mdl.score, p2, stockCash);
    const plain = !prods.length && !pf.hedge && !pf.put && !pf.call && !holdings.length;
    const comp = plain ? { tot: res.eq, parts: null, notes: [] } : compose(res.eq, { ...pf, prods, holdings });
    if (comp.parts) comp.parts.unshift({ label: '국내주식(AI 선정)', cat: '국내주식', start: stockCash, end: res.eq[M.nd - 1] });
    const eq = comp.tot, init = pf.cash + holdings.reduce((s, h) => s + h.amt, 0), { mk, un } = bench(init);
    const dev = segMetrics(eq, M.dev[0], M.dev[1], res.ledger), fin = segMetrics(eq, M.final[0], M.final[1], res.ledger);
    const B = (x, label) => ({ label, dev: segMetrics(x, M.dev[0], M.dev[1], []), final: segMetrics(x, M.final[0], M.final[1], []) });
    const pkey = JSON.stringify([pol, pf]);
    return { run_id: 'r_' + hash(modelKey(ms) + pkey), model_id: mdl.info.model_id, policy_id: 'p_' + hash(pkey), engine_version: VERSION, model_status: mdl.reused ? 'reused' : 'trained', source: 'browser',
      model: mdl.info, metrics: { development: dev, locked_final: fin },
      benchmarks: { market: B(mk, '코스피 지수(배당 미반영)'), universe: B(un, '대상 300종목 동일가중(비용 미반영)') },
      trailing: { as_of: M.days[M.nd - 1], strategy: trailing(eq) }, rolling_6m: rolling(eq, 6), yearly: yearly(eq, mk, un, res.ledger),
      series: { dates: weeklyDates(), strategy: weekly(eq), market: weekly(mk), universe: weekly(un) },
      ledger_summary: { n_trades: res.n_trades, win_rate: res.win_rate, skipped: res.skipped, cost_and_slippage_krw: Math.round(res.fees), cost_assumption: res.cost_label, n_ledger_rows: res.ledger.length },
      ledger_tail: res.ledger.slice(-14), open_positions_at_end: res.open, composition: comp.parts ? comp.parts.map(x => ({ ...x, start: Math.round(x.start), end: Math.round(x.end) })) : null, notes: comp.notes,
      logs: [`[가상 체결] ${M.days[0]}~${M.days[M.nd - 1]} 거래 ${res.n_trades.toLocaleString()}건 · 미체결 ${res.skipped.untradable_buy}건 · 매수불가 ${res.skipped.unaffordable}건 · 비용 ${Math.round(res.fees).toLocaleString()}원`], elapsed_ms: Date.now() - t0 };
  }
  root.Lab = { load, run, train, lgbAvailable, meta: () => M, arrays: () => A, COST, VERSION };
  if (typeof module !== 'undefined') module.exports = root.Lab;
})(typeof window !== 'undefined' ? window : globalThis);

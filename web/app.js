/* 나만의 AI를 키움 시연 웹.
   학습과 가상 운용은 브라우저에서 직접 계산한다(lab.js). 자료는 Python(scripts/export_lab.py)으로 내보낸 실제 과거 시세이다. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  let CAT = null, LIVE = false, AGENT = false, COST = null;
  const cache = new Map();
  const S = {
    mode: null, tab: 'create', busy: null, logs: [],
    spec: { groups: ['price', 'volume'], h: 5, algo: 'ridge', k: 5, buf: 1, vf: 0, mf: false, cash: 1000000, preset: 'balanced', x: [], xv: {}, rules: [], target: 'ret', alpha: 100, win: 4, wt: 'eq', ex: 'open', uni: 'all', exf: [], belief: {}, excl: [], only: [], holdings: [], usst: [], inds: [] },
    planNote: null, cur: null, versions: [], opt: null, forked: null, cashDemo: null,
  };

  /* ---------- 형식 ---------- */
  const pct = (x, d = 1) => x == null ? '–' : (x > 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
  const cls = x => x > 0 ? 'up' : x < 0 ? 'down' : '';
  const won = v => v == null ? '–' : Math.round(v).toLocaleString('ko-KR') + '원';
  const man = v => v >= 1e8 ? (v / 1e8).toFixed(2) + '억 원' : Math.round(v / 1e4).toLocaleString('ko-KR') + '만 원';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); };
  const GL = () => Object.fromEntries(Object.entries(CAT.feature_groups).map(([k, v]) => [k, v.label]));
  const HL = { 5: '약 1주', 10: '약 2주', 20: '약 1개월', 60: '약 3개월' };
  const horizonLabel = h => ({ 5: '단기(약 1주)', 10: '약 2주', 20: '중기(약 1개월)', 60: '장기(약 3개월)' }[h]);
  const MYN = { '상위 3배수 이내 보유 유지': '보유 종목 교체 축소', '예측·보유 기간 20거래일': '보유 기간 연장(약 1개월)', '변동성·위험 변수 추가': '하락 위험 정보 추가', '변동성 상위 30% 종목 제외': '변동성 큰 종목 제외', '기업 규모 변수 추가': '기업 규모 정보 추가', '예측·보유 기간 60거래일': '보유 기간 연장(약 3개월)', '투자자별 수급 변수 추가': '투자자별 수급 정보 추가', '업종·테마 변수 추가': '업종·테마 정보 추가', '전체 변수 반영': '전체 정보 반영' };
  const cname = c => S.mode === 'my' ? (MYN[c] || c) : c;
  const SHORT = { price: '가격 흐름', volume: '거래량', risk: '위험', size: '기업 규모', trend: '장기 추세', pattern: '급등·갭 이력', beta: '시장 민감도', age: '상장 경과', flow: '수급', sector: '업종·테마', disc: '공시' };
  const PRESET = { balanced: '수익성·위험 균형', return: '수익성 우선', low_risk: '낙폭 최소화', low_trading: '거래 횟수 최소화' };
  const aiTitle = s => { const x = s.groups.filter(g => g !== 'price'); return (x.length ? x.map(g => SHORT[g]).join('·') : '가격 흐름') + ' 중시 투자 AI'; };
  const verdict = (d, b) => {
    if (d.cagr >= b.cagr && d.mdd >= b.mdd) return d.cagr < 0 ? ['조건부 채택', '수익률·최대 낙폭 개선, 손실 지속'] : ['채택 가능', '수익률·최대 낙폭 개선'];
    if (d.cagr < b.cagr && d.mdd < b.mdd) return ['채택 보류', '수익률·최대 낙폭 동시 악화'];
    return ['채택 보류', d.cagr < b.cagr ? '최대 낙폭 개선, 수익률 하락' : '수익률 개선, 최대 낙폭 확대'];
  };

  /* ---------- 명세 ---------- */
  const toSpec = (s, mode) => ({
    mode: mode === 'qs' ? 'QUANT_STUDIO' : 'MY_AI',
    model_spec: { feature_groups: [...s.groups].sort(), algorithm: s.algo, target: { horizon_days: s.h } },
    strategy_policy: { top_k: s.k, holding_days: s.h, keep_buffer: s.buf, volatility_filter: s.vf, market_filter: s.mf },
    portfolio_policy: { initial_cash_krw: s.cash },
    objective: { preset: s.preset },
  });
  const staticKey = s => {
    const g = [...s.groups].sort().join(',');
    const fk = Object.entries(CAT.feature_sets).find(([, v]) => [...v].sort().join(',') === g);
    if (!fk) return null;
    const G = CAT.grid;
    if (!G.k.includes(s.k) || !G.buf.includes(s.buf) || !G.vf.includes(s.vf) || !G.cash.includes(s.cash)) return null;
    return { m: `${fk[0]}-${s.h}-${s.algo}`, p: `k${s.k}-b${s.buf | 0}-v${Math.round(s.vf * 10)}-m${s.mf ? 1 : 0}-c${s.cash / 1e6}` };
  };
  const applyPatch = (s, patch) => {
    const n = cl(s);
    const m = patch.model_spec || {}, p = patch.strategy_policy || {};
    Object.entries(patch.x || {}).forEach(([id, v]) => { n.x = (n.x || []).filter(o => o !== id && !(XI[id].rg && XI[o] && XI[o].rg === XI[id].rg)); n.x.push(id); n.xv = { ...(n.xv || {}), [id]: v }; });
    if (m.add_groups) n.groups = [...new Set([...n.groups, ...m.add_groups])];
    if (m.remove_groups) n.groups = n.groups.filter(g => !m.remove_groups.includes(g));
    if (m.horizon_days) n.h = m.horizon_days;
    if (m.algorithm) n.algo = m.algorithm;
    if (p.volatility_filter != null) n.vf = p.volatility_filter;
    if (p.market_filter != null) n.mf = p.market_filter;
    if (p.keep_buffer != null) n.buf = p.keep_buffer;
    return n;
  };
  const cl = o => JSON.parse(JSON.stringify(o));
  const LM = () => window.Lab && Lab.meta();
  const xon = (s, id) => (s.x || []).includes(id);
  const xval = (s, id) => xon(s, id) ? +((s.xv || {})[id] ?? XI[id].num.def) : 0;
  const featsOf = s => { const M = LM(); return M.features.filter(f => s.groups.some(g => (M.groups[g] || []).includes(f)) && !(s.exf || []).includes(f)); };
  const labSpec = s => {
    let prods = [...Object.entries(PRODX).filter(([k]) => xon(s, k)).map(([k, id]) => ({ id, pct: xval(s, k) / 100 })), ...(s.usst || []).map(x => ({ id: x.id, pct: x.pct / 100 }))];
    const t = prods.reduce((a, x) => a + x.pct, 0); if (t > 1) prods = prods.map(x => ({ id: x.id, pct: x.pct / t }));
    const fs = featsOf(s), bel = Object.fromEntries(Object.entries(s.belief || {}).filter(([f, v]) => v && fs.includes(f)).sort());
    return { model: { algo: s.algo, feats: fs, h: s.h, target: s.target || 'ret', alpha: s.alpha || 100, win: s.win == null ? 4 : s.win, belief: s.algo === 'ridge' ? bel : {} },
      policy: { k: s.k, h: s.h, buf: s.buf, vf: s.vf, mf: s.mf ? 1 : 0, wt: s.wt || 'eq', ex: s.ex || 'open', uni: s.uni || 'all', nonew: xon(s, 'nonew') ? 1 : 0, excl: [...(s.excl || [])].sort(), only: s.uni === 'watch' ? [...(s.only || [])].sort() : [],
        stop: xval(s, 'stop') / 100, take: xval(s, 'take') / 100, dayLimit: xval(s, 'daily') / 100, floor: xval(s, 'floor') / 100, wcap: xval(s, 'wcap') / 100, scap: xval(s, 'scap') / 100,
        noalert: xon(s, 'noalert') ? 1 : 0, inds: s.uni === 'sector' ? [...(s.inds || [])].sort() : [], nasStop: xval(s, 'nas') / 100, vixStop: xval(s, 'vix'), fxStop: xval(s, 'fx') / 100, cost: 'kr_default' },
      portfolio: { cash: s.cash, prods, hedge: (xval(s, 'p_fut') || xval(s, 'p_futd')) / 100, hedgeCond: xon(s, 'p_futd') ? 'down' : '', put: xval(s, 'p_put') / 100, call: xval(s, 'p_call') / 100, holdings: (s.holdings || []).map(h => ({ code: h.code, amt: h.amt })) } };
  };
  const keyOf = s => JSON.stringify(labSpec(s));
  const sameSpec = (a, b) => keyOf(a) === keyOf(b);
  const describe = s => [
    `정보: ${s.groups.map(g => SHORT[g]).join(' + ')}`,
    `예측·보유: ${s.h}거래일`, `모델: ${s.algo === 'ridge' ? 'Ridge 회귀' : 'LightGBM'}`,
    `종목 수: 상위 ${s.k}개`, s.buf > 1 ? '상위권 종목 보유 유지' : null,
    s.vf > 0 ? `변동성 상위 ${s.vf * 100}% 제외` : null, s.mf ? '하락장 신규 매수 중단' : null,
    `투자금: ${man(s.cash)}`].filter(Boolean);

  /* ---------- 엔진 결과 가져오기 ---------- */
  let labReady = null;
  const labLoad = () => labReady || (labReady = Lab.load('data/lab/').catch(e => { labReady = null; throw new Error('학습 자료 수신 실패. 새로 고침 후 재시도 필요'); }));
  async function getRun(s) {
    await labLoad();
    const ls = labSpec(s), key = JSON.stringify(ls);
    if (cache.has(key)) return cache.get(key);
    if (!ls.model.feats.length) throw new Error('학습 변수 미선택');
    if (s.uni === 'watch' && !ls.policy.only.length) throw new Error('관심 종목 미입력');
    if (s.uni === 'sector' && !ls.policy.inds.length) throw new Error('관심 업종 미입력');
    if (ls.model.algo === 'lightgbm' && (ls.model.target !== 'ret' || !Lab.lgbAvailable(ls.model))) throw new Error('트리 기반 학습 미제공 조합');
    const r = await Lab.run(ls);
    r.costs = {};
    for (const c of ['zero_cost', 'high_slippage']) { const x = await Lab.run({ ...ls, policy: { ...ls.policy, cost: c } }); r.costs[c] = [x.metrics.development.cagr, x.metrics.development.mdd]; }
    r.init = ls.portfolio.cash + ls.portfolio.holdings.reduce((a, h) => a + h.amt, 0);
    r.s = cl(s);
    cache.set(key, r);
    return r;
  }
  const J = (r, preset) => {
    const w = CAT.objective_presets[preset], sc = CAT.objective_scale, d = r.metrics.development;
    return w.net_return * d.cagr / sc.cagr - w.drawdown * Math.abs(d.mdd) / sc.mdd - w.turnover * d.trades_per_year / sc.trades_per_year;
  };
  const srcBadge = r => r.source === 'precomputed' ? '<span class="badge pre">사전 계산</span>'
    : r.source === 'live_trained' ? '<span class="badge live">실시간 학습</span>' : '<span class="badge live">실시간 · 모델 재사용</span>';

  /* ---------- 차트 ---------- */
  const charts = {};
  let chartSeq = 0;
  function lineChart(dates, series, opt = {}) {
    const id = 'c' + (++chartSeq), W = 440, H = opt.h || 230, L = 46, R = 58, T = 12, B = 22;
    const tf = opt.log ? Math.log : (v => v), inv = opt.log ? Math.exp : (v => v);
    const all = series.flatMap(s => s.values).map(tf), lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.06 || 1, y0 = lo - pad, y1 = hi + pad;
    const x = i => L + (W - L - R) * i / (dates.length - 1), y = v => T + (H - T - B) * (1 - (tf(v) - y0) / (y1 - y0));
    const fmt = opt.fmt || (v => v.toFixed(0));
    const ticks = [0, 1, 2, 3].map(i => inv(y0 + (y1 - y0) * (i + 0.5) / 4));
    let g = ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${fmt(t)}</text>`).join('');
    const yrs = [];
    dates.forEach((d, i) => { if (i && d.slice(0, 4) !== dates[i - 1].slice(0, 4)) yrs.push([i, d.slice(2, 4)]); });
    g += yrs.filter((_, i) => i % Math.ceil(yrs.length / 5) === 0).map(([i, t]) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="var(--muted)">'${t}</text>`).join('');
    if (opt.split) {
      const si = dates.findIndex(d => d >= opt.split);
      if (si > 0) g += `<line x1="${x(si)}" x2="${x(si)}" y1="${T}" y2="${H - B}" stroke="var(--axis)" stroke-dasharray="3 3"/><text x="${x(si) + 4}" y="${T + 10}" font-size="10" fill="var(--muted)">최종 평가 구간</text>`;
    }
    if (opt.base != null) g += `<line x1="${L}" x2="${W - R}" y1="${y(opt.base)}" y2="${y(opt.base)}" stroke="var(--axis)" stroke-width="1"/>`;
    const ends = series.map(s => ({ s, y: y(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
    const paths = series.map(s => `<path d="${s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('')}" fill="none" stroke="${s.color}" stroke-width="${s.main ? 2.4 : 1.4}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`).join('');
    const labels = ends.map(e => `<text x="${W - R + 5}" y="${e.y + 4}" font-size="10.5" fill="var(--ink2)">${esc(e.s.short || e.s.name)}</text>`).join('');
    charts[id] = { dates, series, x, y, L, R, W, H, T, B, fmt };
    const legend = `<div class="legend">${series.map(s => `<span><i style="border-top-color:${s.color};border-top-style:${s.dash ? 'dashed' : 'solid'}"></i>${esc(s.name)}</span>`).join('')}</div>`;
    return `${legend}<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || '추이 차트')}">${g}${paths}${labels}<line class="cross" y1="${T}" y2="${H - B}" stroke="var(--ink2)" stroke-width="1" style="display:none"/></svg><div class="tip"></div></div>`;
  }
  function chartMove(el, ev) {
    const c = charts[el.dataset.chart]; if (!c) return;
    const rect = el.getBoundingClientRect(), px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) / rect.width * c.W;
    const i = Math.max(0, Math.min(c.dates.length - 1, Math.round((px - c.L) / (c.W - c.L - c.R) * (c.dates.length - 1))));
    const cross = $('.cross', el), tip = $('.tip', el);
    cross.setAttribute('x1', c.x(i)); cross.setAttribute('x2', c.x(i)); cross.style.display = '';
    tip.innerHTML = `<b>${c.dates[i]}</b><br>` + c.series.map(s => `${esc(s.short || s.name)} <b>${c.fmt(s.values[i])}</b>`).join('<br>');
    tip.style.display = 'block';
    tip.style.left = Math.max(70, Math.min(rect.width - 70, c.x(i) / c.W * rect.width)) + 'px'; tip.style.top = '40px';
  }
  const chartLeave = el => { $('.cross', el).style.display = 'none'; $('.tip', el).style.display = 'none'; };

  /* ---------- 화면 조각 ---------- */
  const header = () => `<header class="top">${S.mode ? '<button class="back" data-act="home" aria-label="처음으로">‹</button>' : ''}<img class="logo" src="logo.png" alt="키움증권" data-act="home"><h1 data-act="home">나만의 AI를 키움</h1></header>`;
  const ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>',
    set: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 19h16M7 15l4-5 3 3 5-7"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 20V6M6 11l6-6 6 6"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01"/></svg>',
  };
  const stage = m => /^\[자료/.test(m) ? '학습 자료 수신' : /^\[설정/.test(m) ? '투자 기준 확인' : /재사용/.test(m) ? '기존 모델 확인' : /학습/.test(m) ? '모델 학습' : /가상 체결/.test(m) ? '가상 운용 검증' : /후보|연구 계획|제외/.test(m) ? '개선 후보 비교' : '계산 준비';
  const tabs = () => !S.mode ? '' : `<nav class="tabs"><div>${(S.mode === 'qs' ? [['create', '연구', 'set'], ['validate', '검증', 'chart'], ['optimize', '최적화', 'up'], ['versions', '버전', 'list']] : [['validate', '홈', 'home'], ['create', '설정', 'set'], ['optimize', '개선', 'up'], ['versions', '기록', 'list']])
    .map(([k, l, ic]) => `<button data-act="tab" data-v="${k}" aria-current="${S.tab === k}">${ICON[ic]}<span>${l}</span></button>`).join('')}</div></nav>`;
  const disclosures = () => `<details class="disc"><summary>투자 유의 사항</summary><ul>${CAT.disclosures.map(d => `<li>${esc(d)}</li>`).join('')}<li>ETF·선물·옵션·미국 주식은 실제 일별 종가 기준이며 분배금, 선물·옵션 계약 단위와 증거금 미반영</li><li>과제 시연용 화면이며 키움증권의 실제 서비스가 아님</li></ul>
    데이터: ${esc(CAT.data.source)} · ${CAT.data.start}~${CAT.data.end}</details>`;

  function landing() {
    const f = S.forked;
    return `${header()}<div class="land">
      <div class="intro"><h2>직접 학습시키는 나의 투자 AI</h2>
        <p class="sub">투자 성향, 상품 유형, 자산 현황, 본인 판단 반영 맞춤형 전략</p>
        <p class="muted">신입사원 과제 시연용 화면이며 키움증권의 실제 서비스가 아님</p></div>
      ${f ? recipeCard(f.spec, '<button class="btn small" data-act="fork">설정 복제 후 수정</button>', '공유받은 설정') : ''}
      <div class="card steps"><h3>이용 순서</h3>
        <div class="kv"><span>01 나의 기준 입력</span><span>성향, 상품, 자산, 판단</span></div>
        <div class="kv"><span>02 AI 학습·전략 제시</span><span>실제 과거 데이터 검증, 적합 판정</span></div>
        <div class="kv"><span>03 AI 개선</span><span>후보 비교, 채택 판정</span></div>
        </div>
      <div class="card start"><button class="btn" data-act="acct">키움증권 계좌로 시작</button>
        <p class="sub" style="margin:8px 2px 16px">보유 자산 반영, 거래 내역 학습, 자동 주문, 운용 보고서</p>
        <button class="btn ghost" data-act="mode" data-v="my">${S.cur ? '나의 AI 조회' : '계좌 없이 시작'}</button>
        <p class="sub" style="margin:8px 2px 0">AI 학습, 과거 데이터 검증, 설정 공유</p>
        ${S.acct ? `<div class="note" style="margin-top:14px"><b>계좌 연결 후 제공 기능</b><br>보유 종목·현금 기준 AI 학습<br>나의 거래 내역 기반 학습<br>자동 매수·매도(주문 한도, 주문 전 승인)<br>주간·월간 운용 보고서<br><span class="muted">시연 화면은 계좌 연결 미지원. 계좌 없이 시작으로 체험 가능</span></div>` : ''}</div>
      <details class="card info" ${window.matchMedia('(min-width:1000px)').matches ? 'open' : ''}><summary>서비스 안내</summary>
        <div class="kv"><span>설정 항목</span><span>${N_REAL}개, 전 항목 실제 데이터 계산, 규칙 직접 입력</span></div>
        <div class="kv"><span>검증 방식</span><span>실제 과거 시세, 거래 비용 반영</span></div>
        <div class="kv"><span>사용 데이터</span><span>실제 일별 시세 ${CAT.data.start.slice(0, 4)}~${CAT.data.end.slice(0, 7)}</span></div>
        <div class="kv"><span>이용 조건</span><span>계좌 개설 불필요, 주문 미연결</span></div>
        <div class="kv"><span>상품 범위</span><span>국내주식, 국내 ETF(채권·해외 지수·금·달러·레버리지·인버스·커버드콜), 미국 주식, 코스피200 선물·옵션</span></div>
        <div class="kv"><span>학습 자료</span><span>시세, 투자자별 수급, 업종·테마, 공시·시장경보, 해외 지수·환율</span></div>
        <div class="kv"><span>시연 범위</span><span>설정 변경 시 화면에서 직접 학습·가상 운용</span></div></details></div>
      ${disclosures()}`;
  }

  /* ---------- 설정 항목 ----------
     전 항목을 실제 자료로 브라우저에서 계산한다. */
  const R = (act, k, v, l, o = {}) => ({ real: 1, act, k, v, l, b: 1, ...o });
  const X = (id, l, o = {}) => ({ id, l, ...o });
  const L = (rg, l) => ({ real: 1, act: 'lock', rg, l });
  const N = (def, unit, min, max, o = {}) => ({ num: { def, unit, min, max }, live: 1, ...o });
  const DV = ['p_fut', 'p_futd', 'p_put', 'p_call', 'p_cc', 'p_lev', 'p_inv', 'p_inv2'];
  const PRODX = { p_k200: 'E069500', p_rp: 'E153130', p_bond: 'E114260', p_bond10: 'E148070', p_usb: 'E305080', p_us: 'E143850', p_nas: 'E133690', p_gold: 'E132030', p_usd: 'E261240', p_cc: 'E289480', p_lev: 'E122630', p_inv: 'E114800', p_inv2: 'E252670' };
  const UNI = { all: '거래대금 상위 300종목', kospi: '코스피 종목 한정', top200: '시가총액 상위 200종목', top100: '시가총액 상위 100종목', sector: '관심 업종 한정', watch: '관심 종목 한정' };
  const WT = { eq: '동일 비중', score: '점수 순위 비례', ivol: '변동성 역비례' };
  const BEL = [['상승 추세 종목 선호', { mom_60: 1, mom_120: 1, high252_ratio: 1 }, []], ['단기 낙폭 과대 종목 선호', { mom_5: -1, ma20_gap: -1 }, []],
    ['저변동 종목 선호', { vol_60: -1, downside_vol_60: -1 }, ['risk']], ['대형주 선호', { log_marcap: 1 }, ['size']], ['거래 활발 종목 선호', { turnover20: 1, log_amt20: 1 }, ['volume']],
    ['외국인 순매수 종목 선호', { frgn_5: 1, frgn_20: 1 }, ['flow']], ['기관 순매수 종목 선호', { inst_5: 1, inst_20: 1 }, ['flow']], ['강세 업종 종목 선호', { ind_ret_20: 1 }, ['sector']]];
  const belOn = (s, m) => Object.entries(m).every(([f, v]) => (s.belief || {})[f] === v);
  const nameOf = c => { const M = LM(), i = M ? M.codes.indexOf(c) : -1; return i >= 0 ? M.names[i] : c; };
  const prodOf = id => { const M = LM(); return M ? M.products.find(p => p.id === id) : null; };
  const stockBox = (key, label, amt) => {
    if (!LM()) return `<p class="muted">${label}: 종목 목록 수신 중</p>`;
    const list = S.spec[key] || [];
    return `<div class="stk"><label class="f">${label}</label><div class="stkrow"><input type="text" list="stklist" id="stk_${key}" placeholder="종목명 입력" autocomplete="off" aria-label="${label}">
      ${amt ? `<span class="num"><input type="number" id="stka_${key}" value="500" min="1" inputmode="numeric" aria-label="보유 금액">만 원</span>` : ''}<button class="btn ghost small" data-act="stkadd" data-v="${key}">추가</button></div>
      ${list.length ? `<div class="chips">${list.map((x, i) => `<button class="chip" aria-pressed="true" data-act="stkdel" data-k="${key}" data-v="${i}">${esc(nameOf(amt ? x.code : x))}${amt ? ' ' + man(x.amt) : ''} 삭제</button>`).join('')}</div>` : ''}</div>`;
  };
  const pickBox = (key, label, opts, pct) => {
    if (!LM()) return `<p class="muted">${label}: 목록 수신 중</p>`;
    const list = S.spec[key] || [];
    return `<div class="stk"><label class="f">${label}</label><div class="stkrow"><select id="pk_${key}" aria-label="${label}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
      ${pct ? `<span class="num"><input type="number" id="pka_${key}" value="10" min="1" max="100" inputmode="numeric" aria-label="비중">%</span>` : ''}<button class="btn ghost small" data-act="pkadd" data-v="${key}">추가</button></div>
      ${list.length ? `<div class="chips">${list.map((x, i) => `<button class="chip" aria-pressed="true" data-act="stkdel" data-k="${key}" data-v="${i}">${esc(pct ? (prodOf(x.id) || {}).name + ' ' + x.pct + '%' : x)} 삭제</button>`).join('')}</div>` : ''}</div>`;
  };
  const featBox = s => {
    const M = LM(); if (!M) return '<p class="muted">변수 목록 수신 중</p>';
    const all = M.features.filter(f => s.groups.some(g => (M.groups[g] || []).includes(f)));
    return `<details class="sub2"><summary>변수별 선택(${featsOf(s).length}/${all.length}개 사용)</summary><div class="chips">${all.map(f => `<button class="chip sm" data-act="feat" data-v="${f}" aria-pressed="${!(s.exf || []).includes(f)}">${esc(M.feature_labels[f])}</button>`).join('')}</div></details>`;
  };
  const P = (id, l, def, o = {}) => X(id, l + ' 비중', N(def, '%', 1, 100, o));
  const SEC = [
    { id: 'me', l: '성향·자산', d: '투자 성향과 자산 현황', g: [
      { t: '투자 성향', items: Object.keys(PRESET).map(k => R('set', 'preset', k, PRESET[k])), n: '전략 후보 비교 시 우선순위 기준' },
      { t: '투자 경험', items: [X('exp1', '1년 미만', { rg: 'exp', live: 1 }), X('exp2', '1~5년', { rg: 'exp', live: 1 }), X('exp3', '5년 이상', { rg: 'exp', live: 1 })], n: '1년 미만 선택 시 파생상품·레버리지 상품 선택 제한' },
      { t: '자산 현황', wide: 1, items: [], extra: () => stockBox('holdings', '보유 종목 입력', true), n: '입력한 보유 종목은 실제 시세로 검증 기간 계속 보유 기준 반영, AI 선정 대상에서 제외' },
      { t: '손실 감내 수준', items: [X('tol', '연간 손실 허용 한도', N(10, '%', 1, 100))], n: '검증 기간 중 연간 손실이 한도를 초과한 설정은 부적합 판정' },
    ] },
    { id: 'prod', l: '투자 상품', d: '전략에 포함할 상품 유형', g: [
      { t: '국내주식', items: [L('prodbase', '국내주식(AI 선정)'), P('p_k200', 'KODEX 200', 20)] },
      { t: '현금성·채권', items: [P('p_rp', 'KODEX 단기채권', 30, { b: 1 }), P('p_bond', 'KODEX 국고채3년', 20), P('p_bond10', 'KIWOOM 국고채10년', 20, { b: 1 }), P('p_usb', 'TIGER 미국채10년선물', 10)] },
      { t: '해외주식', wide: 1, items: [P('p_us', 'TIGER 미국S&P500선물(H)', 20, { b: 1 }), P('p_nas', 'TIGER 미국나스닥100', 20)],
        extra: () => pickBox('usst', '미국 주식 직접 편입', (LM().products || []).filter(p => p.cat === '해외주식').map(p => [p.id, `${p.name}(${p.code})`]), true), n: '미국 주식은 직전 미국 장 종가와 당일 원/달러 환율 기준 원화 환산' },
      { t: '원자재·통화', items: [P('p_gold', 'KODEX 골드선물(H)', 10, { b: 1 }), P('p_usd', 'KODEX 미국달러선물', 10)] },
      { t: '파생상품·레버리지', wide: 1, items: [X('p_fut', '코스피200 선물 매도 헤지(상시)', N(50, '%', 1, 100, { rg: 'fut', b: 1 })), X('p_futd', '코스피200 선물 매도 헤지(하락장 한정)', N(50, '%', 1, 100, { rg: 'fut' })),
        X('p_put', '코스피200 풋옵션 매수', N(100, '%', 1, 100, { b: 1 })), X('p_call', '코스피200 콜옵션 매도', N(100, '%', 1, 100)), P('p_cc', 'TIGER 200커버드콜', 20), P('p_lev', 'KODEX 레버리지', 20), P('p_inv', 'KODEX 인버스', 10), P('p_inv2', 'KODEX 200선물인버스2X', 10)],
        n: '전 상품 실제 일별 시세 기준. 선물·옵션 비율은 주식 평가금액 대비이며 자료 기간(선물 2022년 3월 이후, 옵션 2024년 3월 이후)에 한해 적용. 투자 경험 1년 미만 선택 제한' },
    ] },
    { id: 'data', l: '데이터', d: 'AI가 학습할 자료', g: [
      { t: '시세·거래', wide: 1, items: [R('grp', '', 'price', '가격 흐름(필수)'), R('grp', '', 'volume', '거래량'), R('grp', '', 'risk', '하락 위험'), R('grp', '', 'size', '기업 규모'), R('grp', '', 'trend', '장기 추세', { b: 0 }), R('grp', '', 'pattern', '급등·갭 이력', { b: 0 }), R('grp', '', 'beta', '시장 민감도', { b: 0 }), R('grp', '', 'age', '상장 경과', { b: 0 })] },
      { t: '수급·업종·공시', wide: 1, items: [R('grp', '', 'flow', '투자자별 수급'), R('grp', '', 'sector', '업종·테마 동향'), R('grp', '', 'disc', '공시·시장경보')], extra: s => featBox(s),
        n: '외국인·기관·개인 순매수 2022년 이후, 외국인 보유율 2019년 이후 자료. 자료가 없는 기간과 종목은 해당 변수 미반영. 업종·테마는 수집 시점 구성 기준' },
    ] },
    { id: 'model', l: '모델', d: '학습 방식과 예측 대상', g: [
      { t: '학습 방식', items: [R('set', 'algo', 'ridge', '선형 회귀(Ridge)'), R('set', 'algo', 'lightgbm', '트리 기반(LightGBM)')],
        n: '선형 회귀는 화면에서 즉시 학습. 트리 기반은 가격·거래량·위험·규모 조합, 약 1주·약 1개월 예측에 한해 사전 학습 결과 사용' },
      { t: '예측 기간', items: [R('set', 'h', 5, '약 1주'), R('set', 'h', 10, '약 2주'), R('set', 'h', 20, '약 1개월'), R('set', 'h', 60, '약 3개월')], n: '예측 기간과 보유 기간 동일 적용' },
      { t: '학습 목표', items: [R('set', 'target', 'ret', '수익률 크기'), R('set', 'target', 'up', '대상 종목 평균 초과 여부')] },
      { t: '규제 강도', items: [R('set', 'alpha', 1, '약함'), R('set', 'alpha', 100, '기본'), R('set', 'alpha', 10000, '강함')], n: '선형 회귀 적용 항목. 강할수록 변수별 반영 비중 차이 축소' },
      { t: '학습 구간', items: [R('set', 'win', 4, '직전 4년'), R('set', 'win', 2, '직전 2년'), R('set', 'win', 0, '전체 기간')], n: '선형 회귀 적용 항목' },
    ] },
    { id: 'op', l: '운용', d: '종목 선정과 매매 방식', g: [
      { t: '보유 기간', items: [R('set', 'h', 5, '약 1주'), R('set', 'h', 10, '약 2주'), R('set', 'h', 20, '약 1개월'), R('set', 'h', 60, '약 3개월')], hideAdv: 1 },
      { t: '종목 수', items: [R('set', 'k', 3, '3종목'), R('set', 'k', 5, '5종목'), R('set', 'k', 10, '10종목'), R('set', 'k', 20, '20종목'), R('set', 'k', 30, '30종목')] },
      { t: '교체 방식', items: [R('set', 'buf', 1, '정기 교체'), R('set', 'buf', 3, '보유 유지 우선')] },
      { t: '비중 배분', items: Object.keys(WT).map(k => R('set', 'wt', k, WT[k])) },
      { t: '체결 시점', items: [R('set', 'ex', 'open', '익일 시가'), R('set', 'ex', 'close', '익일 종가')] },
      { t: '대상 종목', wide: 1, items: Object.keys(UNI).map(k => R('set', 'uni', k, UNI[k])),
        extra: () => pickBox('inds', '관심 업종', (LM().industries || []).map(n => [n, n]), false) + stockBox('only', '관심 종목', false) + stockBox('excl', '제외 종목', false) },
      { t: '가상 투자금', items: [R('set', 'cash', 1000000, '100만 원'), R('set', 'cash', 5000000, '500만 원'), R('set', 'cash', 10000000, '1,000만 원'), R('set', 'cash', 50000000, '5,000만 원'), R('set', 'cash', 100000000, '1억 원')] },
    ] },
    { id: 'risk', l: '위험 관리', d: '손실 한도와 회피 조건', g: [
      { t: '회피 조건', items: [R('tog', 'vf', '', '변동성 큰 종목 제외'), X('nonew', '상장 1년 미만 종목 제외', { live: 1 }), X('noalert', '최근 20일 시장경보 지정 종목 제외', { live: 1 })] },
      { t: '신규 매수 중단 조건', wide: 1, items: [R('tog', 'mf', '', '코스피 60일 평균 하회'), X('nas', '직전 미국 나스닥 하락률', N(2, '% 이상', 0.5, 10)), X('vix', '미국 변동성 지수(VIX)', N(30, '이상', 10, 80)), X('fx', '원/달러 환율 20일 상승률', N(3, '% 이상', 1, 20))], n: '교체 결정일 기준 조건 충족 시 신규 매수 생략' },
      { t: '손실·이익 기준', items: [X('stop', '종목별 손절 기준', N(10, '%', 1, 50)), X('take', '종목별 이익 실현 기준', N(20, '%', 1, 200)), X('daily', '일일 손실 한도(전량 매도)', N(5, '%', 1, 30)), X('floor', '원금 보호선(도달 시 운용 중단)', N(70, '%', 10, 100))], n: '종가 기준 판정, 다음 거래일 매도' },
      { t: '편중 제한', items: [X('wcap', '종목당 비중 상한', N(15, '%', 1, 100)), X('scap', '업종당 비중 상한', N(40, '%', 1, 100))] },
    ] },
    { id: 'mine', l: '나의 판단', d: '직접 입력하는 판단과 규칙', g: [] },
  ];
  const GG = (sec, t) => SEC.find(x => x.id === sec).g.find(g => g.t === t);
  const XI = {};
  SEC.forEach(sc => sc.g.forEach(g => g.items.forEach(i => { if (!i.real) XI[i.id] = { ...i, sec: sc.id, t: g.t }; })));
  const N_REAL = SEC.flatMap(sc => sc.g).filter(g => !g.hideAdv).flatMap(g => g.items).filter(i => (i.real && i.act !== 'lock') || i.live).length + 6;
  const xLabel = (s, id) => XI[id].l + (XI[id].num ? ' ' + ((s.xv || {})[id] ?? XI[id].num.def) + XI[id].num.unit : '');
  const xNames = s => (s.x || []).filter(id => XI[id] && !XI[id].live).map(id => xLabel(s, id));
  const nPlan = () => 0;
  const prodList = s => ['국내주식', ...(s.x || []).filter(id => XI[id] && XI[id].live && XI[id].sec === 'prod').map(id => xLabel(s, id).replace(' 비중', '')), ...(s.usst || []).map(x => `${(prodOf(x.id) || { name: x.id }).name} ${x.pct}%`), (s.holdings || []).length ? `보유 종목 ${s.holdings.length}개` : null].filter(Boolean);
  const condList = s => [s.buf > 1 ? '보유 종목 교체 축소' : null, s.vf > 0 ? '변동성 큰 종목 제외' : null, s.mf ? '하락장 신규 매수 중단' : null,
    ...(s.x || []).filter(id => XI[id] && XI[id].live && XI[id].sec === 'risk').map(id => xLabel(s, id)), (s.excl || []).length ? `제외 종목 ${s.excl.length}개` : null, s.uni === 'sector' && (s.inds || []).length ? `관심 업종 ${s.inds.length}개` : null].filter(Boolean);
  const belCount = s => Object.entries(s.belief || {}).filter(([f, v]) => v && (!LM() || featsOf(s).includes(f))).length;
  const judgeList = s => [belCount(s) ? `변수 방향 지정 ${belCount(s)}개` : null, (s.rules || []).length ? `규칙 ${s.rules.length}건` : null].filter(Boolean);

  function itemChip(i, s) {
    if (i.real) {
      if (i.act === 'grp') return `<button class="chip" data-act="grp" data-v="${i.v}" aria-pressed="${s.groups.includes(i.v)}" ${i.v === 'price' ? 'data-lock="1"' : ''}>${i.l}</button>`;
      if (i.act === 'tog') return `<button class="chip" data-act="tog" data-k="${i.k}" aria-pressed="${i.k === 'vf' ? s.vf > 0 : !!s.mf}">${i.l}</button>`;
      if (i.act === 'lock') return `<button class="chip" data-act="xclr" data-v="${i.rg}" aria-pressed="${!(s.x || []).some(id => XI[id] && XI[id].rg === i.rg)}">${i.l}</button>`;
      const on = i.k === 'buf' ? (i.v > 1 ? s.buf > 1 : s.buf === 1) : String(s[i.k]) === String(i.v);
      return `<button class="chip" data-act="set" data-k="${i.k}" data-v="${i.v}" aria-pressed="${on}">${i.l}</button>`;
    }
    const on = (s.x || []).includes(i.id);
    const num = i.num && on ? `<span class="num"><input type="number" inputmode="numeric" data-xv="${i.id}" min="${i.num.min}" max="${i.num.max}" value="${(s.xv || {})[i.id] ?? i.num.def}" aria-label="${i.l}">${i.num.unit}</span>` : '';
    return `<button class="chip ${i.live ? '' : 'x'}" data-act="x" data-v="${i.id}" aria-pressed="${on}">${i.l}${i.acct ? '<i>계좌</i>' : ''}</button>${num}`;
  }
  const groupCard = (g, s, basic) => {
    const items = basic ? g.items.filter(i => i.b) : g.items;
    return items.length || (g.extra && !basic) ? `<div class="card grp ${g.wide && !basic ? 'wide' : ''}"><h3>${g.t}</h3><div class="chips">${items.map(i => itemChip(i, s)).join('')}</div>${g.extra && !basic ? g.extra(s) : ''}${g.n ? `<p class="muted">${g.n}</p>` : ''}</div>` : '';
  };
  const belCard = (s, detail) => {
    const M = LM(), fs = M && detail ? featsOf(s) : [];
    return `<div class="card grp wide"><h3>나의 판단 반영</h3><div class="chips">${BEL.map((b, i) => `<button class="chip" data-act="belp" data-v="${i}" aria-pressed="${belOn(s, b[1])}">${b[0]}</button>`).join('')}</div>
      ${fs.length ? `<details class="sub2" ${belCount(s) ? 'open' : ''}><summary>변수별 방향 지정(${belCount(s)}개 지정)</summary><div class="bel">${fs.map(f => { const v = (s.belief || {})[f] || 0; return `<div><span>${esc(M.feature_labels[f])}</span><span class="seg3">${[[-1, '낮을수록 유리'], [0, '미지정'], [1, '높을수록 유리']].map(([x, l]) => `<button data-act="bel" data-k="${f}" data-v="${x}" aria-pressed="${v === x}">${l}</button>`).join('')}</span></div>`; }).join('')}</div></details>` : ''}
      <p class="muted">본인이 지정한 방향과 반대로 학습된 변수는 학습에서 제외. 선형 회귀 적용 항목</p></div>`;
  };
  const ruleCard = s => `<div class="card grp wide"><h3>나의 규칙 입력</h3>
      <textarea id="nl" placeholder="예: 외국인이 사는 종목 위주, 손절 7%, 삼성전자 제외, 나스닥 2% 넘게 빠지면 매수 중단, 국고채 20%"></textarea>
      <button class="btn ghost small" data-act="nl">규칙 추가</button>
      ${S.planNote ? `<div class="note">${S.planNote}</div>` : ''}
      ${(s.rules || []).length ? `<div class="rules">${s.rules.map((r, i) => `<div class="kv"><span>${esc(r)}</span><button class="del" data-act="rdel" data-v="${i}" aria-label="규칙 삭제">삭제</button></div>`).join('')}</div>` : ''}
      <p class="muted">문장 입력 가능. 손절·익절 기준, 종목 제외, 종목 수, 대상 종목, 상품 비중, 수급·업종 선호, 해외 시장 조건을 해석하여 계산 반영(규칙 기반 해석)</p></div>`;

  function createMy() {
    const s = S.spec, adv = !!S.adv, sec = SEC.find(x => x.id === (S.sec || 'me')) || SEC[0];
    const legend = `<p class="lg"><span><b class="dot on"></b>전 항목 실제 데이터 기준 계산</span></p>`;
    let main;
    if (!adv) {
      const bas = id => SEC.find(x => x.id === id).g.flatMap(g => g.items.filter(i => i.b || i.act === 'lock'));
      const wide = (h, items) => `<div class="card grp wide"><h3>${h}</h3><div class="chips">${items.map(i => itemChip(i, s)).join('')}</div></div>`;
      main = `<div class="gg">${groupCard(GG('me', '투자 성향'), s)}${groupCard(GG('me', '투자 경험'), s)}${wide('투자 상품', bas('prod'))}${wide('중시하는 정보', bas('data'))}
        ${groupCard(GG('op', '보유 기간'), s)}${groupCard(GG('op', '가상 투자금'), s, true)}<div class="card grp wide"><h3>자산 현황</h3>${stockBox('holdings', '보유 종목 입력', true)}<p class="muted">입력한 보유 종목은 실제 시세로 검증 기간 계속 보유 기준 반영, AI 선정 대상에서 제외</p></div>${belCard(s, false)}${ruleCard(s)}</div>`;
    } else if (sec.id === 'mine') {
      main = `<div class="gg">${belCard(s, true)}${ruleCard(s)}
        <div class="card grp wide"><h3>키움증권 계좌 개설 고객 제공 기능 <span class="badge">제안</span></h3>
        <div class="kv"><span>보유 종목·현금</span><span>실제 자산 기준 학습·검증</span></div>
        <div class="kv"><span>나의 거래 내역</span><span>본인 매매 기록 기반 학습</span></div>
        <div class="kv"><span>자동 주문</span><span>주문 한도, 주문 전 승인</span></div>
        <div class="kv"><span>운용 보고서</span><span>주간·월간 성과, 개선 제안</span></div>
        <p class="muted">계좌 개설 고객 대상, 준법 검토 전제</p></div></div>`;
    } else main = `<div class="gg">${sec.g.filter(g => !g.hideAdv).map(g => groupCard(g, s)).join('')}</div>`;
    const M = LM(), dl = M ? `<datalist id="stklist">${M.names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>` : '';
    const cnt = id => (s.x || []).filter(x => XI[x] && XI[x].sec === id).length + (id === 'mine' ? (s.rules || []).length + belCount(s) : 0);
    const nav = adv ? `<div class="secnav">${SEC.map(x => `<button data-act="sec" data-v="${x.id}" aria-current="${x.id === sec.id}"><b>${x.l}</b><span>${x.d}</span>${cnt(x.id) ? `<em>${cnt(x.id)}</em>` : ''}</button>`).join('')}</div>` : '';
    return `<div class="sethead"><div><h2>나의 투자 AI 학습 설정</h2><p class="sub">${adv ? '성향·자산, 투자 상품, 데이터, 모델, 운용, 위험 관리, 나의 판단 직접 구성' : '투자 성향, 투자 상품, 자산 현황, 나의 판단 입력'}</p></div>
      <div class="seg"><button data-act="lvl" data-v="0" aria-pressed="${!adv}">일반</button><button data-act="lvl" data-v="1" aria-pressed="${adv}">고급</button></div></div>
      <div class="setwrap ${adv ? 'adv' : 'basic'}">${nav}<div class="setmain">${legend}${main}${dl}</div>
      <div class="side">${planCard()}<div class="cta"><button class="btn" data-act="run">${S.cur ? '변경 기준 재학습' : 'AI 학습 시작'}</button></div></div></div>`;
  }
  const planCard = () => {
    const s = S.spec;
    if (S.mode === 'my') return `<div class="card"><h3>구성 요약</h3>
      <div class="kv"><span>투자 성향</span><span>${PRESET[s.preset || 'balanced']}</span></div>
      <div class="kv"><span>투자 상품</span><span>${prodList(s).join(', ')}</span></div>
      <div class="kv"><span>대상</span><span>${UNI[s.uni || 'all']}</span></div>
      <div class="kv"><span>반영 정보</span><span>${s.groups.map(g => SHORT[g]).join('·')}${LM() ? ` (변수 ${featsOf(s).length}개)` : ''}</span></div>
      <div class="kv"><span>운용</span><span>점수 상위 ${s.k}종목, ${HL[s.h]} 주기 교체, ${WT[s.wt || 'eq']}</span></div>
      ${condList(s).map(t => `<div class="kv"><span>위험 조건</span><span>${t}</span></div>`).join('')}
      ${judgeList(s).length ? `<div class="kv"><span>나의 판단</span><span>${judgeList(s).join(', ')}</span></div>` : ''}
      ${xon(s, 'tol') ? `<div class="kv"><span>손실 허용 한도</span><span>연 ${xval(s, 'tol')}%</span></div>` : ''}
      <div class="kv"><span>가상 투자금</span><span>${man(s.cash)}</span></div>
      <div class="kv"><span>검증 기간</span><span>${CAT.periods.development[0].slice(0, 4)}~${CAT.periods.development[1].slice(0, 4)}년</span></div>
      <div class="kv"><span>거래 비용</span><span>수수료·세금·슬리피지 반영</span></div>
      ${nPlan(s) ? `<h3 style="margin-top:18px">설계안 선택 항목 <span class="badge">${nPlan(s)}개</span></h3>
      ${SEC.map(sc => { const n = (s.x || []).filter(id => XI[id] && !XI[id].live && XI[id].sec === sc.id); return n.length ? `<div class="kv"><span>${sc.l}</span><span>${n.map(id => xLabel(s, id)).join(', ')}</span></div>` : ''; }).join('')}
      ${(s.rules || []).length ? `<div class="kv"><span>나의 규칙</span><span>${s.rules.length}건</span></div>` : ''}
      <p class="muted">설계안 항목은 자료 미확보로 선택 내용 기록 대상</p>` : ''}
      ${S.adv ? `<div class="kv"><span>학습 방식</span><span>${s.algo === 'ridge' ? '선형 회귀(Ridge)' : '트리 기반(LightGBM)'}, 연 단위 전진 분석</span></div>
      <div class="kv"><span>학습 구간</span><span>${s.win === 0 ? '검증 연도 이전 전체 기간' : `검증 연도 직전 ${s.win || 4}년`}</span></div>
      <div class="kv"><span>체결 기준</span><span>결정일 ${s.ex === 'close' ? '익일 종가' : '익일 시가'}(일봉)</span></div>
      <div class="kv"><span>수수료</span><span>매수·매도 0.015%</span></div>
      <div class="kv"><span>거래세</span><span>매도 0.20%</span></div>
      <div class="kv"><span>슬리피지</span><span>편도 0.10%</span></div>
      <div class="kv"><span>배당</span><span>미반영(자료 미확보)</span></div>
      <div class="kv"><span>호가·체결량</span><span>미반영(일봉 자료)</span></div>` : ''}</div>`;
    return `<div class="card"><h3>연구 계획</h3>
      <div class="plan">국내주식 거래대금 상위 300종목 대상, <b>${s.groups.map(g => GL()[g]).join('·')}</b> 정보 기반 <b>${s.h}거래일 후 수익률</b> 예측 모델 학습.
      ${s.h}거래일 주기로 점수 상위 <b>${s.k}종목</b> 익일 시가 가상 매수. ${man(s.cash)} 기준 ${CAT.periods.development[0].slice(0, 4)}~${CAT.periods.development[1].slice(0, 4)}년 검증, ${CAT.periods.locked_final[0].slice(0, 4)}년 이후 별도 평가</div>
      <p class="muted">${esc(CAT.cost_models.kr_default.label)}</p></div>`;
  };

  function createQs() {
    const s = S.spec, G = CAT.grid;
    const opt = (k, vals, lab) => `<select data-act="sel" data-k="${k}">${vals.map(v => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${lab(v)}</option>`).join('')}</select>`;
    return `<h2>연구 설정</h2>
      <div class="card"><h3>1. 데이터·변수</h3>
        <div class="chips">${Object.entries(CAT.feature_groups).map(([g, v]) => `<button class="chip" data-act="grp" data-v="${g}" aria-pressed="${s.groups.includes(g)}" ${g === 'price' ? 'data-lock="1"' : ''}>${v.label} (${v.features.length})</button>`).join('')}</div>
        <details><summary>변수 ${s.groups.reduce((n, g) => n + CAT.feature_groups[g].features.length, 0)}개</summary>
          <p class="sub">${s.groups.flatMap(g => CAT.feature_groups[g].features.map(f => esc(f.label))).join(', ')}</p></details>
        <p class="muted">미지원: ${Object.values(CAT.unavailable).map(esc).join(' / ')}</p></div>
      <div class="card"><h3>2. 예측 대상·모델</h3>
        <label class="f">예측 대상(결정일 익일 시가 진입 후 N거래일 뒤 시가 청산 수익률)</label>${opt('h', CAT.horizons, v => v + '거래일')}
        <label class="f">알고리즘</label>${opt('algo', Object.keys(CAT.algorithms), v => v === 'ridge' ? 'Ridge 회귀(기준 모델)' : 'LightGBM')}
        <p class="muted">초매개변수 고정: ${esc(JSON.stringify(CAT.algorithms[s.algo]))} · 난수 시드 42 · 연 단위 전진 분석(Walk-forward), 최근 4년 학습, 예측 대상 종료일 기준 표본 분리(purge)</p></div>
      <div class="card"><h3>3. 전략·포트폴리오</h3>
        <label class="f">보유 종목 수</label>${opt('k', G.k, v => '상위 ' + v + '종목')}
        <label class="f">교체 규칙</label>${opt('buf', G.buf, v => v > 1 ? '상위 3배수 이내 보유 유지' : '매회 상위 종목으로 교체')}
        <label class="f">변동성 필터</label>${opt('vf', G.vf, v => v > 0 ? '60일 변동성 상위 30% 제외' : '없음')}
        <label class="f">시장 필터</label>${opt('mf', G.mf, v => String(v) === 'true' ? '시장 지수 60일 평균 하회 시 신규 매수 중단' : '없음')}
        <label class="f">가상 투자금</label>${opt('cash', G.cash, v => man(+v))}
        <label class="f">목적함수 가중치</label>${opt('preset', Object.keys(CAT.objective_presets), v => ({ balanced: '균형', return: '수익 우선', low_risk: '낙폭 최소화', low_trading: '거래 횟수 최소화' }[v]) + ' ' + JSON.stringify(Object.values(CAT.objective_presets[v])))}
        <p class="muted">J = a·(연환산 순수익률/20%) − b·(|최대 낙폭|/30%) − c·(연 거래 횟수/200) · 검증 구간 기준, 정규화 기준 고정</p></div>
      <details class="card"><summary>ResearchSpec (JSON)</summary><pre class="json">${esc(JSON.stringify(toSpec(s, 'qs'), null, 1))}</pre></details>
      <div class="cta"><button class="btn" data-act="run">연구 실행</button></div>`;
  }

  function busyView() {
    if (S.mode === 'qs') return `<div class="card"><h3><span class="spinner"></span>${esc(S.busy)}</h3>
      <div class="log" id="log">${S.logs.map(esc).join('\n')}</div>
      <p class="muted">${LIVE ? '서버에서 계산 중' : '사전 실행 학습 기록 재생'}</p></div>`;
    return `<div class="busy"><span class="spinner big"></span><h2>${esc(S.busy)}</h2>
      <p class="sub" id="log" data-last="1">${esc(stage(S.logs[S.logs.length - 1] || ''))}</p><div class="pbar"><span></span></div>
      <p class="muted">실제 과거 시세 기반, 화면에서 직접 계산</p></div>`;
  }

  function benchRow(name, m) { return `<tr><td>${name}</td><td class="${cls(m.cagr)}">${pct(m.cagr)}</td><td>${pct(m.mdd)}</td><td>${m.sharpe_rf0 ?? '–'}</td><td>${m.trades_per_year != null && m.n_trades ? m.trades_per_year : '–'}</td></tr>`; }

  function validateView() {
    const r = S.cur; if (!r) return `<div class="card"><p>${S.mode === 'qs' ? '연구 실행' : '학습 실행'} 후 조회 가능</p><button class="btn small" data-act="tab" data-v="create">설정 화면 이동</button></div>`;
    const d0 = r.metrics.development, f = r.metrics.locked_final, qs = !!S.adv;
    const Y0 = +CAT.periods.development[0].slice(0, 4), Y1 = +CAT.periods.development[1].slice(0, 4);
    const P = S.period || { a: Y0, b: Y1 }, custom = !!r.yearly && !(P.a === Y0 && P.b === Y1);
    let d = d0, s = r.series, mkc = r.benchmarks.market.dev.cagr;
    if (custom) {
      const ys = r.yearly.filter(y => y.year >= P.a && y.year <= P.b), yrs = ys.reduce((n, y) => n + y.days, 0) / 252;
      const tot = ys[ys.length - 1].end_value / ys[0].start_value - 1, mt = ys.reduce((m, y) => m * (1 + y.market), 1) - 1;
      const idx = r.series.dates.map((x, i) => i).filter(i => +r.series.dates[i].slice(0, 4) >= P.a && +r.series.dates[i].slice(0, 4) <= P.b);
      const C0 = r.init || r.s.cash, k0 = C0 / r.series.strategy[idx[0]], cut = a => idx.map(i => a[i]);
      s = { dates: cut(r.series.dates), strategy: cut(r.series.strategy).map(v => v * k0), market: cut(r.series.market).map(v => v * C0 / r.series.market[idx[0]]), universe: cut(r.series.universe).map(v => v * C0 / r.series.universe[idx[0]]) };
      let pk = -1, mdd = 0, pi = 0, a = 0, b = 0;
      s.strategy.forEach((v, i) => { if (v > pk) { pk = v; pi = i; } const x = v / pk - 1; if (x < mdd) { mdd = x; a = pi; b = i; } });
      const nt = ys.reduce((n, y) => n + y.n_trades, 0);
      d = { from: String(P.a), to: String(P.b), start_value: C0, end_value: C0 * (1 + tot), total_return: tot, cagr: Math.pow(1 + tot, 1 / yrs) - 1, mdd, mdd_peak: s.dates[a], mdd_trough: s.dates[b], mdd_recovered: null, custom: true,
        trades_per_year: nt / yrs, explicit_cost_krw: ys.reduce((n, y) => n + y.cost, 0) };
      mkc = Math.pow(1 + mt, 1 / yrs) - 1;
    }
    const yopt = (k, lo, hi) => `<select data-per="${k}" aria-label="${k === 'a' ? '시작 연도' : '종료 연도'}">${r.yearly.filter(y => y.year >= lo && y.year <= hi).map(y => `<option value="${y.year}" ${P[k] === y.year ? 'selected' : ''}>${y.year}년${y.days < 200 ? '(' + r.series.dates[r.series.dates.length - 1].slice(5, 7).replace(/^0/, '') + '월까지)' : ''}</option>`).join('')}</select>`;
    const perSel = r.yearly ? `<div class="per"><span>검증 기간</span>${yopt('a', Y0, P.b)}<i>~</i>${yopt('b', P.a, 9999)}</div>` : '';
    const ver = S.versions.find(v => v.run.run_id === r.run_id);
    const chart = lineChart(s.dates, [
      { name: '나의 AI 가상 운용', short: '나의 AI', color: 'var(--s1)', values: s.strategy, main: true },
      { name: '코스피 지수', short: '코스피', color: 'var(--s2)', values: s.market },
      { name: '대상 300종목 동일가중', short: '300종목', color: 'var(--s3)', dash: '3 3', values: s.universe }],
      { fmt: v => Math.round(v / 1e4).toLocaleString() + '만', split: CAT.periods.locked_final[0], base: r.init || r.s.cash, log: true, label: '가상 평가금액 추이(로그 축)' });
    const roll = r.rolling_6m, imp = r.model.importance_last_fold.slice(0, qs ? 20 : 5), mx = imp[0].share;
    const sk = r.ledger_summary.skipped;
    const bv = !custom && ver && S.versions.indexOf(ver) > 0 ? S.versions[0].run.metrics.development : null;
    const head = S.mode === 'qs' ? `<h2>${ver ? ver.name + ' · ' : ''}검증 결과</h2>
      <p class="sub">${describe(r.s).map(esc).join(' · ')}</p><p>${srcBadge(r)} <span class="badge">모델 ${r.model_id}</span> <span class="badge">정책 ${r.policy_id}</span></p>`
      : `<h2>${esc(aiTitle(r.s))} ${ver ? ver.name : ''}</h2>
      <p class="sub">${r.s.groups.map(g => SHORT[g]).join('·')} 정보 · 변수 ${r.model.n_features}개 · ${horizonLabel(r.s.h)} · ${r.s.buf > 1 ? '낮은 거래 빈도' : '정기 교체'}${nPlan(r.s) ? ` · 설계안 항목 ${nPlan(r.s)}개 기록(계산 미반영)` : ''}</p>`;
    const verdictNote = bv ? `<p class="sub">${d.cagr >= 0 ? '원금 대비 수익 발생' : bv.cagr < d.cagr ? '기존 모델 대비 손실 폭 감소, 원금 손실 발생' : '원금 손실 발생'}</p>` : `<p class="sub">${d.cagr >= 0 ? '원금 대비 수익 발생' : '원금 손실 발생'}</p>`;
    const tol = xval(r.s, 'tol') / 100, yrs0 = (r.yearly || []).filter(y => y.year >= P.a && y.year <= P.b), worst = yrs0.length ? yrs0.reduce((m, y) => y.ret < m.ret ? y : m) : null, tolBad = !!(tol && worst && worst.ret < -tol);
    const fit = d.cagr > mkc && d.cagr > 0 && !tolBad, gap = (d.cagr - mkc) * 100;
    const idxNote = `<div class="fit ${fit ? 'ok' : 'no'}"><b>${fit ? '모의 운용 대상' : '실전 운용 부적합'}</b>
      <span>${d.cagr <= 0 ? '비용 반영 시 원금 손실' : d.cagr <= mkc ? '지수 미달' : tolBad ? '손실 허용 한도 초과' : '비용 반영 수익, 지수 상회'} · 코스피 지수 대비 ${gap > 0 ? '+' : ''}${gap.toFixed(1)}%p</span>
      ${tol ? `<span>연간 손실 허용 한도 ${(tol * 100).toFixed(0)}% · 최저 연도 ${worst.year}년 ${pct(worst.ret)} · ${tolBad ? '한도 초과' : '한도 이내'}</span>` : ''}
      <span class="muted">${fit ? '실주문 연계 전 모의 운용 기간 필요. 과거 성과의 이후 지속 미보장' : '해당 설정은 주문 연계 미지원. AI 개선에서 후보 비교 가능'}</span></div>`;
    const cr = r.costs;
    const costCard = cr ? `<div class="card"><h3>거래 비용 가정별 결과</h3><p class="sub">동일 예측 모델, 비용 가정 변경 시 ${Y0}~${Y1}년 성과</p>
        <div class="scroll"><table><tr><th>비용 가정</th><th>연 수익률</th><th>최대 낙폭</th></tr>
        <tr><td>비용 없음</td><td class="${cls(cr.zero_cost[0])}">${pct(cr.zero_cost[0])}</td><td>${pct(cr.zero_cost[1])}</td></tr>
        <tr class="bestrow"><td>기본 가정</td><td class="${cls(d0.cagr)}">${pct(d0.cagr)}</td><td>${pct(d0.mdd)}</td></tr>
        <tr><td>슬리피지 3배</td><td class="${cls(cr.high_slippage[0])}">${pct(cr.high_slippage[0])}</td><td>${pct(cr.high_slippage[1])}</td></tr></table></div>
        <p class="muted">기본 가정: 수수료 0.015%, 매도 시 거래세 0.20%, 슬리피지 편도 0.10%. 슬리피지 3배: 편도 0.30%</p></div>` : '';
    const cp = r.composition;
    const compCard = cp ? `<div class="card"><h3>상품 구성별 결과</h3><p class="sub">전 기간(${r.series.dates[0]}~${r.series.dates[r.series.dates.length - 1]}) 실제 시세 기준</p>
        <div class="scroll"><table><tr><th>상품</th><th>투입 금액</th><th>기말 평가·손익</th></tr>
        ${cp.map(x => `<tr><td>${esc(x.label)}</td><td>${x.start ? won(x.start) : '–'}</td><td class="${cls(x.start ? x.end - x.start : x.end)}">${won(x.end)}${x.start ? ` (${pct(x.end / x.start - 1)})` : ''}</td></tr>`).join('')}</table></div>
        ${(r.notes || []).length ? `<p class="muted">${r.notes.map(esc).join('. ')}. ETF 분배금 미반영</p>` : '<p class="muted">ETF 분배금 미반영</p>'}</div>` : '';
    const led = qs ? r.ledger_tail : r.ledger_tail.filter(l => l.side !== '매수불가');
    const askCard = `<div class="card" data-keep="1"><h3>AI 개선</h3>${['reduce_loss', 'less_trading', 'more_data'].map(k => `<button class="rowbtn" data-act="opt" data-v="${k}"><span>${CAT.improvements[k].label}</span><i>›</i></button>`).join('')}</div>`;
    const stratCard = `<div class="card span strat" data-keep="1"><h3>나의 AI 제시 전략</h3><div class="sg">
        <div class="kv"><span>투자 성향</span><span>${PRESET[r.s.preset || 'balanced']}</span></div>
        <div class="kv"><span>투자 상품</span><span>${prodList(r.s).join(', ')}</span></div>
        <div class="kv"><span>종목 선정</span><span>${UNI[r.s.uni || 'all']}, 학습 점수 상위 ${r.s.k}종목, ${WT[r.s.wt || 'eq']}</span></div>
        <div class="kv"><span>보유·교체</span><span>${HL[r.s.h]} 주기, ${r.s.buf > 1 ? '보유 유지 우선' : '정기 교체'}, ${r.s.ex === 'close' ? '익일 종가' : '익일 시가'} 체결</span></div>
        <div class="kv"><span>위험 조건</span><span>${condList(r.s).filter(t => t !== '보유 종목 교체 축소').join(', ') || '미설정'}</span></div>
        <div class="kv"><span>나의 판단</span><span>${judgeList(r.s).join(', ') || '미입력'}${(r.model.dropped || []).length ? ` · 지정 방향 불일치 변수 ${r.model.dropped.length}개 제외` : ''}</span></div></div>
        <p class="muted">과거 데이터 기준 전략이며 현재 시점의 종목 추천 미제공</p></div>`;
    return `${head}<div class="cols">${stratCard}
      <div class="card span herocard" data-keep="1"><div class="ha">${perSel}<p class="sub">${d.from.slice(0, 4)}${d.from.slice(0, 4) === d.to.slice(0, 4) ? '' : '~' + d.to.slice(0, 4)}년 과거 검증 · ${man(d.start_value)} 투자 가정</p>
        <div class="hero ${cls(d.total_return)}">${won(d.end_value)} <small>${pct(d.total_return)} · 연 ${pct(d.cagr)}</small></div>${verdictNote}${idxNote}</div>
        <div class="hc">${chart}</div>
        <div class="tiles">
          <div class="tile"><div class="k">최대 낙폭</div><div class="v down">${pct(d.mdd)}</div><div class="n">${d.mdd_peak.slice(2, 7).replace('-', '.')}~${d.mdd_trough.slice(2, 7).replace('-', '.')}${d.custom ? '' : d.mdd_recovered ? ' · 회복 ' + d.mdd_recovered.slice(2, 7).replace('-', '.') : ' · 미회복'}</div></div>
          <div class="tile"><div class="k">거래 횟수</div><div class="v">연 ${Math.round(d.trades_per_year)}회</div><div class="n">수수료·세금 ${won(d.explicit_cost_krw)}</div></div>
          <div class="tile"><div class="k">동일 기간 코스피 지수</div><div class="v ${cls(mkc)}">연 ${pct(mkc)}</div><div class="n">배당 미반영</div></div>
          <div class="tile"><div class="k">투자금 부족 매수 불가</div><div class="v">${sk.unaffordable}건</div><div class="n">전체 기간 · 거래정지·상한가 ${sk.untradable_buy}건</div></div>
        </div></div>
      ${askCard}${compCard}${costCard}
      <div class="card"><h3>최종 평가 구간(${f.from}~${f.to})</h3>
        <p class="sub">후보 선정 미사용 기간</p>
        <div class="kv"><span>모델</span><span class="${cls(f.total_return)}">${pct(f.total_return)} (낙폭 ${pct(f.mdd)})</span></div>
        <div class="kv"><span>코스피 지수</span><span class="${cls(r.benchmarks.market.final.total_return)}">${pct(r.benchmarks.market.final.total_return)} (낙폭 ${pct(r.benchmarks.market.final.mdd)})</span></div>
        <div class="kv"><span>대상 300종목 동일가중</span><span class="${cls(r.benchmarks.universe.final.total_return)}">${pct(r.benchmarks.universe.final.total_return)}</span></div></div>
      ${roll.n_windows ? `<div class="card"><h3>투자 시작 시점별 6개월 수익률</h3>
        <div class="kv"><span>하위 10%</span><span class="${cls(roll.p10)}">${pct(roll.p10)}</span></div>
        <div class="kv"><span>중앙값</span><span class="${cls(roll.median)}">${pct(roll.median)}</span></div>
        <div class="kv"><span>상위 10%</span><span class="${cls(roll.p90)}">${pct(roll.p90)}</span></div>
        <div class="kv"><span>손실 구간 비율</span><span>${(roll.loss_share * 100).toFixed(0)}% (${roll.n_windows}개 구간)</span></div>
        <p class="muted">${esc(roll.note)}</p></div>` : ''}
      <div class="card"><h3>${qs ? '변수 중요도' : '정보별 반영 비중'}</h3>
        ${imp.map(i => `<div class="imp"><div class="kv" style="border:0;padding:0"><span>${esc(i.label)}</span><span>${(i.share * 100).toFixed(1)}%</span></div><div class="bar"><span style="width:${i.share / mx * 100}%"></span></div></div>`).join('')}
        <p class="muted">${esc(r.model.importance_kind)} · 최종 학습 기준. 인과관계 해석 불가</p></div>
      ${qs ? `<div class="card"><h3>상세 지표</h3><div class="scroll"><table><tr><th>검증 구간</th><th>연 수익률</th><th>최대 낙폭</th><th>샤프 지수</th><th>연 거래</th></tr>
          ${benchRow('전략(비용 반영)', d)}${benchRow('코스피 지수', r.benchmarks.market.dev)}${benchRow('300종목 동일가중', r.benchmarks.universe.dev)}
          <tr><th>최종 평가 구간</th><th></th><th></th><th></th><th></th></tr>
          ${benchRow('전략(비용 반영)', f)}${benchRow('코스피 지수', r.benchmarks.market.final)}${benchRow('300종목 동일가중', r.benchmarks.universe.final)}</table></div>
        <div class="kv"><span>순위 상관계수(Rank IC), 검증 / 최종</span><span>${r.model.ic.dev.rank_ic_mean} / ${r.model.ic.final.rank_ic_mean}</span></div>
        <div class="kv"><span>순위 상관계수 양수 비율(검증)</span><span>${(r.model.ic.dev.rank_ic_positive_share * 100).toFixed(0)}% · ${r.model.ic.dev.n_dates}일</span></div>
        <div class="kv"><span>승률(청산 거래)</span><span>${r.ledger_summary.win_rate != null ? (r.ledger_summary.win_rate * 100).toFixed(1) + '%' : '–'}</span></div>
        <div class="kv"><span>비용·슬리피지 합계</span><span>${won(r.ledger_summary.cost_and_slippage_krw)}</span></div>
        <div class="kv"><span>목적함수 J(${PRESET[S.spec.preset]})</span><span>${J(r, S.spec.preset).toFixed(3)}</span></div>
        <div class="kv" style="flex-direction:column;gap:4px"><span>최근 1·3·6·12개월 수익률(${r.trailing.as_of})</span><span style="text-align:left">${['1m', '3m', '6m', '12m'].map(k => pct(r.trailing.strategy[k])).join(' · ')}</span></div>
        <p class="muted">샤프 지수는 무위험수익률 0 가정, 일간 수익률 연율화 기준. 순위 상관계수가 양수인 경우에도 비용 차감 성과는 음수 가능</p></div>
      <details class="card"><summary>연도별 학습 기록(모델 ${r.model.folds.length}개)</summary><div class="scroll"><table><tr><th>검증 연도</th><th>학습 구간</th><th>표본</th><th>분리 표본</th><th>예측 대상 종료일</th></tr>
        ${r.model.folds.map(o => `<tr><td>${o.test_year}</td><td>${o.train_from.slice(2)}~${o.train_to.slice(2)}</td><td>${o.n_train.toLocaleString()}</td><td>${o.n_purged.toLocaleString()}</td><td>${o.label_end_max.slice(2)}</td></tr>`).join('')}</table></div>
        <p class="muted">${esc(r.model.target_note)}</p></details>` : ''}
      <details class="card"><summary>가상 거래 내역(최근 ${led.length}건)</summary><div class="scroll"><table><tr><th>일자</th><th>구분</th><th>종목</th>${qs ? '<th>수량</th><th>단가</th>' : ''}<th>손익(원)</th></tr>
        ${led.map(l => `<tr><td>${l.date.slice(2)}</td><td>${l.side}</td><td>${esc(l.name)}</td>${qs ? `<td>${l.shares || '–'}</td><td>${l.price.toLocaleString()}</td>` : ''}<td class="${cls(l.pnl || 0)}">${l.pnl != null ? l.pnl.toLocaleString() : (l.note && qs ? esc(l.note) : '–')}</td></tr>`).join('')}</table></div>
        <p class="muted">연구 기준일 ${CAT.data.end} 이전의 과거 가상 거래 기록이며 현재 시점의 추천이 아님. ${esc(r.ledger_summary.cost_assumption)}</p></details>
      ${qs ? '' : '<!--'}<details class="card"><summary>실행 기록·재현 정보</summary><div class="log">${[...(r.model.training_log || []), ...r.logs].map(esc).join('\n')}</div>
        <p class="muted">run ${r.run_id} · engine ${r.engine_version} · snapshot ${CAT.data.snapshot_id} · seed 42</p></details>${qs ? '' : '-->'}
      </div>${custom ? '<p class="muted" style="margin:0 4px">선택 기간의 최대 낙폭은 주간 평가금액 기준 산출</p>' : ''}
      ${disclosures()}`;
  }

  function optimizeView() {
    if (!S.cur) return validateView();
    const qs = !!S.adv, I = CAT.improvements, o = S.opt;
    const btns = (qs ? ['reduce_loss', 'less_trading', 'more_data', 'algorithm'] : ['reduce_loss', 'less_trading', 'more_data'])
      .map(k => `<button class="rowbtn" data-act="opt" data-v="${k}"><span>${I[k].label}</span><i>›</i></button>`).join('');
    let res = '';
    if (o) {
      const base = o.rows[0];
      res = `<div class="card"><h3>${esc(o.label)} 후보 비교</h3>
        <p class="sub">동일 검증 구간, 동일 투자금·비용 가정 기준 비교</p>
        <div class="scroll opt-table"><table><tr><th>버전</th><th>연 수익률</th><th>최대 낙폭</th><th>연 거래</th><th>J</th><th>IC</th></tr>
        ${o.rows.map(x => x.error ? `<tr><td colspan="6" style="text-align:left" class="muted">${esc(x.change)}: ${esc(x.error)}</td></tr>` : (() => {
          const d = x.run.metrics.development;
          return `<tr class="${x.tag === o.best ? 'bestrow' : ''}"><td><span class="vtag">${x.tag}</span> ${x.kind === 'base' ? '기존' : `<span class="muted">${x.retrained ? '재학습' : '운용 변경'}</span>`}</td>
            <td class="${cls(d.cagr)}">${pct(d.cagr)}</td><td>${pct(d.mdd)}</td><td>${Math.round(d.trades_per_year)}</td><td>${x.J.toFixed(3)}</td><td>${(+x.run.model.ic.dev.rank_ic_mean).toFixed(3)}</td></tr>`;
        })()).join('')}</table></div>
        ${o.rows.filter(x => !x.error && x.kind !== 'base').sort((a, b) => b.J - a.J).map((x, ci) => {
          const d = x.run.metrics.development, b = base.run.metrics.development;
          const say = [];
          say.push(d.mdd > b.mdd ? `최대 낙폭 축소(${pct(b.mdd)}, ${pct(d.mdd)})` : d.mdd < b.mdd ? `최대 낙폭 확대(${pct(b.mdd)}, ${pct(d.mdd)})` : '최대 낙폭 동일');
          say.push(d.end_value > b.end_value ? `최종 평가금액 ${man(d.end_value - b.end_value)} 증가` : `최종 평가금액 ${man(b.end_value - d.end_value)} 감소`);
          say.push(`연 거래 ${Math.round(b.trades_per_year)}회, 변경 후 ${Math.round(d.trades_per_year)}회`);
          const vd = verdict(d, b), hold = vd[0] === '채택 보류';
          return `<div class="cand"><div class="cand-h"><b>${esc(cname(x.change))}</b><span class="badge ${hold ? 'pre' : 'm'}">${vd[0]}</span></div>${ci === 0 && !hold ? `<p class="muted" style="margin:0 0 8px">우선 목표(${PRESET[S.spec.preset || 'balanced']}) 기준 1순위</p>` : ''}
            <div class="trio"><div><span>평가금액</span><b class="${cls(d.total_return)}">${man(d.end_value)}</b></div><div><span>최대 낙폭</span><b>${pct(d.mdd)}</b></div><div><span>연 거래</span><b>${Math.round(d.trades_per_year)}회</b></div></div>
            <p class="sub">${vd[1]}<br>기존: ${man(b.end_value)} · ${pct(b.mdd)} · 연 ${Math.round(b.trades_per_year)}회${qs ? ` · 최종 평가 구간 ${pct(x.run.metrics.locked_final.total_return)}(기존 ${pct(base.run.metrics.locked_final.total_return)})` : ''}</p>
            <button class="btn ${hold ? 'ghost' : ''} small" data-act="adopt" data-v="${x.tag}">${hold ? '보류 후보 적용' : '후보 적용'}</button></div>`;
        }).join('')}
        <div class="note">${qs ? `목적함수(${PRESET[S.spec.preset]}) 기준 최상위 후보: <b>${o.best}</b>. 수익률 또는 최대 낙폭 악화 시 채택 보류 판정. 최종 평가 구간 수치는 후보 선정에 미사용` : '수익률 또는 최대 낙폭 악화 후보는 채택 보류 판정'}<br>과거 성과 순위와 이후 성과 순위의 상관 0.15(설정 512건 실측). 과거 성과 우수 후보의 이후 성과 미보장</div>
        <button class="btn ghost small" data-act="keep">기존 유지</button></div>
        <div class="card"><h3>버전별 가상 평가금액</h3>${compareChart(o.rows.filter(x => !x.error).map(x => ({ name: x.tag + ' ' + cname(x.change), short: x.tag, run: x.run })))}</div>`;
    }
    const cd = S.cashDemo;
    if (S.opt && !S.opt.rows.some(x => !x.error && x.kind !== 'base')) res = `<div class="card"><h3>${esc(S.opt.label)}</h3><p class="sub">해당 항목은 현재 설정에 반영된 상태이며 추가 후보 없음</p>
      ${S.opt.rows.filter(x => x.error).map(x => `<div class="kv"><span>${esc(cname(x.change))}</span><span>반영 완료</span></div>`).join('')}</div>`;
    return `<h2>AI 개선</h2>
      <p class="sub">개선 방향 선택 시 실제 데이터 기준 후보 비교</p>
      <div class="cols"><div class="card"><h3>개선 방향</h3>${btns}</div>${res}
      <div class="card"><h3>투자금 변경</h3><p class="sub">${qs ? '예측 모델 유지, 포트폴리오 재계산(재학습 없음)' : '동일 AI 기준 투자금별 결과 비교'}</p>
        <button class="btn ghost small" data-act="cash">${S.cur.s.cash === 1e7 ? '투자금 100만 원 기준 계산' : '투자금 1,000만 원 기준 계산'}</button>
        ${cd ? `${qs ? `<div class="kv"><span>모델</span><span>${cd.a.model_id} = ${cd.b.model_id} (동일)</span></div>` : ''}
          <div class="kv"><span>연 수익률</span><span>${man(cd.a.s.cash)} ${pct(cd.a.metrics.development.cagr)} / ${man(cd.b.s.cash)} ${pct(cd.b.metrics.development.cagr)}</span></div>
          <div class="kv"><span>투자금 부족 매수 불가</span><span>${cd.a.ledger_summary.skipped.unaffordable}건 / ${cd.b.ledger_summary.skipped.unaffordable}건</span></div>
          <div class="kv"><span>연 거래 횟수</span><span>${Math.round(cd.a.metrics.development.trades_per_year)} / ${Math.round(cd.b.metrics.development.trades_per_year)}</span></div>
          <p class="muted">예측값 동일 시에도 투자금에 따라 매수 가능 종목과 성과 상이. 키움증권 계좌 연결 시 실제 보유 종목·현금 기준 산정(본 시연은 실계좌 미연결)</p>` : ''}</div></div>`;
  }

  function compareChart(items) {
    const colors = ['var(--s1)', 'var(--s2)', 'var(--s1)', 'var(--s2)'];
    const it = items.slice(0, 4), dates = it[0].run.series.dates;
    const dashes = [null, null, '5 3', '2 3'];
    return lineChart(dates, it.map((x, i) => ({ name: x.name, short: x.short, color: colors[i], dash: dashes[i], main: i === 0,
      values: x.run.series.strategy.map(v => v / x.run.series.strategy[0] * 100) })),
      { fmt: v => v.toFixed(0), split: CAT.periods.locked_final[0], base: 100, label: '버전 비교(시작=100)' });
  }

  function versionsView() {
    if (!S.versions.length) return validateView();
    const url = shareUrl();
    return `<h2>${S.mode === 'qs' ? '모델 버전' : '버전 기록'}</h2><div class="cols">
      ${S.versions.map((v, i) => { const d = v.run.metrics.development; return `<div class="card tight ${v.run.run_id === S.cur.run_id ? 'sel' : ''}">
        <div class="kv" style="border:0"><b>${v.name}${v.run.run_id === S.cur.run_id ? ' <span class="badge">사용 중</span>' : ''}</b><span>${v.kind === 'base' ? '<span class="badge">최초 학습</span>' : `<span class="badge ${v.retrained ? 'm' : 'p'}">${v.retrained ? '모델 재학습' : '운용 방식 변경'}</span>`}</span></div>
        <p class="sub">${esc(v.why)}</p>
        <div class="kv"><span>연 수익률</span><span class="${cls(d.cagr)}">${pct(d.cagr)}</span></div>
        <div class="kv"><span>최대 낙폭 · 연 거래</span><span>${pct(d.mdd)} · ${Math.round(d.trades_per_year)}회</span></div>
        <div class="kv"><span>${S.mode === 'qs' ? '최종 평가 구간' : CAT.periods.locked_final[0].slice(0, 4) + '년 이후'}</span><span>${pct(v.run.metrics.locked_final.total_return)}</span></div>
        ${S.adv ? `<p class="muted">모델 ${v.run.model_id} · 정책 ${v.run.policy_id}</p>` : ''}
        ${v.run.run_id !== S.cur.run_id ? `<button class="btn ghost small" data-act="use" data-v="${i}">해당 버전 조회</button>` : ''}</div>`; }).join('')}
      ${S.versions.length > 1 ? `<div class="card"><h3>버전 비교</h3>${compareChart(S.versions.map(v => ({ name: v.name, short: v.name, run: v.run })))}</div>` : ''}
      ${recipeCard(S.cur.s, `<input type="text" readonly value="${esc(url)}" id="share"><button class="btn small" data-act="copy">공유 링크 복사</button>`, S.mode === 'qs' ? '연구 설정 공유' : 'AI 설정 공유')}
      <div class="card"><h3>영웅문S# 연계 이용</h3>
        <div class="kv"><span>앱 설치·회원가입</span><span>AI 설정·실험 기록 이전</span></div>
        <div class="kv"><span>계좌 개설·인증</span><span>보유 종목·현금 기준 재산정</span></div>
        <div class="kv"><span>운용 적합 판정</span><span>지수 미달·원금 손실 설정 주문 연계 미지원</span></div>
        <div class="kv"><span>모의 운용</span><span>실주문 전 일정 기간 모의 운용</span></div>
        <div class="kv"><span>자동 주문</span><span>고객 작성 조건 기반, 한도 설정, 주문 전 승인</span></div>
        <div class="kv"><span>쏠림 한도</span><span>종목별 주문 집중 제한</span></div>
        <div class="kv"><span>운용 보고서</span><span>주간·월간 성과, 거래 내역, 개선 제안</span></div>
        <button class="btn small" disabled>영웅문S# 이동</button>
        <p class="muted">계좌 연계 기능은 설계안이며 준법 검토 전제. 시연 화면은 앱 연결·실계좌·주문 미지원</p></div></div>`;
  }
  const recipeCard = (s, action, label) => `<div class="card sel"><p class="muted">${label}</p><h3 style="font-size:16px">${esc(aiTitle(s))}</h3>
      <div class="kv"><span>반영 정보</span><span>${s.groups.map(g => SHORT[g]).join(' · ')}</span></div>
      <div class="kv"><span>보유 기간</span><span>${s.h}거래일(${HL[s.h]})</span></div>
      <div class="kv"><span>투자 상품</span><span>${prodList({ ...s, holdings: [] }).join(', ')}</span></div>
      <div class="kv"><span>최적화 기준</span><span>${PRESET[s.preset || 'balanced']}</span></div>
      ${nPlan(s) ? `<div class="kv"><span>설계안 항목</span><span>${nPlan(s)}개</span></div>` : ''}
      ${action}<p class="muted">공유 제외: 수익률, 종목, 개인 자산 정보. 수신자는 본인 조건으로 재학습</p></div>`;
  const shareUrl = () => location.origin + location.pathname + '#r=' + btoa(unescape(encodeURIComponent(JSON.stringify({ m: S.mode, s: { ...(S.cur ? S.cur.s : S.spec), holdings: [], usst: [] } }))));

  function render() {
    chartSeq = 0;
    let body;
    if (!S.mode) body = landing();
    else if (S.busy) body = header() + busyView();
    else body = header() + ({ create: S.mode === 'qs' ? createQs : createMy, validate: validateView, optimize: optimizeView, versions: versionsView }[S.tab])();
    app.className = 'app ' + (S.mode || 'home') + (S.adv ? ' adv' : '');
    app.innerHTML = body + (S.busy && S.mode === 'my' ? '' : tabs());
    if (S.mode === 'my' && S.tab === 'validate' && !S.busy) app.querySelectorAll('div.card:not([data-keep])').forEach(c => {
      const h = c.querySelector(':scope > h3'); if (!h) return;
      const d = document.createElement('details'); d.className = 'card'; d.open = window.matchMedia('(min-width:1000px)').matches; const sm = document.createElement('summary'); sm.textContent = h.textContent; h.remove(); d.appendChild(sm);
      while (c.firstChild) d.appendChild(c.firstChild); c.replaceWith(d);
    });
    const lg = $('#log'); if (lg) lg.scrollTop = lg.scrollHeight;
  }

  /* ---------- 동작 ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function withBusy(title, fn) {
    S.busy = title; S.logs = []; render(); window.scrollTo(0, 0);
    try { return await fn(m => { S.logs.push(m); const lg = $('#log'); if (lg) { lg.textContent = lg.dataset.last ? stage(m) : S.logs.join('\n'); lg.scrollTop = lg.scrollHeight; } }); }
    catch (e) { toast(e.message); return null; }
    finally { S.busy = null; render(); }
  }
  const seenModels = new Set();
  async function replay(r, log) {
    const isNew = !seenModels.has(r.model_id) && r.source !== 'live_reused';
    seenModels.add(r.model_id);
    const head = isNew ? [`[신규 학습] 모델 ${r.model_id}`, ...(r.model.training_log || []).filter(l => !l.startsWith('[신규'))]
      : [`[모델 재사용] ${r.model_id} · 재학습 없이 운용 정책 재계산`];
    const lines = [...head, ...r.logs.filter(l => l.startsWith('[가상 체결]'))];
    for (const l of lines) { log(l); await sleep(60); }
  }
  async function runCurrent() {
    const s = cl(S.spec);
    if (S.cur && LM() && sameSpec(s, S.cur.s)) { const ch = s.preset !== S.cur.s.preset, xc = JSON.stringify([s.x, s.xv, s.rules]) !== JSON.stringify([S.cur.s.x, S.cur.s.xv, S.cur.s.rules]); S.cur.s.preset = s.preset; S.cur.s.x = [...s.x]; S.cur.s.xv = { ...s.xv }; S.cur.s.rules = [...s.rules]; S.tab = 'validate'; render(); window.scrollTo(0, 0); return toast(ch ? '우선 목표 변경 반영' : '변경 사항 없음'); }
    const prev = S.cur ? S.versions : null; let fb = false;
    const r = await withBusy('학습 중', async log => {
      log('[자료] 학습 자료 수신'); await labLoad();
      if (s.algo === 'lightgbm' && ((s.target || 'ret') !== 'ret' || !Lab.lgbAvailable(labSpec(s).model))) { s.algo = 'ridge'; S.spec.algo = 'ridge'; fb = true; }
      log(`[설정] ${describe(s).join(' · ')}`);
      const run = await getRun(s); await replay(run, log); return run;
    });
    if (!r) return;
    if (fb) toast('트리 기반 학습 미제공 조합. 선형 회귀 적용');
    r.s = { ...r.s, preset: s.preset, x: s.x, xv: s.xv, rules: s.rules };
    S.cur = r; S.opt = null; S.cashDemo = null; S.period = null;
    const why = s.groups.map(g => SHORT[g]).join('·') + ' 정보 · ' + horizonLabel(s.h);
    S.versions = prev ? [...prev, { name: 'V' + (prev.length + 1), kind: 'model', retrained: true, why: '설정 변경: ' + why, run: r }] : [{ name: 'V1', kind: 'base', why: '최초 설정: ' + why, run: r }];
    S.tab = 'validate'; render(); window.scrollTo(0, 0);
  }
  const EXTRA = {
    reduce_loss: [{ change: '종목별 손절 기준 10% 적용', kind: 'strategy', patch: { x: { stop: 10 } } }, { change: 'KODEX 단기채권 30% 편입', kind: 'strategy', patch: { x: { p_rp: 30 } } }, { change: 'KIWOOM 국고채10년 30% 편입', kind: 'strategy', patch: { x: { p_bond10: 30 } } },
      { change: '하락장 한정 코스피200 선물 헤지 50%', kind: 'strategy', dv: 1, patch: { x: { p_futd: 50 } } }, { change: '코스피200 풋옵션 매수', kind: 'strategy', dv: 1, patch: { x: { p_put: 100 } } }],
    less_trading: [{ change: '예측·보유 기간 60거래일', kind: 'model', patch: { model_spec: { horizon_days: 60 } } }],
    more_data: [{ change: '투자자별 수급 변수 추가', kind: 'model', patch: { model_spec: { add_groups: ['flow'] } } }, { change: '업종·테마 변수 추가', kind: 'model', patch: { model_spec: { add_groups: ['sector'] } } },
      { change: '전체 변수 반영', kind: 'model', patch: { model_spec: { add_groups: ['volume', 'risk', 'size', 'trend', 'pattern', 'beta', 'age', 'flow', 'sector', 'disc'] } } }],
  };
  async function runOpt(req) {
    const imp = CAT.improvements[req], baseS = S.cur.s;
    const out = await withBusy(`${imp.label} 후보 실험 중`, async log => {
      const noDv = xon(baseS, 'exp1'), cands = [...imp.candidates, ...(EXTRA[req] || []).filter(c => !(c.dv && noDv))];
      log(`[연구 계획] 후보 ${cands.length}건 비교`);
      const rows = [{ tag: (S.versions.find(v => v.run.run_id === S.cur.run_id) || { name: 'V' + S.versions.length }).name, kind: 'base', change: '기존', run: S.cur, retrained: false }];
      let n = 0;
      for (const c of cands) {
        const ns = applyPatch(baseS, c.patch);
        if (sameSpec(ns, baseS)) { rows.push({ tag: '', change: c.change, kind: c.kind, error: '기존 설정과 동일, 후보 제외' }); log(`[제외] ${c.change}: 기존 설정과 동일`); continue; }
        const tag = '후보 ' + (++n);
        try {
          log(`[${tag}] ${c.change}: ${c.kind === 'model' ? '설정 변경, 모델 학습' : '예측값 재사용, 가상 체결 재계산'}`);
          const run = await getRun(ns); await replay(run, log);
          rows.push({ tag, change: c.change, kind: c.kind, run, retrained: run.model_id !== S.cur.model_id });
        } catch (e) { rows.push({ tag, change: c.change, kind: c.kind, error: e.message }); }
      }
      rows.forEach(x => { if (x.run) x.J = J(x.run, S.spec.preset); });
      const best = rows.filter(x => x.run).sort((a, b) => b.J - a.J)[0].tag;
      return { req, label: imp.label, plan: imp.plan, rows, best };
    });
    if (out) { S.opt = out; render(); }
  }
  function parseText(t) {
    const s = S.spec, notes = [], no = [], M = LM();
    const add = g => { if (!s.groups.includes(g)) s.groups.push(g); };
    const num = re => { const m = t.match(re); return m ? +m[1] : null; };
    const dvOk = () => { if (xon(s, 'exp1')) { no.push('투자 경험 1년 미만은 파생상품·레버리지 상품 선택 제한'); return false; } return true; };
    const lx = (id, val) => { const it = XI[id]; s.x = s.x.filter(o => o !== id && !(it.rg && XI[o] && XI[o].rg === it.rg)); s.x.push(id); if (it.num) s.xv[id] = Math.max(it.num.min, Math.min(it.num.max, val || it.num.def)); notes.push(xLabel(s, id)); };
    const bel = i => { Object.assign(s.belief = s.belief || {}, BEL[i][1]); BEL[i][2].forEach(add); notes.push(BEL[i][0]); };
    if (/손절/.test(t)) lx('stop', num(/손절[^0-9]{0,8}(\d+(?:\.\d+)?) ?%/) || num(/(\d+(?:\.\d+)?) ?%[^,.]{0,10}손절/));
    if (/익절|이익 ?실현/.test(t)) lx('take', num(/(?:익절|이익 ?실현)[^0-9]{0,8}(\d+(?:\.\d+)?) ?%/) || num(/(\d+(?:\.\d+)?) ?%[^,.]{0,10}(?:익절|이익 ?실현)/));
    if (/현금|단기채|예수금/.test(t) && /비중|편입|보유|%/.test(t)) lx('p_rp', num(/(?:현금|단기채)[^0-9]{0,10}(\d+) ?%/));
    if (/선물/.test(t) && dvOk()) lx(/하락장|하락 ?시|떨어질/.test(t) ? 'p_futd' : 'p_fut', num(/선물[^0-9]{0,12}(\d+) ?%/));
    else if (/헤지|헷지/.test(t) && !/옵션|풋/.test(t) && dvOk()) lx('p_futd', null);
    if (/풋|옵션.*(대비|방어|보호|헤지|헷지)|(대비|방어|보호).*옵션/.test(t) && dvOk()) lx('p_put', null);
    if (/커버드 ?콜/.test(t) && dvOk()) lx('p_cc', num(/커버드 ?콜[^0-9]{0,10}(\d+) ?%/));
    else if (/콜 ?매도|콜옵션/.test(t) && dvOk()) lx('p_call', null);
    if (/레버리지/.test(t) && dvOk()) lx('p_lev', num(/레버리지[^0-9]{0,10}(\d+) ?%/));
    if (/인버스/.test(t) && dvOk()) lx('p_inv', num(/인버스[^0-9]{0,10}(\d+) ?%/));
    if (/신규 ?상장|공모주|새내기/.test(t) && /제외|빼|피하|싫/.test(t)) lx('nonew');
    const kn = num(/(\d+) ?(?:종목|개 ?종목)/); if (kn && [3, 5, 10, 20, 30].includes(kn)) { s.k = kn; notes.push(`${kn}종목 보유`); }
    if (/코스피(?!200)/.test(t) && /만|한정|위주|중심/.test(t)) { s.uni = 'kospi'; notes.push(UNI.kospi); }
    if (/대형주|우량주|시가총액 상위/.test(t) && /만|한정|위주|중심/.test(t)) { s.uni = 'top100'; notes.push(UNI.top100); }
    else if (/대형|우량|시가총액|규모/.test(t)) bel(3);
    if (/추세|모멘텀|오르는 종목|상승세|신고가/.test(t)) bel(0);
    if (/낙폭 ?과대|많이 (빠진|떨어진)|저점 ?매수|역추세|눌림/.test(t)) bel(1);
    if (/저변동|안정적|변동성.*(낮|작)/.test(t)) bel(2);
    if (/거래.*(활발|많은)|유동성/.test(t)) bel(4);
    if (/종가/.test(t) && /매수|매매|체결|주문/.test(t)) { s.ex = 'close'; notes.push('익일 종가 체결'); }
    if (/변동|위험|손실|안정|불안/.test(t)) { add('risk'); notes.push('하락 위험 정보 추가'); }
    if (/피하|제외|빼|싫/.test(t) && /변동|위험|급등/.test(t)) { s.vf = 0.3; notes.push('변동성 상위 30% 종목 제외'); }
    if (/거래량|거래대금/.test(t)) { add('volume'); notes.push('거래량 정보 추가'); }
    if (/장기 ?추세|52주|1년 ?수익률/.test(t)) { add('trend'); notes.push('장기 추세 정보 추가'); }
    if (/상한가|급등|갭/.test(t)) { add('pattern'); notes.push('급등·갭 이력 정보 추가'); }
    if (/베타|시장 ?민감/.test(t)) { add('beta'); notes.push('시장 민감도 정보 추가'); }
    if (/며칠|단기|스윙|일주일/.test(t)) { s.h = 5; notes.push('약 1주 기준'); }
    if (/2주|보름/.test(t)) { s.h = 10; notes.push('약 2주 기준'); }
    if (/몇 ?주|한 ?달|1개월|자주.*(어렵|어려|않|못|힘들)|바빠|바쁘|직장/.test(t)) { s.h = 20; notes.push('약 1개월 기준'); }
    if (/분기|3개월|석 ?달|장기 ?(보유|투자)|오래|길게/.test(t)) { s.h = 60; notes.push('약 3개월 기준'); }
    if (/자주.*(어렵|어려|않|못|힘들)|거래.*(줄|적게|축소|감소)|수수료/.test(t)) { s.buf = 3; notes.push('상위권 종목 보유 유지(거래 감소)'); }
    if (/하락장|시장.*(나쁠|떨어)/.test(t) && /매수|중단|쉬|멈/.test(t)) { s.mf = true; notes.push('하락장 신규 매수 중단'); }
    if (M) t.split(/[,.\n]|그리고|하고/).filter(c => /제외|빼|안 ?사|매수 ?금지/.test(c)).forEach(c => c.split(/[\s·/]+/).map(w => w.replace(/(은|는|이|가|을|를|와|과|도|랑|이랑)$/, '')).filter(w => w.length >= 2 && !/제외|종목|매수|금지/.test(w)).forEach(w => {
      let i = M.names.indexOf(w);
      if (i < 0) { const c1 = M.names.map((n, j) => [n, j]).filter(([n]) => n.includes(w)), c2 = c1.filter(([n]) => n.endsWith(w) || n.startsWith(w)); i = c1.length === 1 ? c1[0][1] : c2.length === 1 ? c2[0][1] : -1; }
      if (i >= 0) { if (!(s.excl = s.excl || []).includes(M.codes[i])) s.excl.push(M.codes[i]); notes.push(M.names[i] + ' 제외'); }
    }));
    if (/외국인|외인/.test(t)) bel(5);
    if (/기관/.test(t)) bel(6);
    if (/업종|섹터|테마/.test(t) && /강세|주도|오르는|좋은|선호/.test(t)) bel(7);
    if (/수급/.test(t)) { add('flow'); notes.push('투자자별 수급 정보 추가'); }
    if (/공시/.test(t)) { add('disc'); notes.push('공시 정보 추가'); }
    if (/시장경보|투자주의|투자경고|관리종목/.test(t)) lx('noalert');
    if (/나스닥|미국 ?(증시|시장|장)/.test(t) && /하락|빠지|떨어|급락/.test(t)) lx('nas', num(/(\d+(?:\.\d+)?) ?%/));
    else if (/나스닥/.test(t)) lx('p_nas', num(/나스닥[^0-9]{0,10}(\d+) ?%/));
    if (/S&P|에스앤피|미국 ?주식/i.test(t)) lx('p_us', num(/(?:S&P ?500|에스앤피|미국 ?주식)[^0-9]{0,10}(\d+) ?%/i));
    if (/VIX|공포 ?지수/i.test(t)) lx('vix', num(/(?:VIX|공포 ?지수)[^0-9]{0,8}(\d+)/i));
    if (/환율/.test(t) && /오르|상승|급등/.test(t)) lx('fx', num(/환율[^0-9]{0,12}(\d+(?:\.\d+)?) ?%/));
    if (/달러/.test(t) && /비중|편입|보유|%/.test(t)) lx('p_usd', num(/달러[^0-9]{0,10}(\d+) ?%/));
    if (/금 ?(투자|현물|선물|비중)|골드/.test(t)) lx('p_gold', num(/(?:금|골드)[^0-9]{0,10}(\d+) ?%/));
    if (/국고채|국채|채권/.test(t)) lx(/3년|단기/.test(t) ? 'p_bond' : 'p_bond10', num(/(?:국고채|국채|채권)[^0-9]{0,10}(\d+) ?%/));
    if (/업종.*(분산|쏠림|편중)|한 업종/.test(t)) lx('scap', num(/(\d+) ?%/));
    if (/실적|재무|PER|PBR|배당|애널|리포트|목표가|뉴스|기사|공매도/i.test(t)) no.push('실적·배당·보고서·뉴스·공매도 자료 미연결');
    if (/추천|뭐 ?사|사야|사도|살까|팔까|팔아|매수해|매도해|오를|될까/.test(t)) no.push('종목 추천·매수 권유 미제공(과거 데이터 연구로 한정)');
    if (!s.rules.includes(t.trim())) s.rules = [...s.rules, t.trim()].slice(-20);
    return (notes.length ? '<b>계산 반영:</b> ' + [...new Set(notes)].map(esc).join(', ') : '계산 반영 조건 없음') + '<br><b>규칙 기록:</b> 1건' + (no.length ? '<br><b>미지원:</b> ' + no.join(' / ') : '') + '<br><span class="muted">규칙 기반 해석. 재학습 시 결과 반영</span>';
  }
  async function parseNl() {
    const t = ($('#nl') || {}).value || ''; if (!t.trim()) return toast('입력 내용 없음');
    if (LIVE && AGENT) {
      try {
        const res = await fetch('api/research/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t, current: toSpec(S.spec) }) });
        if (res.ok) {
          const o = await res.json(), s = S.spec;
          if (o.feature_groups) s.groups = [...new Set(['price', ...o.feature_groups])];
          if (o.horizon_days) s.h = o.horizon_days; if (o.algorithm) s.algo = o.algorithm;
          if (o.top_k) s.k = o.top_k; if (o.keep_buffer) s.buf = o.keep_buffer; if (o.volatility_filter != null) s.vf = o.volatility_filter;
          if (o.market_filter != null) s.mf = o.market_filter; if (o.objective_preset) s.preset = o.objective_preset;
          S.planNote = esc(o.summary_ko) + (o.unsupported && o.unsupported.length ? '<br><b>미지원:</b> ' + o.unsupported.map(esc).join(' / ') : '') + (o.clarifying_question ? '<br><b>확인:</b> ' + esc(o.clarifying_question) : '') + `<br><span class="muted">${esc(o.source)}</span>`;
          return render();
        }
      } catch (e) { /* 규칙 기반으로 대체 */ }
    }
    S.spec.x = S.spec.x || []; S.spec.xv = S.spec.xv || {}; S.spec.rules = S.spec.rules || [];
    S.planNote = parseText(t); render();
  }

  app.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, v = b.dataset.v, s = S.spec;
    if (a === 'home') { S.mode = null; S.tab = 'create'; }
    else if (a === 'mode') { if (S.last && S.last !== v) { S.store = S.store || {}; S.store[S.last] = { cur: S.cur, versions: S.versions, opt: S.opt, cashDemo: S.cashDemo, spec: S.spec }; Object.assign(S, S.store[v] || { cur: null, versions: [], opt: null, cashDemo: null, spec: { ...S.spec, groups: [...S.spec.groups] } }); } S.last = v; S.mode = v; S.tab = S.cur ? 'validate' : 'create'; window.scrollTo(0, 0); }
    else if (a === 'fork') { S.spec = { ...S.spec, ...S.forked.spec }; S.spec.x = (S.spec.x || []).filter(o => XI[o]); S.spec.xv = S.spec.xv || {}; S.spec.rules = S.spec.rules || []; S.mode = 'my'; S.forked = null; S.tab = 'create'; S.adv = S.spec.k !== 5 || S.spec.buf > 1 || S.spec.vf > 0 || !!S.spec.mf; toast('설정 복제 완료'); }
    else if (a === 'tab') { S.tab = v; window.scrollTo(0, 0); }
    else if (a === 'grp') { if (b.dataset.lock) return toast('가격 흐름은 필수 항목'); s.groups = s.groups.includes(v) ? s.groups.filter(g => g !== v) : [...s.groups, v]; }
    else if (a === 'set') { s[b.dataset.k] = ['preset', 'algo', 'target', 'wt', 'ex', 'uni'].includes(b.dataset.k) ? v : +v; }
    else if (a === 'acct') { S.acct = !S.acct; }
    else if (a === 'lvl') { S.adv = v === '1'; }
    else if (a === 'sec') { S.sec = v; }
    else if (a === 'x') { s.x = s.x || []; s.xv = s.xv || {}; const it = XI[v]; if (s.x.includes(v)) s.x = s.x.filter(o => o !== v); else {
      if (DV.includes(v) && s.x.includes('exp1')) return toast('투자 경험 1년 미만은 파생상품·레버리지 상품 선택 제한');
      if (it.rg) s.x = s.x.filter(o => XI[o].rg !== it.rg); s.x.push(v); if (it.num && s.xv[v] == null) s.xv[v] = it.num.def;
      if (v === 'exp1' && s.x.some(o => DV.includes(o))) { s.x = s.x.filter(o => !DV.includes(o)); toast('파생상품·레버리지 상품 선택 해제'); } } }
    else if (a === 'feat') { const ex = s.exf || []; if (!ex.includes(v) && featsOf(s).length <= 1) return toast('변수 1개 이상 필요'); s.exf = ex.includes(v) ? ex.filter(f => f !== v) : [...ex, v]; }
    else if (a === 'bel') { s.belief = { ...(s.belief || {}) }; if (+v) s.belief[b.dataset.k] = +v; else delete s.belief[b.dataset.k]; }
    else if (a === 'belp') { const [, m, gs] = BEL[+v]; s.belief = { ...(s.belief || {}) }; if (belOn(s, m)) Object.keys(m).forEach(f => delete s.belief[f]); else { Object.assign(s.belief, m); gs.forEach(g => { if (!s.groups.includes(g)) s.groups.push(g); }); s.exf = (s.exf || []).filter(f => !(f in m)); } }
    else if (a === 'stkadd') {
      const M = LM(), q = ($('#stk_' + v).value || '').trim(); if (!q) return toast('종목명 입력 필요');
      let i = M.names.indexOf(q); if (i < 0) { const c = M.names.map((n, j) => [n, j]).filter(([n]) => n.includes(q)); if (c.length === 1) i = c[0][1]; }
      if (i < 0) return toast('종목명 확인 필요(목록에서 선택)');
      const code = M.codes[i];
      if (v === 'holdings') { const amt = Math.max(1, +$('#stka_holdings').value || 0) * 1e4; s.holdings = [...(s.holdings || []).filter(h => h.code !== code), { code, amt }].slice(-10); }
      else { s[v] = [...new Set([...(s[v] || []), code])].slice(-30); if (v === 'only') s.uni = 'watch'; }
    }
    else if (a === 'pkadd') {
      const val = $('#pk_' + v).value; if (!val) return;
      if (v === 'usst') { const pc = Math.max(1, Math.min(100, +$('#pka_usst').value || 10)); s.usst = [...(s.usst || []).filter(x => x.id !== val), { id: val, pct: pc }].slice(-10); }
      else { s.inds = [...new Set([...(s.inds || []), val])].slice(-20); s.uni = 'sector'; }
    }
    else if (a === 'stkdel') { const k = b.dataset.k; s[k] = (s[k] || []).filter((_, i) => i !== +v); if (k === 'only' && !s.only.length && s.uni === 'watch') s.uni = 'all'; if (k === 'inds' && !s.inds.length && s.uni === 'sector') s.uni = 'all'; }
    else if (a === 'xclr') { s.x = (s.x || []).filter(o => XI[o].rg !== v); }
    else if (a === 'rdel') { s.rules = s.rules.filter((_, i) => i !== +v); }
    else if (a === 'tog') { if (b.dataset.k === 'vf') s.vf = s.vf > 0 ? 0 : 0.3; else s.mf = !s.mf; }
    else if (a === 'nl') return parseNl();
    else if (a === 'run') return runCurrent();
    else if (a === 'opt') { S.tab = 'optimize'; return runOpt(v); }
    else if (a === 'adopt') {
      const x = S.opt.rows.find(r => r.tag === v);
      S.versions.push({ name: 'V' + (S.versions.length + 1), kind: x.kind, retrained: x.retrained, why: `${S.opt.label}: ${cname(x.change)}`, run: x.run });
      S.cur = x.run; S.spec = { ...S.spec, ...cl(x.run.s), preset: S.spec.preset }; S.opt = null; S.cashDemo = null; S.tab = S.mode === 'qs' ? 'versions' : 'validate'; window.scrollTo(0, 0); toast('후보 적용 완료');
    }
    else if (a === 'keep') { S.opt = null; toast('기존 버전 유지'); }
    else if (a === 'use') { S.cur = S.versions[+v].run; S.period = null; S.spec = { ...S.spec, ...cl(S.cur.s), preset: S.spec.preset }; S.opt = null; S.cashDemo = null; S.tab = 'validate'; }
    else if (a === 'cash') {
      const ns = { ...cl(S.cur.s), cash: S.cur.s.cash === 1e7 ? 1e6 : 1e7 };
      const r = await withBusy('투자금 변경 재계산 중', async log => { log('[정책 변경] 모델 재학습 없이 포트폴리오 재계산'); const run = await getRun(ns); await replay(run, log); return run; });
      if (r) S.cashDemo = { a: S.cur, b: r };
    }
    else if (a === 'copy') { const i = $('#share'); i.select(); try { await navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand('copy'); } return toast('링크 복사 완료'); }
    render();
  });
  app.addEventListener('change', ev => {
    const pe = ev.target.closest('[data-per]'); if (pe) { const Y0 = +CAT.periods.development[0].slice(0, 4), Y1 = +CAT.periods.development[1].slice(0, 4); S.period = { ...(S.period || { a: Y0, b: Y1 }), [pe.dataset.per]: +pe.value }; return render(); }
    const xv = ev.target.closest('[data-xv]'); if (xv) { const n = XI[xv.dataset.xv].num, val = Math.max(n.min, Math.min(n.max, +xv.value || n.def)); S.spec.xv = { ...(S.spec.xv || {}), [xv.dataset.xv]: val }; return render(); }
    const el = ev.target.closest('[data-act="sel"]'); if (!el) return;
    const k = el.dataset.k, v = el.value;
    S.spec[k] = k === 'algo' || k === 'preset' ? v : k === 'mf' ? v === 'true' : +v; render();
  });
  ['pointermove', 'pointerdown'].forEach(e => app.addEventListener(e, ev => { const el = ev.target.closest('.chart'); if (el) chartMove(el, ev); }));
  app.addEventListener('pointerleave', ev => { const el = ev.target.closest && ev.target.closest('.chart'); if (el) chartLeave(el); }, true);

  (async function init() {
    try {
      CAT = await fetch('data/catalog.json').then(r => r.json());
      labLoad().then(() => { if (S.mode && !S.busy && S.tab === 'create' && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) render(); }).catch(() => {});
      const qm = new URLSearchParams(location.search).get('mode');
      if (qm === 'my') S.mode = qm;
      const m = location.hash.match(/#r=(.+)/);
      if (m) { try { const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (o.s && Array.isArray(o.s.groups)) S.forked = { mode: o.m, spec: o.s }; } catch (e) { /* 잘못된 링크 무시 */ } }
      render();
    } catch (e) { app.innerHTML = '<div class="card">데이터 조회 실패. 새로 고침 후 재시도 필요</div>'; }
  })();
})();

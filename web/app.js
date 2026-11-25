/* 나만의 AI를 키움 시연 — 모바일 웹.
   화면의 모든 수치는 Python 엔진이 실제 과거 데이터로 계산한 결과(JSON)를 그대로 표시한다.
   LIVE 모드: 요청 시 서버에서 실시간 학습·검증. STATIC 모드: 같은 엔진으로 미리 실행해 둔 결과를 불러온다. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  let CAT = null, LIVE = false, AGENT = false, COST = null;
  const cache = new Map();
  const S = {
    mode: null, tab: 'create', busy: null, logs: [],
    spec: { groups: ['price', 'volume'], h: 5, algo: 'ridge', k: 5, buf: 1, vf: 0, mf: false, cash: 1000000, preset: 'balanced' },
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
  const horizonLabel = h => h === 5 ? '단기(약 1주)' : '중기(약 1개월)';
  const MYN = { '상위 3배수 이내 보유 유지': '보유 종목 교체 축소', '예측·보유 기간 20거래일': '보유 기간 연장(약 1개월)', '변동성·위험 변수 추가': '하락 위험 정보 추가', '변동성 상위 30% 종목 제외': '변동성 큰 종목 제외', '기업 규모 변수 추가': '기업 규모 정보 추가' };
  const cname = c => S.mode === 'my' ? (MYN[c] || c) : c;
  const SHORT = { price: '가격 흐름', volume: '거래량', risk: '위험', size: '기업 규모' };
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
    const n = { ...s, groups: [...s.groups] };
    const m = patch.model_spec || {}, p = patch.strategy_policy || {};
    if (m.add_groups) n.groups = [...new Set([...n.groups, ...m.add_groups])];
    if (m.remove_groups) n.groups = n.groups.filter(g => !m.remove_groups.includes(g));
    if (m.horizon_days) n.h = m.horizon_days;
    if (m.algorithm) n.algo = m.algorithm;
    if (p.volatility_filter != null) n.vf = p.volatility_filter;
    if (p.market_filter != null) n.mf = p.market_filter;
    if (p.keep_buffer != null) n.buf = p.keep_buffer;
    return n;
  };
  const sameSpec = (a, b) => JSON.stringify(toSpec(a)) === JSON.stringify(toSpec(b));
  const describe = s => [
    `정보: ${s.groups.map(g => GL()[g]).join(' + ')}`,
    `예측·보유: ${s.h}거래일`, `모델: ${s.algo === 'ridge' ? 'Ridge 회귀' : 'LightGBM'}`,
    `종목 수: 상위 ${s.k}개`, s.buf > 1 ? '상위권 종목 보유 유지' : null,
    s.vf > 0 ? `변동성 상위 ${s.vf * 100}% 제외` : null, s.mf ? '하락장 신규 매수 중단' : null,
    `투자금: ${man(s.cash)}`].filter(Boolean);

  /* ---------- 엔진 결과 가져오기 ---------- */
  async function getRun(s) {
    const key = JSON.stringify(toSpec(s));
    if (cache.has(key)) return cache.get(key);
    let r;
    if (LIVE) {
      const res = await fetch('api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ spec: toSpec(s, S.mode) }) });
      if (!res.ok) throw new Error((await res.json()).detail || '실행 실패');
      r = await res.json();
      r.source = r.model_status === 'trained' ? 'live_trained' : 'live_reused';
    } else {
      const k = staticKey(s);
      if (!k) throw new Error('사전 계산 범위 외 조합');
      const [run, model] = await Promise.all([
        fetch(`data/runs/${k.m}__${k.p}.json`).then(x => { if (!x.ok) throw new Error('결과 파일 없음'); return x.json(); }),
        fetch(`data/models/${k.m}.json`).then(x => x.json())]);
      r = run; r.model = model; r.source = 'precomputed';
    }
    r.s = { ...s, groups: [...s.groups] };
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
  const header = () => `<header class="top">${S.mode ? '<button class="back" data-act="home" aria-label="처음으로">‹</button>' : ''}<h1>나만의 AI를 키움</h1></header>`;
  const ICON = {
    home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/></svg>',
    set: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 19h16M7 15l4-5 3 3 5-7"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 20V6M6 11l6-6 6 6"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01"/></svg>',
  };
  const stage = m => /^\[설정/.test(m) ? '투자 기준 확인' : /재사용/.test(m) ? '기존 모델 확인' : /학습/.test(m) ? '모델 학습' : /가상 체결/.test(m) ? '가상 운용 검증' : /후보|연구 계획|제외/.test(m) ? '개선 후보 비교' : '계산 준비';
  const tabs = () => !S.mode ? '' : `<nav class="tabs"><div>${(S.mode === 'qs' ? [['create', '연구', 'set'], ['validate', '검증', 'chart'], ['optimize', '최적화', 'up'], ['versions', '버전', 'list']] : [['validate', '홈', 'home'], ['create', '설정', 'set'], ['optimize', '개선', 'up'], ['versions', '기록', 'list']])
    .map(([k, l, ic]) => `<button data-act="tab" data-v="${k}" aria-current="${S.tab === k}">${ICON[ic]}<span>${l}</span></button>`).join('')}</div></nav>`;
  const disclosures = () => `<details class="disc"><summary>투자 유의 사항</summary><ul>${CAT.disclosures.map(d => `<li>${esc(d)}</li>`).join('')}<li>과제 시연용 화면이며 키움증권의 실제 서비스가 아님</li></ul>
    데이터: ${esc(CAT.data.source)} · ${CAT.data.start}~${CAT.data.end}</details>`;

  function landing() {
    const f = S.forked;
    return `${header()}
      <div class="intro"><h2>개인 투자 기준 학습 AI</h2>
        <p class="sub">계좌 개설 전 체험 가능</p></div>
      ${f ? recipeCard(f.spec, '<button class="btn small" data-act="fork">설정 복제 후 수정</button>', '공유받은 설정') : ''}
      <div class="card"><h3>이용 순서</h3>
        <div class="kv"><span>01 투자 기준 선택</span><span>중시 정보, 보유 기간, 운용 방식</span></div>
        <div class="kv"><span>02 AI 학습·검증</span><span>실제 과거 시세, 거래 비용 반영</span></div>
        <div class="kv"><span>03 AI 개선</span><span>후보 비교, 채택 판정</span></div>
        </div>
      <div class="card"><button class="btn" data-act="acct">키움 계좌로 시작</button>
        <p class="sub" style="margin:8px 2px 16px">보유 자산 반영, 거래 내역 학습, 자동 주문, 운용 보고서</p>
        <button class="btn ghost" data-act="mode" data-v="my">${S.cur ? '나의 AI 조회' : '계좌 없이 시작'}</button>
        <p class="sub" style="margin:8px 2px 0">AI 학습, 과거 데이터 검증, 설정 공유</p>
        ${S.acct ? `<div class="note" style="margin-top:14px"><b>계좌 연결 후 제공 기능</b><br>보유 종목·현금 기준 AI 학습<br>나의 거래 내역 기반 학습<br>자동 매수·매도(주문 한도, 주문 전 승인)<br>주간·월간 운용 보고서<br><span class="muted">시연 화면은 계좌 연결 미지원. 계좌 없이 시작으로 체험 가능</span></div>` : ''}</div>
      <details class="card"><summary>서비스 안내</summary>
        <div class="kv"><span>검증 방식</span><span>실제 과거 시세, 거래 비용 반영</span></div>
        <div class="kv"><span>사용 데이터</span><span>국내주식 일봉 ${CAT.data.start.slice(0, 4)}~${CAT.data.end.slice(0, 7)}</span></div>
        <div class="kv"><span>이용 조건</span><span>계좌 개설 불필요, 주문 미연결</span></div>
        <div class="kv"><span>시연 범위</span><span>${LIVE ? '요청 시 서버 학습' : `사전 학습·검증 결과 ${CAT.index.runs.toLocaleString()}건 조회`}</span></div></details>
      ${disclosures()}`;
  }

  function createMy() {
    const s = S.spec, on = g => s.groups.includes(g);
    const chip = (g, l) => `<button class="chip" data-act="grp" data-v="${g}" aria-pressed="${on(g)}" ${g === 'price' ? 'data-lock="1"' : ''}>${l}</button>`;
    const adv = !!S.adv;
    return `<h2>투자 기준 설정</h2>
      <div class="seg"><button data-act="lvl" data-v="0" aria-pressed="${!adv}">일반</button><button data-act="lvl" data-v="1" aria-pressed="${adv}">고급</button></div>
      <p class="sub" style="margin:8px 4px 14px">${adv ? '운용 방식, 회피 조건, 우선 목표 직접 설정' : '핵심 항목 3가지 선택'}</p>
      <div class="card"><h3>중시하는 정보</h3>
        <div class="chips">${chip('price', '가격 흐름(필수)')}${chip('volume', '거래량')}${chip('risk', '하락 위험')}${chip('size', '기업 규모')}
          <button class="chip" disabled title="자료 미확보">기업 실적</button><button class="chip" disabled>배당</button><button class="chip" disabled>수급</button></div>
        <p class="muted">기업 실적·배당·수급은 제공 준비 중</p>
        </div><div class="card"><h3>보유 기간</h3>
        <div class="chips"><button class="chip" data-act="set" data-k="h" data-v="5" aria-pressed="${s.h === 5}">단기(약 1주)</button>
          <button class="chip" data-act="set" data-k="h" data-v="20" aria-pressed="${s.h === 20}">중기(약 1개월)</button></div>
        </div>${adv ? `<div class="card"><h3>학습 방식</h3>
        <div class="chips"><button class="chip" data-act="set" data-k="algo" data-v="ridge" aria-pressed="${s.algo === 'ridge'}">선형 회귀(Ridge)</button>
          <button class="chip" data-act="set" data-k="algo" data-v="lightgbm" aria-pressed="${s.algo === 'lightgbm'}">트리 기반(LightGBM)</button></div>
        </div><div class="card"><h3>분산 정도</h3>
        <div class="chips"><button class="chip" data-act="set" data-k="k" data-v="5" aria-pressed="${s.k === 5}">집중(5종목)</button>
          <button class="chip" data-act="set" data-k="k" data-v="10" aria-pressed="${s.k === 10}">분산(10종목)</button></div>
        </div><div class="card"><h3>교체 방식</h3>
        <div class="chips"><button class="chip" data-act="set" data-k="buf" data-v="1" aria-pressed="${s.buf === 1}">정기 교체</button>
          <button class="chip" data-act="set" data-k="buf" data-v="3" aria-pressed="${s.buf > 1}">보유 유지 우선</button></div>
        </div><div class="card"><h3>회피 조건(선택)</h3>
        <div class="chips"><button class="chip" data-act="tog" data-k="vf" aria-pressed="${s.vf > 0}">변동성 큰 종목 제외</button>
          <button class="chip" data-act="tog" data-k="mf" aria-pressed="${!!s.mf}">하락장 신규 매수 중단</button></div>
        </div><div class="card"><h3>우선 목표</h3>
        <div class="chips">${Object.keys(PRESET).map(k => `<button class="chip" data-act="set" data-k="preset" data-v="${k}" aria-pressed="${s.preset === k}">${PRESET[k]}</button>`).join('')}</div>
        <p class="muted">개선 후보 비교 시 우선순위 기준으로 사용</p>
        </div>` : ''}<div class="card"><h3>가상 투자금</h3>
        <div class="chips"><button class="chip" data-act="set" data-k="cash" data-v="1000000" aria-pressed="${s.cash === 1e6}">100만 원</button>
          <button class="chip" data-act="set" data-k="cash" data-v="10000000" aria-pressed="${s.cash === 1e7}">1,000만 원</button></div>
        </div><div class="card"><h3>추가 요청(선택)</h3>
        <textarea id="nl" placeholder="예: 변동성 큰 종목 제외, 거래 횟수 축소"></textarea>
        <button class="btn ghost small" data-act="nl">입력 내용 반영</button>
        ${S.planNote ? `<div class="note">${S.planNote}</div>` : ''}</div>
      ${adv ? `<div class="card"><h3>나의 전략 반영 <span class="badge">준비 중</span></h3>
        <div class="kv"><span>관심 업종·종목 범위</span><span>대상 종목 직접 지정</span></div>
        <div class="kv"><span>나의 매매 규칙</span><span>매수·매도 조건 직접 입력</span></div>
        <div class="kv"><span>나의 거래 내역</span><span>키움 계좌 거래 기록 학습</span></div>
        <p class="muted">계좌 개설 고객 대상 제공 예정(설계안)</p></div>` : ''}
      ${planCard()}
      <div class="cta"><button class="btn" data-act="run">${S.cur ? '변경 기준 재학습' : 'AI 학습 시작'}</button></div>`;
  }
  const planCard = () => {
    const s = S.spec;
    if (S.mode === 'my') return `<div class="card"><h3>구성 요약</h3>
      <div class="kv"><span>대상</span><span>국내주식 거래대금 상위 300종목</span></div>
      <div class="kv"><span>반영 정보</span><span>${s.groups.map(g => SHORT[g]).join('·')}</span></div>
      <div class="kv"><span>운용</span><span>점수 상위 ${s.k}종목, ${s.h === 5 ? '약 1주' : '약 1개월'} 주기 교체</span></div>
      ${[s.buf > 1 ? '보유 종목 교체 축소' : null, s.vf > 0 ? '변동성 큰 종목 제외' : null, s.mf ? '하락장 신규 매수 중단' : null].filter(Boolean).map(t => `<div class="kv"><span>추가 조건</span><span>${t}</span></div>`).join('')}
      <div class="kv"><span>우선 목표</span><span>${PRESET[s.preset || 'balanced']}</span></div>
      <div class="kv"><span>검증 기간</span><span>${CAT.periods.development[0].slice(0, 4)}~${CAT.periods.development[1].slice(0, 4)}년</span></div>
      <div class="kv"><span>거래 비용</span><span>수수료·세금·슬리피지 반영</span></div>
      ${S.adv ? `<div class="kv"><span>학습 방식</span><span>${s.algo === 'ridge' ? '선형 회귀(Ridge)' : '트리 기반(LightGBM)'}, 연 단위 전진 분석</span></div>
      <div class="kv"><span>학습 구간</span><span>검증 연도 직전 4년</span></div>
      <div class="kv"><span>체결 기준</span><span>결정일 익일 시가(일봉)</span></div>
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
      <p class="muted">실제 과거 시세 기반 계산</p></div>`;
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
      const k0 = r.s.cash / r.series.strategy[idx[0]], cut = a => idx.map(i => a[i]);
      s = { dates: cut(r.series.dates), strategy: cut(r.series.strategy).map(v => v * k0), market: cut(r.series.market).map(v => v * r.s.cash / r.series.market[idx[0]]), universe: cut(r.series.universe).map(v => v * r.s.cash / r.series.universe[idx[0]]) };
      let pk = -1, mdd = 0, pi = 0, a = 0, b = 0;
      s.strategy.forEach((v, i) => { if (v > pk) { pk = v; pi = i; } const x = v / pk - 1; if (x < mdd) { mdd = x; a = pi; b = i; } });
      const nt = ys.reduce((n, y) => n + y.n_trades, 0);
      d = { from: String(P.a), to: String(P.b), start_value: r.s.cash, end_value: r.s.cash * (1 + tot), total_return: tot, cagr: Math.pow(1 + tot, 1 / yrs) - 1, mdd, mdd_peak: s.dates[a], mdd_trough: s.dates[b], mdd_recovered: null, custom: true,
        trades_per_year: nt / yrs, explicit_cost_krw: ys.reduce((n, y) => n + y.cost, 0) };
      mkc = Math.pow(1 + mt, 1 / yrs) - 1;
    }
    const yopt = (k, lo, hi) => `<select data-per="${k}" aria-label="${k === 'a' ? '시작 연도' : '종료 연도'}">${r.yearly.filter(y => y.year >= lo && y.year <= hi).map(y => `<option value="${y.year}" ${P[k] === y.year ? 'selected' : ''}>${y.year}년${y.days < 200 ? '(' + r.series.dates[r.series.dates.length - 1].slice(5, 7).replace(/^0/, '') + '월까지)' : ''}</option>`).join('')}</select>`;
    const perSel = r.yearly ? `<div class="per"><span>검증 기간</span>${yopt('a', Y0, P.b)}<i>~</i>${yopt('b', P.a, 9999)}</div>` : '';
    const ver = S.versions.find(v => v.run.run_id === r.run_id);
    const chart = lineChart(s.dates, [
      { name: '모델 가상 운용', short: '모델', color: 'var(--s1)', values: s.strategy, main: true },
      { name: '코스피 대용(시가총액 가중 산출)', short: '코스피 대용', color: 'var(--s2)', values: s.market },
      { name: '대상 300종목 동일가중', short: '300종목', color: 'var(--s3)', dash: '3 3', values: s.universe }],
      { fmt: v => Math.round(v / 1e4).toLocaleString() + '만', split: CAT.periods.locked_final[0], base: r.s.cash, log: true, label: '가상 평가금액 추이(로그 축)' });
    const roll = r.rolling_6m, imp = r.model.importance_last_fold.slice(0, qs ? 20 : 5), mx = imp[0].share;
    const sk = r.ledger_summary.skipped;
    const bv = !custom && ver && S.versions.indexOf(ver) > 0 ? S.versions[0].run.metrics.development : null;
    const head = S.mode === 'qs' ? `<h2>${ver ? ver.name + ' · ' : ''}검증 결과</h2>
      <p class="sub">${describe(r.s).map(esc).join(' · ')}</p><p>${srcBadge(r)} <span class="badge">모델 ${r.model_id}</span> <span class="badge">정책 ${r.policy_id}</span></p>`
      : `<h2>${esc(aiTitle(r.s))} ${ver ? ver.name : ''}</h2>
      <p class="sub">${r.s.groups.map(g => SHORT[g]).join('·')} 정보 · ${horizonLabel(r.s.h)} · ${r.s.buf > 1 ? '낮은 거래 빈도' : '정기 교체'}${r.s.mf ? ' · 하락장 신규 매수 중단' : ''}</p>`;
    const verdictNote = bv ? `<p class="sub">${d.cagr >= 0 ? '원금 대비 수익 발생' : bv.cagr < d.cagr ? '기존 모델 대비 손실 폭 감소, 원금 손실 발생' : '원금 손실 발생'}</p>` : `<p class="sub">${d.cagr >= 0 ? '원금 대비 수익 발생' : '원금 손실 발생'}</p>`;
    const ck = staticKey(r.s), cr = COST && ck ? COST[`${ck.m}__${ck.p}`] : null;
    const costCard = cr ? `<div class="card"><h3>거래 비용 가정별 결과</h3><p class="sub">동일 예측 모델, 비용 가정 변경 시 ${Y0}~${Y1}년 성과</p>
        <div class="scroll"><table><tr><th>비용 가정</th><th>연 수익률</th><th>최대 낙폭</th></tr>
        <tr><td>비용 없음</td><td class="${cls(cr.zero_cost[0])}">${pct(cr.zero_cost[0])}</td><td>${pct(cr.zero_cost[1])}</td></tr>
        <tr class="bestrow"><td>기본 가정</td><td class="${cls(d0.cagr)}">${pct(d0.cagr)}</td><td>${pct(d0.mdd)}</td></tr>
        <tr><td>슬리피지 3배</td><td class="${cls(cr.high_slippage[0])}">${pct(cr.high_slippage[0])}</td><td>${pct(cr.high_slippage[1])}</td></tr></table></div>
        <p class="muted">기본 가정: 수수료 0.015%, 매도 시 거래세 0.20%, 슬리피지 편도 0.10%. 슬리피지 3배: 편도 0.30%</p></div>` : '';
    const led = qs ? r.ledger_tail : r.ledger_tail.filter(l => l.side !== '매수불가');
    const askCard = `<div class="card" data-keep="1"><h3>AI 개선</h3>${['reduce_loss', 'less_trading', 'more_data'].map(k => `<button class="rowbtn" data-act="opt" data-v="${k}"><span>${CAT.improvements[k].label}</span><i>›</i></button>`).join('')}</div>`;
    return `${head}
      <div class="card" data-keep="1">${perSel}<p class="sub">${d.from.slice(0, 4)}${d.from.slice(0, 4) === d.to.slice(0, 4) ? '' : '~' + d.to.slice(0, 4)}년 과거 검증 · ${man(d.start_value)} 투자 가정</p>
        <div class="hero ${cls(d.total_return)}">${won(d.end_value)} <small>${pct(d.total_return)} · 연 ${pct(d.cagr)}</small></div>${verdictNote}
        ${chart}
        <div class="tiles">
          <div class="tile"><div class="k">최대 낙폭</div><div class="v down">${pct(d.mdd)}</div><div class="n">${d.mdd_peak.slice(2, 7).replace('-', '.')}~${d.mdd_trough.slice(2, 7).replace('-', '.')}${d.custom ? '' : d.mdd_recovered ? ' · 회복 ' + d.mdd_recovered.slice(2, 7).replace('-', '.') : ' · 미회복'}</div></div>
          <div class="tile"><div class="k">거래 횟수</div><div class="v">연 ${Math.round(d.trades_per_year)}회</div><div class="n">수수료·세금 ${won(d.explicit_cost_krw)}</div></div>
          <div class="tile"><div class="k">동일 기간 코스피 대용</div><div class="v ${cls(mkc)}">연 ${pct(mkc)}</div><div class="n">비용·배당 미반영</div></div>
          <div class="tile"><div class="k">투자금 부족 매수 불가</div><div class="v">${sk.unaffordable}건</div><div class="n">전체 기간 · 거래정지·상한가 ${sk.untradable_buy}건</div></div>
        </div></div>
      ${askCard}${costCard}
      <div class="card"><h3>최종 평가 구간(${f.from}~${f.to})</h3>
        <p class="sub">후보 선정 미사용 기간</p>
        <div class="kv"><span>모델</span><span class="${cls(f.total_return)}">${pct(f.total_return)} (낙폭 ${pct(f.mdd)})</span></div>
        <div class="kv"><span>코스피 대용</span><span class="${cls(r.benchmarks.market.final.total_return)}">${pct(r.benchmarks.market.final.total_return)} (낙폭 ${pct(r.benchmarks.market.final.mdd)})</span></div>
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
          ${benchRow('전략(비용 반영)', d)}${benchRow('코스피 대용', r.benchmarks.market.dev)}${benchRow('300종목 동일가중', r.benchmarks.universe.dev)}
          <tr><th>최종 평가 구간</th><th></th><th></th><th></th><th></th></tr>
          ${benchRow('전략(비용 반영)', f)}${benchRow('코스피 대용', r.benchmarks.market.final)}${benchRow('300종목 동일가중', r.benchmarks.universe.final)}</table></div>
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
      ${custom ? '<p class="muted" style="margin:0 4px">선택 기간의 최대 낙폭은 주간 평가금액 기준 산출</p>' : ''}
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
        <div class="note">${qs ? `목적함수(${PRESET[S.spec.preset]}) 기준 최상위 후보: <b>${o.best}</b>. 수익률 또는 최대 낙폭 악화 시 채택 보류 판정. 최종 평가 구간 수치는 후보 선정에 미사용` : '수익률 또는 최대 낙폭 악화 후보는 채택 보류 판정'}</div>
        <button class="btn ghost small" data-act="keep">기존 유지</button></div>
        <div class="card"><h3>버전별 가상 평가금액</h3>${compareChart(o.rows.filter(x => !x.error).map(x => ({ name: x.tag + ' ' + cname(x.change), short: x.tag, run: x.run })))}</div>`;
    }
    const cd = S.cashDemo;
    if (S.opt && !S.opt.rows.some(x => !x.error && x.kind !== 'base')) res = `<div class="card"><h3>${esc(S.opt.label)}</h3><p class="sub">해당 항목은 현재 설정에 반영된 상태이며 추가 후보 없음</p>
      ${S.opt.rows.filter(x => x.error).map(x => `<div class="kv"><span>${esc(cname(x.change))}</span><span>반영 완료</span></div>`).join('')}</div>`;
    return `<h2>AI 개선</h2>
      <p class="sub">개선 방향 선택 시 실제 데이터 기준 후보 비교</p>
      <div class="card"><h3>개선 방향</h3>${btns}</div>${res}
      <div class="card"><h3>투자금 변경</h3><p class="sub">${qs ? '예측 모델 유지, 포트폴리오 재계산(재학습 없음)' : '동일 AI 기준 투자금별 결과 비교'}</p>
        <button class="btn ghost small" data-act="cash">${S.cur.s.cash === 1e6 ? '투자금 1,000만 원 기준 계산' : '투자금 100만 원 기준 계산'}</button>
        ${cd ? `${qs ? `<div class="kv"><span>모델</span><span>${cd.a.model_id} = ${cd.b.model_id} (동일)</span></div>` : ''}
          <div class="kv"><span>연 수익률</span><span>${man(cd.a.s.cash)} ${pct(cd.a.metrics.development.cagr)} / ${man(cd.b.s.cash)} ${pct(cd.b.metrics.development.cagr)}</span></div>
          <div class="kv"><span>투자금 부족 매수 불가</span><span>${cd.a.ledger_summary.skipped.unaffordable}건 / ${cd.b.ledger_summary.skipped.unaffordable}건</span></div>
          <div class="kv"><span>연 거래 횟수</span><span>${Math.round(cd.a.metrics.development.trades_per_year)} / ${Math.round(cd.b.metrics.development.trades_per_year)}</span></div>
          <p class="muted">예측값 동일 시에도 투자금에 따라 매수 가능 종목과 성과 상이. 키움 계좌 연결 시 실제 보유 종목·현금 기준 산정(본 시연은 실계좌 미연결)</p>` : ''}</div>`;
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
    return `<h2>${S.mode === 'qs' ? '모델 버전' : '버전 기록'}</h2>
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
        <div class="kv"><span>자동 주문</span><span>채택 가능 판정 AI, 한도 설정, 주문 전 승인</span></div>
        <div class="kv"><span>운용 보고서</span><span>주간·월간 성과, 거래 내역, 개선 제안</span></div>
        <button class="btn small" disabled>영웅문S# 이동</button>
        <p class="muted">계좌 연계 기능은 설계안이며 준법 검토 전제. 시연 화면은 앱 연결·실계좌·주문 미지원</p></div>`;
  }
  const recipeCard = (s, action, label) => `<div class="card sel"><p class="muted">${label}</p><h3 style="font-size:16px">${esc(aiTitle(s))}</h3>
      <div class="kv"><span>반영 정보</span><span>${s.groups.map(g => SHORT[g]).join(' · ')}</span></div>
      <div class="kv"><span>보유 기간</span><span>${s.h}거래일(${s.h === 5 ? '약 1주' : '약 1개월'})</span></div>
      <div class="kv"><span>최적화 기준</span><span>${PRESET[s.preset || 'balanced']}</span></div>
      ${action}<p class="muted">공유 제외: 수익률, 종목, 개인 자산 정보</p></div>`;
  const shareUrl = () => location.origin + location.pathname + '#r=' + btoa(unescape(encodeURIComponent(JSON.stringify({ m: S.mode, s: S.cur ? S.cur.s : S.spec }))));

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
      const d = document.createElement('details'); d.className = 'card'; const sm = document.createElement('summary'); sm.textContent = h.textContent; h.remove(); d.appendChild(sm);
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
    const head = isNew ? [`[신규 학습] 모델 ${r.model_id}${LIVE ? '' : ' (사전 실행 학습 기록 재생)'}`, ...(r.model.training_log || []).filter(l => !l.startsWith('[신규'))]
      : [`[모델 재사용] ${r.model_id} · 재학습 없이 운용 정책 재계산`];
    const lines = [...head, ...r.logs.filter(l => l.startsWith('[가상 체결]'))];
    for (const l of lines) { log(l); await sleep(LIVE ? 20 : 110); }
  }
  async function runCurrent() {
    const s = { ...S.spec, groups: [...S.spec.groups] };
    if (S.cur && sameSpec({ ...s, preset: S.cur.s.preset }, S.cur.s)) { const ch = s.preset !== S.cur.s.preset; S.cur.s.preset = s.preset; S.tab = 'validate'; render(); window.scrollTo(0, 0); return toast(ch ? '우선 목표 변경 반영' : '변경 사항 없음'); }
    const prev = S.cur ? S.versions : null;
    const r = await withBusy(S.mode === 'qs' ? '연구 실행 중' : '학습 중', async log => {
      log(`[설정] ${describe(s).join(' · ')}`);
      const run = await getRun(s); await replay(run, log); return run;
    });
    if (!r) return;
    S.cur = r; S.opt = null; S.cashDemo = null;
    const why = S.mode === 'qs' ? describe(s).slice(0, 3).join(' · ') : s.groups.map(g => SHORT[g]).join('·') + ' 정보 · ' + horizonLabel(s.h);
    S.versions = prev ? [...prev, { name: 'V' + (prev.length + 1), kind: 'model', retrained: true, why: '설정 변경: ' + why, run: r }] : [{ name: 'V1', kind: 'base', why: '최초 설정: ' + why, run: r }];
    S.tab = 'validate'; render(); window.scrollTo(0, 0);
  }
  async function runOpt(req) {
    const imp = CAT.improvements[req], baseS = S.cur.s;
    const out = await withBusy(`${imp.label} 후보 실험 중`, async log => {
      log(`[연구 계획] ${imp.plan}`);
      const rows = [{ tag: (S.versions.find(v => v.run.run_id === S.cur.run_id) || { name: 'V' + S.versions.length }).name, kind: 'base', change: '기존', run: S.cur, retrained: false }];
      let n = 0;
      for (const c of imp.candidates) {
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
    const s = S.spec, notes = [];
    const add = g => { if (!s.groups.includes(g)) s.groups.push(g); };
    if (/변동|위험|손실|안정|불안/.test(t)) { add('risk'); notes.push('하락 위험 정보 추가'); }
    if (/피하|제외|빼|싫/.test(t) && /변동|위험|급등/.test(t)) { s.vf = 0.3; notes.push('변동성 상위 30% 종목 제외'); }
    if (/거래량|거래대금/.test(t)) { add('volume'); notes.push('거래량 정보 추가'); }
    if (/규모|대형|시가총액|우량/.test(t)) { add('size'); notes.push('기업 규모 정보 추가'); }
    if (/며칠|단기|스윙|일주일/.test(t)) { s.h = 5; notes.push('5거래일 기준'); }
    if (/몇 ?주|한 ?달|장기|오래|길게|자주.*(어렵|어려|않|못|힘들)|바빠|바쁘|직장/.test(t)) { s.h = 20; notes.push('20거래일 기준'); }
    if (/자주.*(어렵|어려|않|못|힘들)|거래.*(줄|적게|축소|감소)|수수료/.test(t)) { s.buf = 3; notes.push('상위권 종목 보유 유지(거래 감소)'); }
    if (/하락장|시장.*(나쁠|떨어)/.test(t)) { s.mf = true; notes.push('하락장 신규 매수 중단'); }
    const no = [];
    if (/실적|재무|PER|PBR|배당|수급|외국인|기관|뉴스/i.test(t)) no.push('실적·배당·수급·뉴스 데이터 미지원');
    if (/추천|뭐 ?사|사야|사도|살까|팔까|팔아|매수해|매도해|오를|될까/.test(t)) no.push('종목 추천·매수 권유 미제공(과거 데이터 연구로 한정)');
    return (notes.length ? '<b>반영:</b> ' + notes.join(', ') : '반영 가능한 조건 없음') + (no.length ? '<br><b>미지원:</b> ' + no.join(' / ') : '') + '<br><span class="muted">규칙 기반 해석</span>';
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
    S.planNote = parseText(t); render();
  }

  app.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, v = b.dataset.v, s = S.spec;
    if (a === 'home') { S.mode = null; S.tab = 'create'; }
    else if (a === 'mode') { if (S.last && S.last !== v) { S.store = S.store || {}; S.store[S.last] = { cur: S.cur, versions: S.versions, opt: S.opt, cashDemo: S.cashDemo, spec: S.spec }; Object.assign(S, S.store[v] || { cur: null, versions: [], opt: null, cashDemo: null, spec: { ...S.spec, groups: [...S.spec.groups] } }); } S.last = v; S.mode = v; S.tab = S.cur ? 'validate' : 'create'; window.scrollTo(0, 0); }
    else if (a === 'fork') { S.spec = { ...S.spec, ...S.forked.spec }; S.mode = 'my'; S.forked = null; S.tab = 'create'; S.adv = S.spec.k !== 5 || S.spec.buf > 1 || S.spec.vf > 0 || !!S.spec.mf; toast('설정 복제 완료'); }
    else if (a === 'tab') { S.tab = v; window.scrollTo(0, 0); }
    else if (a === 'grp') { if (b.dataset.lock) return toast('가격 흐름은 필수 항목'); const ng = s.groups.includes(v) ? s.groups.filter(g => g !== v) : [...s.groups, v]; if (!LIVE && !Object.values(CAT.feature_sets).some(f => [...f].sort().join() === [...ng].sort().join())) return toast('해당 조합은 준비 중'); s.groups = ng; }
    else if (a === 'set') { s[b.dataset.k] = b.dataset.k === 'preset' || b.dataset.k === 'algo' ? v : +v; }
    else if (a === 'acct') { S.acct = !S.acct; }
    else if (a === 'lvl') { S.adv = v === '1'; }
    else if (a === 'tog') { if (b.dataset.k === 'vf') s.vf = s.vf > 0 ? 0 : 0.3; else s.mf = !s.mf; }
    else if (a === 'nl') return parseNl();
    else if (a === 'run') return runCurrent();
    else if (a === 'opt') { S.tab = 'optimize'; return runOpt(v); }
    else if (a === 'adopt') {
      const x = S.opt.rows.find(r => r.tag === v);
      S.versions.push({ name: 'V' + (S.versions.length + 1), kind: x.kind, retrained: x.retrained, why: `${S.opt.label}: ${cname(x.change)}`, run: x.run });
      S.cur = x.run; S.spec = { ...S.spec, ...x.run.s, preset: S.spec.preset }; S.opt = null; S.cashDemo = null; S.tab = S.mode === 'qs' ? 'versions' : 'validate'; window.scrollTo(0, 0); toast('후보 적용 완료');
    }
    else if (a === 'keep') { S.opt = null; toast('기존 버전 유지'); }
    else if (a === 'use') { S.cur = S.versions[+v].run; S.spec = { ...S.spec, ...S.cur.s, preset: S.spec.preset }; S.opt = null; S.cashDemo = null; S.tab = 'validate'; }
    else if (a === 'cash') {
      const ns = { ...S.cur.s, cash: S.cur.s.cash === 1e6 ? 1e7 : 1e6 };
      const r = await withBusy('투자금 변경 재계산 중', async log => { log('[정책 변경] 모델 재학습 없이 포트폴리오 재계산'); const run = await getRun(ns); await replay(run, log); return run; });
      if (r) S.cashDemo = { a: S.cur, b: r };
    }
    else if (a === 'copy') { const i = $('#share'); i.select(); try { await navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand('copy'); } return toast('링크 복사 완료'); }
    render();
  });
  app.addEventListener('change', ev => {
    const pe = ev.target.closest('[data-per]'); if (pe) { const Y0 = +CAT.periods.development[0].slice(0, 4), Y1 = +CAT.periods.development[1].slice(0, 4); S.period = { ...(S.period || { a: Y0, b: Y1 }), [pe.dataset.per]: +pe.value }; return render(); }
    const el = ev.target.closest('[data-act="sel"]'); if (!el) return;
    const k = el.dataset.k, v = el.value;
    S.spec[k] = k === 'algo' || k === 'preset' ? v : k === 'mf' ? v === 'true' : +v; render();
  });
  ['pointermove', 'pointerdown'].forEach(e => app.addEventListener(e, ev => { const el = ev.target.closest('.chart'); if (el) chartMove(el, ev); }));
  app.addEventListener('pointerleave', ev => { const el = ev.target.closest && ev.target.closest('.chart'); if (el) chartLeave(el); }, true);

  (async function init() {
    try {
      CAT = await fetch('data/catalog.json').then(r => r.json());
      try { COST = await fetch('data/cost.json').then(r => r.ok ? r.json() : null); } catch (e) { /* 비용 비교 생략 */ }
      try { const h = await fetch('api/health').then(r => r.ok ? r.json() : null); if (h && h.mode === 'live') { LIVE = true; AGENT = !!h.agent; } } catch (e) { /* 정적 모드 */ }
      const qm = new URLSearchParams(location.search).get('mode');
      if (qm === 'my') S.mode = qm;
      const m = location.hash.match(/#r=(.+)/);
      if (m) { try { const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (o.s && Array.isArray(o.s.groups)) S.forked = { mode: o.m, spec: o.s }; } catch (e) { /* 잘못된 링크 무시 */ } }
      render();
    } catch (e) { app.innerHTML = '<div class="card">데이터 조회 실패. 새로 고침 후 재시도 필요</div>'; }
  })();
})();

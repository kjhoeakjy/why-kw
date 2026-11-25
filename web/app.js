/* KIWOOM AI FACTORY PoC — 모바일 웹.
   화면의 모든 수치는 Python 엔진이 실제 과거 데이터로 계산한 결과(JSON)를 그대로 표시한다.
   LIVE 모드: 요청 시 서버에서 실시간 학습·검증. STATIC 모드: 같은 엔진으로 미리 실행해 둔 결과를 불러온다. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app');
  let CAT = null, LIVE = false, AGENT = false;
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
  const man = v => v >= 1e8 ? (v / 1e8).toFixed(2) + '억원' : Math.round(v / 1e4).toLocaleString('ko-KR') + '만원';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); };
  const GL = () => Object.fromEntries(Object.entries(CAT.feature_groups).map(([k, v]) => [k, v.label]));
  const horizonLabel = h => h === 5 ? '며칠(5거래일)' : '몇 주(20거래일)';

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
    `종목 수: 상위 ${s.k}개`, s.buf > 1 ? '상위권 유지 시 계속 보유' : null,
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
      if (!k) throw new Error('이 조합은 미리 계산해 둔 범위에 없습니다. 실시간 서버 모드에서 실행할 수 있습니다.');
      const [run, model] = await Promise.all([
        fetch(`data/runs/${k.m}__${k.p}.json`).then(x => { if (!x.ok) throw new Error('결과 파일을 찾지 못했습니다.'); return x.json(); }),
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
  const srcBadge = r => r.source === 'precomputed' ? '<span class="badge pre">사전 계산(동일 엔진)</span>'
    : r.source === 'live_trained' ? '<span class="badge live">방금 실제 학습</span>' : '<span class="badge live">실시간 · 모델 재사용</span>';

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
      if (si > 0) g += `<line x1="${x(si)}" x2="${x(si)}" y1="${T}" y2="${H - B}" stroke="var(--axis)" stroke-dasharray="3 3"/><text x="${x(si) + 4}" y="${T + 10}" font-size="10" fill="var(--muted)">잠금 평가 →</text>`;
    }
    if (opt.base != null) g += `<line x1="${L}" x2="${W - R}" y1="${y(opt.base)}" y2="${y(opt.base)}" stroke="var(--axis)" stroke-width="1"/>`;
    const ends = series.map(s => ({ s, y: y(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
    const paths = series.map(s => `<path d="${s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join('')}" fill="none" stroke="${s.color}" stroke-width="${s.main ? 2.4 : 1.6}" stroke-linejoin="round"/>`).join('');
    const labels = ends.map(e => `<text x="${W - R + 5}" y="${e.y + 4}" font-size="10.5" fill="var(--ink2)">${esc(e.s.short || e.s.name)}</text>`).join('');
    charts[id] = { dates, series, x, y, L, R, W, H, T, B, fmt };
    const legend = `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
    return `${legend}<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label || '추이 차트')}">${g}${paths}${labels}<line class="cross" y1="${T}" y2="${H - B}" stroke="var(--ink2)" stroke-width="1" style="display:none"/></svg><div class="tip"></div></div>`;
  }
  function chartMove(el, ev) {
    const c = charts[el.dataset.chart]; if (!c) return;
    const rect = el.getBoundingClientRect(), px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left) / rect.width * c.W;
    const i = Math.max(0, Math.min(c.dates.length - 1, Math.round((px - c.L) / (c.W - c.L - c.R) * (c.dates.length - 1))));
    const cross = $('.cross', el), tip = $('.tip', el);
    cross.setAttribute('x1', c.x(i)); cross.setAttribute('x2', c.x(i)); cross.style.display = '';
    tip.innerHTML = `<b>${c.dates[i]}</b><br>` + c.series.map(s => `<span style="color:${s.color}">●</span> ${esc(s.short || s.name)} ${c.fmt(s.values[i])}`).join('<br>');
    tip.style.display = 'block';
    tip.style.left = Math.max(70, Math.min(rect.width - 70, c.x(i) / c.W * rect.width)) + 'px'; tip.style.top = '40px';
  }
  const chartLeave = el => { $('.cross', el).style.display = 'none'; $('.tip', el).style.display = 'none'; };

  /* ---------- 화면 조각 ---------- */
  const header = () => `<header class="top"><h1>${S.mode === 'qs' ? 'QUANT STUDIO' : S.mode === 'my' ? 'MY AI' : 'AI FACTORY'}</h1>
    <span class="badge ${LIVE ? 'live' : 'pre'}">${LIVE ? '실시간 학습 서버' : '사전 계산 모드'}</span>
    ${S.mode ? '<button data-act="home">처음</button>' : ''}</header>`;
  const tabs = () => !S.mode ? '' : `<nav class="tabs"><div>${[['create', S.mode === 'qs' ? '연구' : '만들기'], ['validate', '검증'], ['optimize', S.mode === 'qs' ? '최적화' : '개선'], ['versions', '버전']]
    .map(([k, l]) => `<button data-act="tab" data-v="${k}" aria-current="${S.tab === k}">${l}</button>`).join('')}</div></nav>`;
  const disclosures = () => `<footer class="disc"><b>꼭 확인하세요</b><ul>${CAT.disclosures.map(d => `<li>${esc(d)}</li>`).join('')}<li>신입사원 과제용 시연(PoC)이며 실제 키움증권 서비스가 아닙니다.</li></ul>
    데이터: ${esc(CAT.data.source)} · ${CAT.data.start}~${CAT.data.end} · ${CAT.data.rows.toLocaleString()}행 · 스냅샷 ${CAT.data.snapshot_id}</footer>`;

  function landing() {
    const f = S.forked;
    return `${header()}
      <h2>내 투자 기준으로<br>학습하는 투자 AI</h2>
      <p class="sub">계좌도, 가입도 필요 없습니다. 기준을 고르면 실제 국내주식 과거 데이터로 모델을 학습하고, 가상 투자금으로 검증합니다.</p>
      ${f ? `<div class="card sel"><h3>공유받은 연구 레시피</h3><p class="sub">${describe(f.spec).map(esc).join(' · ')}</p>
        <button class="btn small" data-act="fork">내 기준으로 다시 만들기</button><p class="muted">수익률이나 종목이 아니라 연구 설정만 공유됩니다.</p></div>` : ''}
      <div class="modepick">
        <button data-act="mode" data-v="my"><b>간편하게 이용 · MY AI</b><span class="sub">두세 가지만 고르면 AI가 연구를 설계하고 학습합니다.</span></button>
        <button data-act="mode" data-v="qs"><b>직접 연구 · QUANT STUDIO</b><span class="sub">데이터·Target·모델·전략·목적함수를 직접 정합니다.</span></button>
      </div>
      <div class="card tight"><div class="kv"><span>사용 데이터</span><span>국내주식 일봉 ${CAT.data.start.slice(0, 4)}~${CAT.data.end.slice(0, 7)}</span></div>
        <div class="kv"><span>실제 학습·검증 실행 수</span><span>${CAT.index.runs.toLocaleString()}건 (모델 ${Object.keys(CAT.index.models).length}개)</span></div>
        <div class="kv"><span>현재 모드</span><span>${LIVE ? '요청할 때마다 서버에서 학습' : '같은 엔진으로 미리 실행한 결과 표시'}</span></div></div>
      ${disclosures()}`;
  }

  function createMy() {
    const s = S.spec, on = g => s.groups.includes(g);
    const chip = (g, l) => `<button class="chip" data-act="grp" data-v="${g}" aria-pressed="${on(g)}" ${g === 'price' ? 'data-lock="1"' : ''}>${l}</button>`;
    return `<h2>내 방식으로<br>시장을 살펴보기</h2>
      <div class="card"><h3>어떤 정보를 중요하게 보나요?</h3>
        <div class="chips">${chip('price', '가격 흐름')}${chip('volume', '거래량')}${chip('risk', '하락 위험')}${chip('size', '기업 규모')}
          <button class="chip" disabled title="자료 미확보">기업 실적</button><button class="chip" disabled>배당</button><button class="chip" disabled>수급</button></div>
        <p class="muted">기업 실적·배당·수급은 시점이 검증된 자료가 아직 없어 선택할 수 없습니다.</p>
        <h3 style="margin-top:14px">평소 얼마나 보유하나요?</h3>
        <div class="chips"><button class="chip" data-act="set" data-k="h" data-v="5" aria-pressed="${s.h === 5}">며칠</button>
          <button class="chip" data-act="set" data-k="h" data-v="20" aria-pressed="${s.h === 20}">몇 주</button></div>
        <h3 style="margin-top:14px">가상 투자금</h3>
        <div class="chips"><button class="chip" data-act="set" data-k="cash" data-v="1000000" aria-pressed="${s.cash === 1e6}">100만원</button>
          <button class="chip" data-act="set" data-k="cash" data-v="10000000" aria-pressed="${s.cash === 1e7}">1,000만원</button></div>
        <label class="f" for="nl">말로 설명해도 됩니다 (선택)</label>
        <textarea id="nl" placeholder="예: 변동성 큰 종목은 피하고 싶고 자주 사고팔기는 어려워요"></textarea>
        <button class="btn ghost small" data-act="nl">입력한 내용 반영하기</button>
        ${S.planNote ? `<div class="note">${S.planNote}</div>` : ''}</div>
      ${planCard()}
      <button class="btn" data-act="run">내 기준 적용하기</button>`;
  }
  const planCard = () => {
    const s = S.spec;
    return `<div class="card"><h3>금융 AI의 연구 계획</h3>
      <div class="plan">국내주식 거래대금 상위 300종목에서 <b>${s.groups.map(g => GL()[g]).join('·')}</b> 정보로
      <b>${s.h}거래일 뒤 수익률</b>을 예측하는 모델을 학습합니다. 매 ${s.h}거래일마다 점수 상위 <b>${s.k}종목</b>을 다음 날 시가에 가상 매수하고,
      ${man(s.cash)}으로 ${CAT.periods.development[0].slice(0, 4)}~${CAT.periods.development[1].slice(0, 4)}년을 검증한 뒤 ${CAT.periods.locked_final[0].slice(0, 4)}년 이후는 따로 확인합니다.</div>
      <p class="muted">${esc(CAT.cost_models.kr_default.label)}</p></div>`;
  };

  function createQs() {
    const s = S.spec, G = CAT.grid;
    const opt = (k, vals, lab) => `<select data-act="sel" data-k="${k}">${vals.map(v => `<option value="${v}" ${String(s[k]) === String(v) ? 'selected' : ''}>${lab(v)}</option>`).join('')}</select>`;
    return `<h2>새 연구 프로젝트</h2>
      <div class="card"><h3>1. Data & Feature</h3>
        <div class="chips">${Object.entries(CAT.feature_groups).map(([g, v]) => `<button class="chip" data-act="grp" data-v="${g}" aria-pressed="${s.groups.includes(g)}" ${g === 'price' ? 'data-lock="1"' : ''}>${v.label} (${v.features.length})</button>`).join('')}</div>
        <details><summary>변수 ${s.groups.reduce((n, g) => n + CAT.feature_groups[g].features.length, 0)}개 보기</summary>
          <p class="sub">${s.groups.flatMap(g => CAT.feature_groups[g].features.map(f => esc(f.label))).join(', ')}</p></details>
        <p class="muted">미지원: ${Object.values(CAT.unavailable).map(esc).join(' / ')}</p></div>
      <div class="card"><h3>2. Target & Model</h3>
        <label class="f">Target (결정일 다음 시가 진입 → N거래일 뒤 시가 청산 수익률)</label>${opt('h', CAT.horizons, v => v + '거래일')}
        <label class="f">알고리즘</label>${opt('algo', Object.keys(CAT.algorithms), v => v === 'ridge' ? 'Ridge 회귀 (기준선)' : 'LightGBM')}
        <p class="muted">하이퍼파라미터 고정: ${esc(JSON.stringify(CAT.algorithms[s.algo]))} · seed 42 · 연 단위 Walk-forward, 최근 4년 학습, Label 종료일 기준 purge</p></div>
      <div class="card"><h3>3. Strategy & Portfolio</h3>
        <label class="f">종목 수 (Top-K)</label>${opt('k', G.k, v => '상위 ' + v + '종목')}
        <label class="f">교체 규칙</label>${opt('buf', G.buf, v => v > 1 ? '상위 3배수 안이면 계속 보유' : '매번 상위 K로 교체')}
        <label class="f">변동성 필터</label>${opt('vf', G.vf, v => v > 0 ? '60일 변동성 상위 30% 제외' : '없음')}
        <label class="f">시장 필터</label>${opt('mf', G.mf, v => String(v) === 'true' ? '시장이 60일 평균 아래면 신규 매수 중단' : '없음')}
        <label class="f">가상 투자금</label>${opt('cash', G.cash, v => man(+v))}
        <label class="f">목적함수 가중치</label>${opt('preset', Object.keys(CAT.objective_presets), v => ({ balanced: '균형', return: '수익 우선', low_risk: '낙폭 최소화', low_trading: '거래 부담 최소화' }[v]) + ' ' + JSON.stringify(Object.values(CAT.objective_presets[v])))}
        <p class="muted">J = a·(연환산 순수익률/20%) − b·(|MDD|/30%) − c·(연 거래 횟수/200) · 개발 검증 구간 기준, 정규화 기준 고정</p></div>
      <details class="card"><summary>ResearchSpec (JSON)</summary><pre class="json">${esc(JSON.stringify(toSpec(s, 'qs'), null, 1))}</pre></details>
      <button class="btn" data-act="run">실제 연구 실행</button>`;
  }

  function busyView() {
    return `<div class="card"><h3><span class="spinner"></span>${esc(S.busy)}</h3>
      <div class="log" id="log">${S.logs.map(esc).join('\n')}</div>
      <p class="muted">${LIVE ? '서버에서 지금 계산하고 있습니다.' : '같은 엔진이 미리 실행한 실제 학습 로그를 재생합니다.'}</p></div>`;
  }

  function benchRow(name, m) { return `<tr><td>${name}</td><td class="${cls(m.cagr)}">${pct(m.cagr)}</td><td>${pct(m.mdd)}</td><td>${m.sharpe_rf0 ?? '–'}</td><td>${m.trades_per_year != null && m.n_trades ? m.trades_per_year : '–'}</td></tr>`; }

  function validateView() {
    const r = S.cur; if (!r) return `<div class="card"><p>먼저 ${S.mode === 'qs' ? '연구를 실행' : '내 기준을 적용'}해 주세요.</p><button class="btn small" data-act="tab" data-v="create">이동</button></div>`;
    const d = r.metrics.development, f = r.metrics.locked_final, qs = S.mode === 'qs', s = r.series;
    const ver = S.versions.find(v => v.run.run_id === r.run_id);
    const chart = lineChart(s.dates, [
      { name: '내 AI 가상 운용', short: '내 AI', color: 'var(--s1)', values: s.strategy, main: true },
      { name: '코스피(지수 대용)', short: '코스피', color: 'var(--s2)', values: s.market },
      { name: '유니버스 동일가중', short: '300종목', color: 'var(--s3)', values: s.universe }],
      { fmt: v => Math.round(v / 1e4).toLocaleString() + '만', split: CAT.periods.locked_final[0], base: r.s.cash, log: true, label: '가상 평가금액 추이(로그 축)' });
    const roll = r.rolling_6m, imp = r.model.importance_last_fold.slice(0, qs ? 20 : 5), mx = imp[0].share;
    const sk = r.ledger_summary.skipped;
    return `<h2>${ver ? ver.name + ' · ' : ''}검증 결과</h2>
      <p class="sub">${describe(r.s).map(esc).join(' · ')}</p><p>${srcBadge(r)} <span class="badge">모델 ${r.model_id}</span> <span class="badge">정책 ${r.policy_id}</span></p>
      <div class="card"><p class="sub">${d.from.slice(0, 4)}~${d.to.slice(0, 4)}년 개발 검증 구간, ${man(d.start_value)}으로 시작했다면</p>
        <div class="hero ${cls(d.total_return)}">${won(d.end_value)} <small>${pct(d.total_return)} · 연 ${pct(d.cagr)}</small></div>
        ${chart}
        <div class="tiles">
          <div class="tile"><div class="k">가장 컸던 하락</div><div class="v down">${pct(d.mdd)}</div><div class="n">${d.mdd_peak} → ${d.mdd_trough}${d.mdd_recovered ? ' · 회복 ' + d.mdd_recovered : ' · 구간 내 미회복'}</div></div>
          <div class="tile"><div class="k">거래 횟수</div><div class="v">연 ${Math.round(d.trades_per_year)}회</div><div class="n">수수료·세금 ${won(d.explicit_cost_krw)}</div></div>
          <div class="tile"><div class="k">같은 기간 코스피</div><div class="v ${cls(r.benchmarks.market.dev.cagr)}">연 ${pct(r.benchmarks.market.dev.cagr)}</div><div class="n">비용·배당 미반영</div></div>
          <div class="tile"><div class="k">돈이 부족해 못 산 주문</div><div class="v">${sk.unaffordable}건</div><div class="n">거래정지·상한가 미체결 ${sk.untradable_buy}건</div></div>
        </div></div>
      <div class="card"><h3>잠금 평가 구간 (${f.from} ~ ${f.to})</h3>
        <p class="sub">후보를 고를 때 보지 않은 기간입니다.</p>
        <div class="kv"><span>내 AI</span><span class="${cls(f.total_return)}">${pct(f.total_return)} (낙폭 ${pct(f.mdd)})</span></div>
        <div class="kv"><span>코스피(지수 대용)</span><span class="${cls(r.benchmarks.market.final.total_return)}">${pct(r.benchmarks.market.final.total_return)} (낙폭 ${pct(r.benchmarks.market.final.mdd)})</span></div>
        <div class="kv"><span>유니버스 동일가중</span><span class="${cls(r.benchmarks.universe.final.total_return)}">${pct(r.benchmarks.universe.final.total_return)}</span></div></div>
      ${roll.n_windows ? `<div class="card"><h3>언제 시작했느냐에 따라 (6개월 보유)</h3>
        <div class="kv"><span>나빴던 경우(하위 10%)</span><span class="${cls(roll.p10)}">${pct(roll.p10)}</span></div>
        <div class="kv"><span>보통(중앙값)</span><span class="${cls(roll.median)}">${pct(roll.median)}</span></div>
        <div class="kv"><span>좋았던 경우(상위 10%)</span><span class="${cls(roll.p90)}">${pct(roll.p90)}</span></div>
        <div class="kv"><span>손실로 끝난 비율</span><span>${(roll.loss_share * 100).toFixed(0)}% (${roll.n_windows}개 구간)</span></div>
        <p class="muted">${esc(roll.note)}</p></div>` : ''}
      <div class="card"><h3>내 AI가 많이 본 정보</h3>
        ${imp.map(i => `<div style="margin:7px 0"><div class="kv" style="border:0;padding:0"><span>${esc(i.label)}</span><span>${(i.share * 100).toFixed(1)}%</span></div><div class="bar"><span style="width:${i.share / mx * 100}%"></span></div></div>`).join('')}
        <p class="muted">${esc(r.model.importance_kind)} · 마지막 학습 기준. 인과관계를 뜻하지 않습니다.</p></div>
      ${qs ? `<div class="card"><h3>상세 지표</h3><div class="scroll"><table><tr><th>개발 구간</th><th>CAGR</th><th>MDD</th><th>Sharpe</th><th>거래/년</th></tr>
          ${benchRow('전략(비용 반영)', d)}${benchRow('코스피 대용', r.benchmarks.market.dev)}${benchRow('유니버스 EW', r.benchmarks.universe.dev)}
          <tr><th>잠금 평가</th><th></th><th></th><th></th><th></th></tr>
          ${benchRow('전략(비용 반영)', f)}${benchRow('코스피 대용', r.benchmarks.market.final)}${benchRow('유니버스 EW', r.benchmarks.universe.final)}</table></div>
        <div class="kv"><span>Rank IC (개발 / 잠금)</span><span>${r.model.ic.dev.rank_ic_mean} / ${r.model.ic.final.rank_ic_mean}</span></div>
        <div class="kv"><span>IC 양수 비율 (개발)</span><span>${(r.model.ic.dev.rank_ic_positive_share * 100).toFixed(0)}% · ${r.model.ic.dev.n_dates}일</span></div>
        <div class="kv"><span>승률(청산 거래)</span><span>${r.ledger_summary.win_rate != null ? (r.ledger_summary.win_rate * 100).toFixed(1) + '%' : '–'}</span></div>
        <div class="kv"><span>비용+슬리피지 합계</span><span>${won(r.ledger_summary.cost_and_slippage_krw)}</span></div>
        <div class="kv"><span>목적함수 J (${S.spec.preset})</span><span>${J(r, S.spec.preset).toFixed(3)}</span></div>
        <div class="kv"><span>최근 1·3·6·12개월 (${r.trailing.as_of})</span><span>${['1m', '3m', '6m', '12m'].map(k => pct(r.trailing.strategy[k])).join(' · ')}</span></div>
        <p class="muted">Sharpe는 무위험수익률 0 가정, 일간 수익률 연율화. Rank IC가 양수여도 비용 차감 성과는 음수일 수 있습니다.</p></div>
      <details class="card"><summary>Walk-forward 학습 기록 (${r.model.folds.length}개 모델)</summary><div class="scroll"><table><tr><th>검증 연도</th><th>학습 구간</th><th>표본</th><th>purge</th><th>Label 종료 ≤</th></tr>
        ${r.model.folds.map(o => `<tr><td>${o.test_year}</td><td>${o.train_from.slice(2)}~${o.train_to.slice(2)}</td><td>${o.n_train.toLocaleString()}</td><td>${o.n_purged.toLocaleString()}</td><td>${o.label_end_max.slice(2)}</td></tr>`).join('')}</table></div>
        <p class="muted">${esc(r.model.target_note)}</p></details>` : ''}
      <details class="card"><summary>가상 거래원장 (최근 ${r.ledger_tail.length}건 / 전체 ${r.ledger_summary.n_ledger_rows.toLocaleString()}건)</summary><div class="scroll"><table><tr><th>일자</th><th>구분</th><th>종목</th><th>수량</th><th>단가</th><th>손익</th></tr>
        ${r.ledger_tail.map(l => `<tr><td>${l.date.slice(2)}</td><td>${l.side}</td><td>${esc(l.name)}</td><td>${l.shares || '–'}</td><td>${l.price.toLocaleString()}</td><td class="${cls(l.pnl || 0)}">${l.pnl != null ? l.pnl.toLocaleString() : (l.note ? esc(l.note) : '')}</td></tr>`).join('')}</table></div>
        <p class="muted">연구 기준일 ${CAT.data.end} 까지의 과거 가상 거래 기록입니다. 현재 시점의 추천이 아닙니다. ${esc(r.ledger_summary.cost_assumption)}</p></details>
      <details class="card"><summary>실행 로그 · 재현 정보</summary><div class="log">${[...(r.model.training_log || []), ...r.logs].map(esc).join('\n')}</div>
        <p class="muted">run ${r.run_id} · engine ${r.engine_version} · snapshot ${CAT.data.snapshot_id} · seed 42</p></details>
      <button class="btn" data-act="tab" data-v="optimize">${qs ? '후보 실험으로 개선하기' : '내 AI를 바꿔볼까요?'}</button>
      ${disclosures()}`;
  }

  function optimizeView() {
    if (!S.cur) return validateView();
    const qs = S.mode === 'qs', I = CAT.improvements, o = S.opt;
    const btns = (qs ? ['reduce_loss', 'less_trading', 'more_data', 'algorithm'] : ['reduce_loss', 'less_trading', 'more_data'])
      .map(k => `<button class="btn ghost small" data-act="opt" data-v="${k}">${I[k].label}</button>`).join('');
    let res = '';
    if (o) {
      const base = o.rows[0];
      res = `<div class="card"><h3>“${esc(o.label)}” 연구 계획</h3><div class="plan">${esc(o.plan)}</div>
        <p class="sub">같은 개발 검증 구간, 같은 투자금·비용 가정으로 비교했습니다.</p>
        <div class="scroll"><table><tr><th>버전</th><th>평가금액</th>${qs ? '<th>연 수익률</th>' : ''}<th>최대 낙폭</th><th>거래/년</th>${qs ? '<th>J</th><th>Rank IC</th>' : ''}</tr>
        ${o.rows.map(x => x.error ? `<tr><td><span class="vtag">${x.tag}</span> ${esc(x.change)}</td><td colspan="${qs ? 6 : 3}" style="text-align:left" class="muted">${esc(x.error)}</td></tr>` : (() => {
          const d = x.run.metrics.development;
          return `<tr class="${x.tag === o.best ? 'bestrow' : ''}"><td><span class="vtag">${x.tag}</span> ${x.kind === 'base' ? '기존' : `<span class="badge ${x.retrained ? 'm' : 'p'}">${x.retrained ? '모델 재학습' : '운용 방식 변경'}</span>`}</td>
            <td class="${cls(d.total_return)}">${man(d.end_value)}</td>${qs ? `<td class="${cls(d.cagr)}">${pct(d.cagr)}</td>` : ''}<td>${pct(d.mdd)}</td><td>${Math.round(d.trades_per_year)}</td>${qs ? `<td>${x.J.toFixed(3)}</td><td>${x.run.model.ic.dev.rank_ic_mean}</td>` : ''}</tr>`;
        })()).join('')}</table></div>
        ${o.rows.filter(x => !x.error && x.kind !== 'base').map(x => {
          const d = x.run.metrics.development, b = base.run.metrics.development;
          const say = [];
          say.push(d.mdd > b.mdd ? `큰 하락이 ${pct(b.mdd)} → ${pct(d.mdd)}로 줄었습니다` : d.mdd < b.mdd ? `큰 하락이 ${pct(b.mdd)} → ${pct(d.mdd)}로 오히려 커졌습니다` : '최대 하락폭은 같습니다');
          say.push(d.end_value > b.end_value ? `최종 평가금액은 ${man(d.end_value - b.end_value)} 늘었습니다` : `최종 평가금액은 ${man(b.end_value - d.end_value)} 줄었습니다`);
          say.push(`거래는 연 ${Math.round(b.trades_per_year)}회 → ${Math.round(d.trades_per_year)}회`);
          return `<div class="kv" style="display:block"><b>${x.tag}</b> ${esc(x.change)}<br><span class="sub">${say.join(', ')}. 잠금 평가 구간: ${pct(x.run.metrics.locked_final.total_return)} (기존 ${pct(base.run.metrics.locked_final.total_return)})</span>
            <button class="btn ghost small" data-act="adopt" data-v="${x.tag}">${x.tag}를 새 버전으로 저장</button></div>`;
        }).join('')}
        <div class="note">개발 구간 목적함수(${({ balanced: '균형', return: '수익 우선', low_risk: '낙폭 최소화', low_trading: '거래 부담 최소화' })[S.spec.preset]}) 기준 가장 높은 후보는 <b>${o.best}</b>입니다. 모든 지표가 함께 좋아지는 후보는 없을 수 있고, 나빠진 결과도 그대로 보여드립니다. 잠금 평가 수치는 선택에 쓰지 않았습니다.</div>
        <button class="btn ghost small" data-act="keep">기존 유지</button></div>
        <div class="card"><h3>버전별 가상 평가금액</h3>${compareChart(o.rows.filter(x => !x.error).map(x => ({ name: x.tag + ' ' + x.change, short: x.tag, run: x.run })))}</div>`;
    }
    const cd = S.cashDemo;
    return `<h2>${qs ? '후보 실험' : '내 AI를 바꿔볼까요?'}</h2>
      <p class="sub">방향만 고르면 금융 AI가 명세를 바꿔 실제로 다시 학습하거나 운용 방식을 다시 계산합니다.</p>
      <div class="card">${btns}</div>${res}
      <div class="card"><h3>내 투자금을 반영하면</h3><p class="sub">예측 모델은 그대로 두고 포트폴리오만 다시 계산합니다(재학습 없음).</p>
        <button class="btn ghost small" data-act="cash">${S.cur.s.cash === 1e6 ? '투자금 1,000만원으로 계산' : '투자금 100만원으로 계산'}</button>
        ${cd ? `<div class="kv"><span>모델</span><span>${cd.a.model_id} = ${cd.b.model_id} (동일)</span></div>
          <div class="kv"><span>연 수익률</span><span>${man(cd.a.s.cash)} ${pct(cd.a.metrics.development.cagr)} → ${man(cd.b.s.cash)} ${pct(cd.b.metrics.development.cagr)}</span></div>
          <div class="kv"><span>못 산 주문</span><span>${cd.a.ledger_summary.skipped.unaffordable}건 → ${cd.b.ledger_summary.skipped.unaffordable}건</span></div>
          <div class="kv"><span>거래 횟수/년</span><span>${Math.round(cd.a.metrics.development.trades_per_year)} → ${Math.round(cd.b.metrics.development.trades_per_year)}</span></div>
          <p class="muted">같은 예측값이라도 투자금에 따라 살 수 있는 종목과 성과가 달라집니다. 키움 계좌를 연결하면 실제 보유종목·현금으로 같은 계산을 합니다(본 시연에는 실계좌 연결 없음).</p>` : ''}</div>`;
  }

  function compareChart(items) {
    const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
    const it = items.slice(0, 4), dates = it[0].run.series.dates;
    return lineChart(dates, it.map((x, i) => ({ name: x.name, short: x.short, color: colors[i], main: i === 0,
      values: x.run.series.strategy.map(v => v / x.run.series.strategy[0] * 100) })),
      { fmt: v => v.toFixed(0), split: CAT.periods.locked_final[0], base: 100, label: '버전 비교(시작=100)' });
  }

  function versionsView() {
    if (!S.versions.length) return validateView();
    const url = shareUrl();
    return `<h2>나의 투자 AI 버전</h2>
      ${S.versions.map((v, i) => { const d = v.run.metrics.development; return `<div class="card tight ${v.run.run_id === S.cur.run_id ? 'sel' : ''}">
        <div class="kv" style="border:0"><b>${v.name}</b><span>${v.kind === 'base' ? '<span class="badge">최초 학습</span>' : `<span class="badge ${v.retrained ? 'm' : 'p'}">${v.retrained ? '모델 재학습' : '운용 방식 변경'}</span>`}</span></div>
        <p class="sub">${esc(v.why)}</p>
        <div class="kv"><span>개발 구간</span><span>연 ${pct(d.cagr)} · 낙폭 ${pct(d.mdd)} · 거래 ${Math.round(d.trades_per_year)}/년</span></div>
        <div class="kv"><span>잠금 평가</span><span>${pct(v.run.metrics.locked_final.total_return)}</span></div>
        <p class="muted">모델 ${v.run.model_id} · 정책 ${v.run.policy_id}</p>
        ${v.run.run_id !== S.cur.run_id ? `<button class="btn ghost small" data-act="use" data-v="${i}">이 버전 보기</button>` : ''}</div>`; }).join('')}
      ${S.versions.length > 1 ? `<div class="card"><h3>버전 비교</h3>${compareChart(S.versions.map(v => ({ name: v.name, short: v.name, run: v.run })))}</div>` : ''}
      <div class="card"><h3>연구 레시피 공유</h3><p class="sub">수익률·종목이 아닌 연구 설정만 담긴 링크입니다. 받은 사람은 계좌 없이 자신의 기준으로 바꿔 다시 학습할 수 있습니다.</p>
        <input type="text" readonly value="${esc(url)}" id="share"><button class="btn small" data-act="copy">링크 복사</button></div>
      <div class="card"><h3>계좌를 연결하면</h3><p class="sub">가상 투자금 대신 실제 보유종목·현금·체결 내역으로 같은 연구를 이어갑니다. 지금 만든 버전과 실험 기록은 그대로 유지됩니다.</p>
        <p class="muted">본 시연에는 실계좌 연결·실주문 기능이 없습니다.</p></div>`;
  }
  const shareUrl = () => location.origin + location.pathname + '#r=' + btoa(unescape(encodeURIComponent(JSON.stringify({ m: S.mode, s: S.cur ? S.cur.s : S.spec }))));

  function render() {
    chartSeq = 0;
    let body;
    if (!S.mode) body = landing();
    else if (S.busy) body = header() + busyView();
    else body = header() + ({ create: S.mode === 'qs' ? createQs : createMy, validate: validateView, optimize: optimizeView, versions: versionsView }[S.tab])();
    app.innerHTML = body + tabs();
    const lg = $('#log'); if (lg) lg.scrollTop = lg.scrollHeight;
  }

  /* ---------- 동작 ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function withBusy(title, fn) {
    S.busy = title; S.logs = []; render(); window.scrollTo(0, 0);
    try { return await fn(m => { S.logs.push(m); const lg = $('#log'); if (lg) { lg.textContent = S.logs.join('\n'); lg.scrollTop = lg.scrollHeight; } }); }
    catch (e) { toast(e.message); return null; }
    finally { S.busy = null; render(); }
  }
  const seenModels = new Set();
  async function replay(r, log) {
    const isNew = !seenModels.has(r.model_id) && r.source !== 'live_reused';
    seenModels.add(r.model_id);
    const head = isNew ? [`[신규 학습] 모델 ${r.model_id}${LIVE ? '' : ' (같은 엔진의 실제 학습 로그 재생)'}`, ...(r.model.training_log || []).filter(l => !l.startsWith('[신규'))]
      : [`[모델 재사용] ${r.model_id} · 재학습 없이 운용 정책만 다시 계산`];
    const lines = [...head, ...r.logs.filter(l => l.startsWith('[가상 체결]'))];
    for (const l of lines) { log(l); await sleep(LIVE ? 20 : 110); }
  }
  async function runCurrent() {
    const s = { ...S.spec, groups: [...S.spec.groups] };
    const r = await withBusy(S.mode === 'qs' ? '연구 실행 중' : '내 기준으로 학습 중', async log => {
      log(`[명세] ${describe(s).join(' · ')}`);
      const run = await getRun(s); await replay(run, log); return run;
    });
    if (!r) return;
    S.cur = r; S.opt = null; S.cashDemo = null;
    S.versions = [{ name: 'V1', kind: 'base', why: '최초 명세: ' + describe(s).slice(0, 3).join(' · '), run: r }];
    S.tab = 'validate'; render(); window.scrollTo(0, 0);
  }
  async function runOpt(req) {
    const imp = CAT.improvements[req], baseS = S.cur.s;
    const out = await withBusy(`“${imp.label}” 후보 실험 중`, async log => {
      log(`[연구 계획] ${imp.plan}`);
      const rows = [{ tag: 'V' + S.versions.length, kind: 'base', change: '기존', run: S.cur, retrained: false }];
      let n = S.versions.length;
      for (const c of imp.candidates) {
        const ns = applyPatch(baseS, c.patch), tag = 'V' + (++n);
        if (sameSpec(ns, baseS)) { rows.push({ tag, change: c.change, kind: c.kind, error: '이미 반영된 설정이라 새 후보가 아닙니다.' }); log(`[건너뜀] ${c.change}: 이미 반영됨`); continue; }
        try {
          log(`[후보 ${tag}] ${c.change} → ${c.kind === 'model' ? '명세 변경, 모델 학습' : '예측값 재사용, 가상 체결만 재계산'}`);
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
    if (/변동|위험|손실|안정|불안/.test(t)) { add('risk'); notes.push('하락 위험 정보를 학습 데이터에 추가'); }
    if (/피하|제외|빼/.test(t) && /변동|위험|급등/.test(t)) { s.vf = 0.3; notes.push('변동성 상위 30% 종목 제외'); }
    if (/거래량|거래대금/.test(t)) { add('volume'); notes.push('거래량 정보 추가'); }
    if (/규모|대형|시가총액|우량/.test(t)) { add('size'); notes.push('기업 규모 정보 추가'); }
    if (/며칠|단기|스윙|일주일/.test(t)) { s.h = 5; notes.push('5거래일 기준'); }
    if (/몇 ?주|한 ?달|장기|오래|길게|자주.*(어렵|않|못)|바빠|직장/.test(t)) { s.h = 20; notes.push('20거래일 기준'); }
    if (/자주.*(어렵|않|못)|거래.*(줄|적게)|수수료/.test(t)) { s.buf = 3; notes.push('상위권 유지 시 계속 보유(거래 감소)'); }
    if (/하락장|시장.*(나쁠|떨어)/.test(t)) { s.mf = true; notes.push('하락장 신규 매수 중단'); }
    const no = [];
    if (/실적|재무|PER|PBR|배당|수급|외국인|기관|뉴스/i.test(t)) no.push('실적·배당·수급·뉴스 데이터는 아직 지원하지 않습니다');
    if (/추천|뭐 ?사|사야|매수해|오를/.test(t)) no.push('현재 종목 추천이나 매수 권유는 제공하지 않습니다(과거 데이터 연구만 지원)');
    return (notes.length ? '<b>반영:</b> ' + notes.join(', ') + '.' : '반영할 수 있는 조건을 찾지 못했습니다.') + (no.length ? '<br><b>미지원:</b> ' + no.join(' / ') + '.' : '') + '<br><span class="muted">규칙 기반 해석</span>';
  }
  async function parseNl() {
    const t = ($('#nl') || {}).value || ''; if (!t.trim()) return toast('내용을 입력해 주세요');
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
    else if (a === 'mode') { S.mode = v; S.tab = S.cur ? 'validate' : 'create'; }
    else if (a === 'fork') { S.spec = { ...S.spec, ...S.forked.spec }; S.mode = S.forked.mode || 'my'; S.forked = null; S.tab = 'create'; toast('레시피를 내 작업 공간으로 복제했습니다'); }
    else if (a === 'tab') { S.tab = v; window.scrollTo(0, 0); }
    else if (a === 'grp') { if (b.dataset.lock) return toast('가격 흐름은 기본 정보입니다'); s.groups = s.groups.includes(v) ? s.groups.filter(g => g !== v) : [...s.groups, v]; }
    else if (a === 'set') { s[b.dataset.k] = +v; }
    else if (a === 'nl') return parseNl();
    else if (a === 'run') return runCurrent();
    else if (a === 'opt') return runOpt(v);
    else if (a === 'adopt') {
      const x = S.opt.rows.find(r => r.tag === v);
      S.versions.push({ name: 'V' + (S.versions.length + 1), kind: x.kind, retrained: x.retrained, why: `“${S.opt.label}” 요청 → ${x.change}`, run: x.run });
      S.cur = x.run; S.spec = { ...S.spec, ...x.run.s, preset: S.spec.preset }; S.opt = null; S.cashDemo = null; S.tab = 'versions'; toast('새 버전으로 저장했습니다. 기존 버전도 남아 있습니다');
    }
    else if (a === 'keep') { S.opt = null; toast('기존 버전을 유지합니다'); }
    else if (a === 'use') { S.cur = S.versions[+v].run; S.spec = { ...S.spec, ...S.cur.s, preset: S.spec.preset }; S.opt = null; S.cashDemo = null; S.tab = 'validate'; }
    else if (a === 'cash') {
      const ns = { ...S.cur.s, cash: S.cur.s.cash === 1e6 ? 1e7 : 1e6 };
      const r = await withBusy('투자금만 바꿔 다시 계산 중', async log => { log('[정책 변경] 모델 재학습 없이 포트폴리오만 재계산'); const run = await getRun(ns); await replay(run, log); return run; });
      if (r) S.cashDemo = { a: S.cur, b: r };
    }
    else if (a === 'copy') { const i = $('#share'); i.select(); try { await navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand('copy'); } return toast('링크를 복사했습니다'); }
    render();
  });
  app.addEventListener('change', ev => {
    const el = ev.target.closest('[data-act="sel"]'); if (!el) return;
    const k = el.dataset.k, v = el.value;
    S.spec[k] = k === 'algo' || k === 'preset' ? v : k === 'mf' ? v === 'true' : +v; render();
  });
  ['pointermove', 'pointerdown'].forEach(e => app.addEventListener(e, ev => { const el = ev.target.closest('.chart'); if (el) chartMove(el, ev); }));
  app.addEventListener('pointerleave', ev => { const el = ev.target.closest && ev.target.closest('.chart'); if (el) chartLeave(el); }, true);

  (async function init() {
    try {
      CAT = await fetch('data/catalog.json').then(r => r.json());
      try { const h = await fetch('api/health').then(r => r.ok ? r.json() : null); if (h && h.mode === 'live') { LIVE = true; AGENT = !!h.agent; } } catch (e) { /* 정적 모드 */ }
      const m = location.hash.match(/#r=(.+)/);
      if (m) { try { const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (o.s && Array.isArray(o.s.groups)) S.forked = { mode: o.m, spec: o.s }; } catch (e) { /* 잘못된 링크 무시 */ } }
      render();
    } catch (e) { app.innerHTML = '<div class="card">데이터를 불러오지 못했습니다. scripts/precompute.py 실행 여부를 확인하세요.</div>'; }
  })();
})();

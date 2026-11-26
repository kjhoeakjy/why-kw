const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/63122878-a884-444f-aae4-af6d8490fa3c_b3988ff4-46c4-43e3-804b-a29f0de7ded6/pptx/scripts/apply_theme.js');
const OUT = process.argv[2];
const THEME = { name: 'Mono', headFontFace: 'Malgun Gothic', bodyFontFace: 'Malgun Gothic',
  colors: { dk1: '0A0A0A', lt1: 'FFFFFF', dk2: '6B6B6B', lt2: 'F2F2F2', accent1: '0A1E5A', accent2: 'E9067F', accent3: 'A6A6A6', accent4: 'D0D0D0', accent5: 'F2F2F2', accent6: '3A3A3A', hlink: '0A0A0A', folHlink: '6B6B6B' } };
(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = 'Why Kiwoom? 나만의 AI를 키움'; pres.author = '김연주';
  const C = pres.SchemeColor, W = 13.333, M = 0.9;
  pres.defineSlideMaster({ title: 'Dark', background: { color: '0A1E5A' }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 3.0, w: W - 2 * M, h: 0.8, fontSize: 32, bold: true, color: C.background1, align: 'left', valign: 'top', margin: 0 }, text: '' } } ] });
  pres.defineSlideMaster({ title: 'Light', background: { color: 'FFFFFF' }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.8, w: W - 2 * M, h: 0.6, fontSize: 22, bold: true, color: C.text1, align: 'left', valign: 'top', margin: 0 }, text: '' } },
    { line: { x: M, y: 1.5, w: W - 2 * M, h: 0, line: { color: '0A1E5A', width: 1.5 } } },
    { image: { path: 'kiwoom-logo.png', x: W - M - 1.35, y: 0.82, w: 1.35, h: 1.35 * 133 / 409 } },
    { text: { text: '나만의 AI를 키움', options: { x: M, y: 6.85, w: 4, h: 0.3, fontSize: 9, color: C.text2, margin: 0 } } } ],
    slideNumber: { x: W - M - 0.6, y: 6.85, w: 0.6, h: 0.3, fontSize: 9, color: C.text2, align: 'right' } });
  const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: 'top', color: C.text1, ...o });
  const rule = (s, x, y, w, name, col) => s.addShape(pres.ShapeType.line, { x, y, w, h: 0, line: { color: col || 'D0D0D0', width: 0.75 }, objectName: name });
  const phone = (s, path, x, y, h, name) => { const w = h * 390 / 780;
    s.addShape(pres.ShapeType.rect, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: C.background1 }, line: { color: C.accent3, width: 0.75 }, objectName: name + ' 테두리' });
    s.addImage({ path, x, y, w, h, altText: name, objectName: name }); return w; };
  const SM = 11, BD = 14;

  const box = (s, x, y, w, h, name, dark) => s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: dark ? C.accent1 : C.background1 }, line: { color: dark ? C.accent1 : C.text1, width: 1 }, objectName: name });
  const pic = (s, path, x, y, w, ratio, name) => { const h = w * ratio;
    s.addShape(pres.ShapeType.rect, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: C.background1 }, line: { color: C.accent3, width: 0.75 }, objectName: name + ' 테두리' });
    s.addImage({ path, x, y, w, h, altText: name, objectName: name }); return h; };

  // 1 표지
  pres.addSection({ title: '제안' });
  let s = pres.addSlide({ masterName: 'Dark', sectionTitle: '제안' });
  T(s, '2026 신입사원 Challenge Mission  |  Why Kiwoom?', { x: M, y: 0.9, w: 9, h: 0.3, fontSize: SM, color: C.accent4 });
  s.addShape(pres.ShapeType.rect, { x: M, y: 2.62, w: 0.55, h: 0.07, fill: { color: C.accent2 }, line: { color: C.accent2, width: 0 }, objectName: '강조 막대' });
  s.addShape(pres.ShapeType.rect, { x: W - M - 2.1, y: 0.7, w: 2.1, h: 0.85, fill: { color: 'FFFFFF' }, line: { color: 'FFFFFF', width: 0 }, objectName: '로고 바탕' });
  s.addImage({ path: 'kiwoom-logo-white.png', x: W - M - 1.9, y: 0.83, w: 1.7, h: 1.7 * 133 / 409, altText: '키움증권 로고', objectName: '키움증권 로고' });
  s.addText('나만의 AI를 키움', { placeholder: 'title' });
  T(s, '개인이 직접 학습시키는 맞춤형 투자 전략 AI 제안', { x: M, y: 3.8, w: 9, h: 0.4, fontSize: BD, color: C.accent4 });
  T(s, '키움증권 신입사원 22기 김연주', { x: M, y: 6.3, w: 6, h: 0.3, fontSize: SM, color: C.accent4 });
  s.addNotes('개인이 본인의 투자 성향, 투자 상품 유형, 자산 현황, 판단을 반영하여 맞춤형 전략을 제시하는 AI를 직접 학습시키는 서비스 제안입니다.');

  // 배경
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('제안 배경', { placeholder: 'title' });
  const gw = (W - 2 * M - 0.6) / 3;
  [['경험', '개인 투자 AI 직접 학습', '자동 매수 · 매도 운용'], ['전망', '개인 전용 투자 AI 수요 증가', 'AI 발전에 따른 확대 예상'], ['제안', '누구나 본인의 투자 AI 학습', '나만의 AI를 키움']].forEach(([k, t, d], i) => {
    const x = M + i * (gw + 0.3), dark = i === 2;
    box(s, x, 2.0, gw, 1.9, `배경 ${i + 1}`, dark);
    T(s, k, { x: x + 0.3, y: 2.25, w: gw - 0.6, h: 0.26, fontSize: SM, bold: true, color: dark ? C.accent4 : C.accent2 });
    T(s, t, { x: x + 0.3, y: 2.7, w: gw - 0.6, h: 0.36, fontSize: 16, bold: true, color: dark ? C.background1 : C.text1 });
    T(s, d, { x: x + 0.3, y: 3.2, w: gw - 0.6, h: 0.28, fontSize: 12, color: dark ? C.accent4 : C.text2 });
  });
  T(s, '개인이 직접 구축할 때 필요한 작업', { x: M, y: 4.45, w: 6, h: 0.26, fontSize: SM, color: C.text2 });
  const jw = (W - 2 * M - 0.9) / 4;
  [['데이터 수집 · 정제', '항목 선택'], ['모델 학습', '자동 학습'], ['검증 환경 구축', '자동 검증'], ['주문 연동 개발', '계좌 연계']].forEach(([a, b2], i) => {
    const x = M + i * (jw + 0.3);
    rule(s, x, 4.85, jw, `작업 구분선 ${i + 1}`, '0A0A0A');
    T(s, a, { x, y: 5.0, w: jw, h: 0.3, fontSize: 14, bold: true });
    T(s, '서비스 제공: ' + b2, { x, y: 5.4, w: jw, h: 0.26, fontSize: SM, color: C.accent1 });
  });
  s.addNotes('본 제안은 개인 경험에서 출발하였습니다. 발표자는 직접 학습시킨 투자 AI로 자동 매수·매도를 운용한 경험이 있습니다. AI가 발전할수록 개인 전용 투자 AI에 대한 수요가 증가할 것으로 예상하였으며 해당 전망은 발표자의 판단입니다. 개인이 직접 구축하려면 데이터 수집, 모델 학습, 검증 환경, 주문 연동 개발이 필요합니다. 본 제안은 해당 작업을 서비스가 대신 수행하여 누구나 본인의 투자 AI를 학습시킬 수 있도록 하는 것입니다.');

  // 2 서비스 설명
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('타 증권사 고객이 키움을 선택할 새로운 이유', { placeholder: 'title' });
  T(s, '개인이 직접 학습시키는 맞춤형 투자 전략 AI', { x: M, y: 1.72, w: 6, h: 0.32, fontSize: 15, bold: true });
  const iw = (W - 2 * M - 0.45) / 4;
  [['투자 성향', '우선 목표 · 손실 감내 수준'], ['투자 상품 유형', '주식 · ETF · 채권 · 선물 · 옵션'], ['자산 현황', '보유 종목 · 현금 · 투자금'], ['본인 판단', '중시 정보 · 직접 입력 규칙']].forEach(([k, v], i) => {
    const x = M + i * (iw + 0.15);
    box(s, x, 2.14, iw, 0.62, `입력 ${i + 1}`);
    T(s, k, { x: x + 0.15, y: 2.2, w: iw - 0.3, h: 0.24, fontSize: 12, bold: true });
    T(s, v, { x: x + 0.15, y: 2.46, w: iw - 0.3, h: 0.22, fontSize: 9, color: C.text2 });
  });
  const cw = (W - 2 * M) / 4, fph = 3.0, fpw = fph / 2;
  [['01', '나의 기준 입력', '성향 · 상품 · 자산 · 판단', 'f1-set.png'], ['02', '개인 AI 학습 · 전략 제시', '실제 데이터 검증 · 적합 판정', 'f2-home.png'], ['03', '요청 기반 개선', '후보 비교 · 채택 판정', 'f3-opt.png'], ['04', '키움증권 계좌 연계', '자동 주문 · 운용 보고서(설계안)', 'f4-link.png']].forEach(([n, t, d, img], i) => {
    const x = M + i * cw;
    T(s, n, { x, y: 2.99, w: 0.4, h: 0.26, fontSize: SM, color: C.accent2, bold: true });
    T(s, t, { x: x + 0.4, y: 2.95, w: cw - 0.5, h: 0.3, fontSize: 13, bold: true });
    T(s, d, { x: x + 0.4, y: 3.24, w: cw - 0.5, h: 0.24, fontSize: 10, color: C.text2 });
    phone(s, img, x + 0.4, 3.58, fph, t + ' 화면');
  });
  s.addNotes('본 제안의 핵심은 개인이 맞춤형 전략을 제시하는 AI를 직접 학습시킨다는 점입니다. 입력은 투자 성향, 투자 상품 유형, 자산 현황, 본인 판단의 네 가지입니다. 상품 유형은 주식, 상장지수펀드, 채권, 선물·옵션 등 파생상품을 포함하며 PoC는 국내주식을 실제 시세로 계산하며 현금성 자산, 지수 선물 헤지, 옵션, 레버리지·인버스 상품은 코스피 대용 지수와 이론가 기준 가정으로 계산합니다. 해외주식, 상장지수펀드, 채권은 자료 미확보로 설계안입니다. 파생상품은 투자자 적합성 확인과 사전 교육 이수 고객을 대상으로 하며 시연 화면은 투자 경험 1년 미만 선택 시 파생상품 선택을 제한합니다. 대상 고객은 타사 앱 이용자 중 본인의 투자 방식을 자동화하려 하나 코딩 경험이 없는 투자자이며 가설입니다. 학습된 AI가 제시한 전략은 실제 과거 데이터로 검증하며 지수 미달 또는 손실 설정은 부적합으로 판정합니다. 고객은 중시하는 정보와 보유 기간을 선택하며 고급 설정에서는 운용 방식, 회피 조건, 우선 목표를 추가로 지정합니다. 서비스는 해당 기준으로 예측 모델을 학습하고 실제 과거 시세에 거래 비용을 반영하여 검증합니다. 고객이 손실 축소 등 개선 방향을 요청하면 후보를 비교하고 채택 여부를 판정합니다. 키움증권 계좌 개설 고객에게는 자동 주문과 운용 보고서를 제공하며 해당 기능은 준법 검토가 필요한 설계안입니다. 대상 고객은 가설이며 인터뷰 결과가 아닙니다.');

  // 3 Why Kiwoom
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('키움증권 기존 자산 기반 구성과 위험 통제', { placeholder: 'title' });
  const dw = 7.2, bw = (dw - 0.4) / 3, dy = 2.1;
  T(s, '키움증권 기존 자산', { x: M, y: dy - 0.3, w: 4, h: 0.25, fontSize: SM, color: C.text2 });
  [['조건검색', '투자 기준 설정'], ['성과검증', '과거 전략 검증'], ['Open API+ · REST API', '투자 시스템 구현']].forEach(([k, v], i) => {
    const x = M + i * (bw + 0.2);
    box(s, x, dy, bw, 1.0, `기존 자산 ${i + 1}`);
    T(s, k, { x, y: dy + 0.22, w: bw, h: 0.3, fontSize: 13, bold: true, align: 'center' });
    T(s, v, { x, y: dy + 0.57, w: bw, h: 0.25, fontSize: SM, color: C.text2, align: 'center' });
    s.addShape(pres.ShapeType.line, { x: x + bw / 2, y: dy + 1.0, w: 0, h: 0.35, line: { color: C.text1, width: 1 }, objectName: `연결선 ${i + 1}` });
  });
  box(s, M, dy + 1.35, dw, 1.15, '제안 서비스', true);
  T(s, '나만의 AI를 키움', { x: M, y: dy + 1.6, w: dw, h: 0.35, fontSize: 18, bold: true, color: C.background1, align: 'center' });
  T(s, '개인 맞춤형 전략 AI 학습 · 검증 · 개선', { x: M, y: dy + 2.02, w: dw, h: 0.25, fontSize: SM, color: C.accent4, align: 'center' });
  s.addShape(pres.ShapeType.line, { x: M + dw / 2, y: dy + 2.5, w: 0, h: 0.35, line: { color: C.text1, width: 1 }, objectName: '하위 연결선' });
  box(s, M, dy + 2.85, dw, 0.9, '이용 대상');
  T(s, '자동매매 관심 직장인 투자자', { x: M, y: dy + 3.03, w: dw, h: 0.3, fontSize: 13, bold: true, align: 'center' });
  T(s, '코딩 · API 없이 항목 선택으로 이용, 일반 · 고급 설정 제공', { x: M, y: dy + 3.35, w: dw, h: 0.25, fontSize: SM, color: C.text2, align: 'center' });
  const cx2 = 9.0, cw2 = W - M - cx2;
  const ey = dy;
  T(s, '도입 효과', { x: cx2, y: ey - 0.3, w: cw2, h: 0.25, fontSize: SM, color: C.accent2, bold: true });
  [['유입', '계좌 개설 전 체험 경로'], ['전환', '계좌 연계 기능 한정 제공'], ['잔류', '학습 모델 · 실험 기록 축적']].forEach(([k, v], i) => {
    const y = ey + 0.1 + i * 0.5;
    rule(s, cx2, y - 0.1, cw2, `효과 구분선 ${i + 1}`, i ? 'D0D0D0' : 'E9067F');
    T(s, k, { x: cx2, y: y + 0.04, w: 1.0, h: 0.26, fontSize: 12, bold: true });
    T(s, v, { x: cx2 + 1.0, y: y + 0.04, w: cw2 - 1.0, h: 0.26, fontSize: SM, color: C.text2, align: 'right' });
  });
  const ry = ey + 1.95;
  T(s, '위험 통제(설계안)', { x: cx2, y: ry - 0.3, w: cw2, h: 0.25, fontSize: SM, color: C.accent2, bold: true });
  [['과신', '지수 대비 성과 상시 표시'], ['쏠림', '종목별 주문 쏠림 한도'], ['복제', '공유 설정 본인 조건 재학습'], ['부적합', '지수 미달 · 손실 설정 주문 제외'], ['제도', '고객 작성 조건 주문 · 사전 승인']].forEach(([k, v], i) => {
    const y = ry + 0.1 + i * 0.5;
    rule(s, cx2, y - 0.1, cw2, `통제 구분선 ${i + 1}`, i ? 'D0D0D0' : '0A0A0A');
    T(s, k, { x: cx2, y: y + 0.04, w: 1.0, h: 0.26, fontSize: 12, bold: true });
    T(s, v, { x: cx2 + 1.0, y: y + 0.04, w: cw2 - 1.0, h: 0.26, fontSize: SM, color: C.text2, align: 'right' });
  });
  rule(s, cx2, ry + 5 * 0.5, cw2, '통제 하단선');
  s.addNotes('키움증권은 조건검색, 성과검증, API로 개인 투자자의 전략 개발 환경을 제공해 왔습니다. 본 제안은 해당 기반에 개인 모델 학습·검증·개선 기능을 결합한 것이며 코딩 경험이 없는 고객도 대상에 포함합니다. 도입 효과는 다음과 같습니다. 계좌 개설 전 체험이 타사 고객의 유입 경로가 됩니다. 자동 주문과 운용 보고서를 계좌 보유 고객에 한정하여 계좌 개설과 거래로 전환합니다. 학습 모델과 실험 기록이 키움에 축적되어 이탈 유인이 감소합니다. 기존 기능의 재구성이므로 신규 개발 범위가 제한적입니다. 키우Me, 조건검색, API 등 기존 서비스와 연계가 가능합니다. NH투자증권 젠포트 DIY 등 규칙 조합형 전략 제작 서비스는 기존에 존재하며 본 제안의 차이는 개인별 예측 모델 학습, 계좌 개설 전 체험, 요청 기반 개선 판정입니다. 효과의 크기는 측정 전이며 수치는 제시하지 않습니다. 위험 통제는 PoC 실측에 근거한 설계안입니다. 과거 성과가 좋은 설정으로 이용자가 집중되는 것을 주요 위험으로 판단하였습니다. 이에 지수 대비 성과를 상시 표시하고 종목별 주문 쏠림 한도를 두며 공유받은 설정은 본인 조건으로 재학습하도록 합니다. 실주문은 모의 운용 기간 경과 후 허용합니다. 주문 방식은 기존 조건검색 자동매매와 동일하게 고객이 작성한 조건에 따른 주문으로 설계하며 투자일임 해당 여부는 준법 검토가 필요합니다.');

  // 상용화 위험 실험
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('주문 쏠림 실험과 단계별 제공', { placeholder: 'title' });
  T(s, '고객 분포 가정별 단일 종목 주문 집중도(일별 최대치의 중앙값, 20일 평균 거래대금 대비 %)', { x: M, y: 1.9, w: 6.6, h: 0.25, fontSize: SM, color: C.text2 });
  s.addChart(pres.charts.BAR, [{ name: '거래대금 대비 순주문', labels: ['설정 균등 분포', '기본 설정 80% 집중', '성과 상위 10건 80% 집중'], values: [20, 88, 99] }],
    { x: M - 0.1, y: 2.2, w: 6.6, h: 3.1, barDir: 'col', chartColors: ['0A1E5A'], showLegend: false, showValue: true, dataLabelFormatCode: '0"%"', dataLabelPosition: 'outEnd', dataLabelFontSize: 11, dataLabelFontFace: '+mn-lt', dataLabelColor: '0A0A0A',
      catAxisLabelFontSize: 10, catAxisLabelFontFace: '+mn-lt', catAxisLabelColor: '0A0A0A', valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, barGapWidthPct: 90, altText: '고객 분포 가정별 주문 집중도 막대 차트', objectName: '주문 집중도 차트' });
  T(s, '가정: 고객 1만 명, 1인당 1,000만 원, 설정 512건, 2019~2024년 가상 주문 합산', { x: M, y: 5.4, w: 6.6, h: 0.24, fontSize: 10, color: C.text2 });
  T(s, '균등 분포에서도 주문일의 88%에서 거래대금 대비 10% 초과  |  기본 설정 집중 시 최대 21.6배', { x: M, y: 5.68, w: 6.6, h: 0.24, fontSize: 10, color: C.accent2 });
  const px = 8.2, pw = W - M - px;
  T(s, '단계별 제공', { x: px, y: 1.9, w: pw, h: 0.25, fontSize: SM, color: C.text2 });
  [['1단계', '투자 기준 학습 · 과거 검증', '비회원 체험, 주문 미연결'], ['2단계', '계좌 기반 분석 · 모의 운용', '보유 자산 중복 · 거래 비용 분석'], ['3단계', '고객 승인 기반 주문', '적합 판정 설정, 주문 한도, 쏠림 한도'], ['4단계', '자동 운용', '제도 요건 충족 범위 내 확대']].forEach(([k, v, d2], i) => {
    const y = 2.3 + i * 0.86;
    rule(s, px, y - 0.1, pw, `단계 구분선 ${i + 1}`, i ? 'D0D0D0' : '0A0A0A');
    T(s, k, { x: px, y: y + 0.04, w: 0.9, h: 0.26, fontSize: 12, bold: true, color: i === 0 ? C.accent2 : C.text1 });
    T(s, v, { x: px + 0.9, y: y + 0.02, w: pw - 0.9, h: 0.28, fontSize: 13, bold: true });
    T(s, d2, { x: px + 0.9, y: y + 0.36, w: pw - 0.9, h: 0.24, fontSize: 10, color: C.text2 });
  });
  rule(s, px, 2.3 + 4 * 0.86 - 0.1, pw, '단계 하단선');
  T(s, '주문 집중도는 호가 · 상대 주문 미반영 추정치  |  PoC 범위는 1단계', { x: M, y: 6.4, w: W - 2 * M, h: 0.3, fontSize: 9, color: C.text2 });
  s.addNotes('상용화 시 주문 쏠림을 실제 가상 주문으로 추정하였습니다. 고객 1만 명이 1인당 1,000만 원을 운용한다고 가정하고 설정 512건의 2019~2024년 가상 주문을 고객 분포별로 합산하였습니다. 지표는 동일 종목·동일 일자 순주문 금액을 해당 종목의 20일 평균 거래대금으로 나눈 값입니다. 고객이 512건에 균등하게 분포하는 경우에도 일별 최대치의 중앙값은 20%이며 주문일의 88%에서 10%를 초과하였습니다. 고객의 80%가 기본 설정을 사용하는 경우 88%, 성과 상위 10건에 80%가 집중되는 경우 99%입니다. 최대치는 기본 설정 집중 시 거래대금의 21.6배입니다. 고객 수와 운용 금액은 가정이며 호가와 상대 주문을 반영하지 않은 추정치입니다. 해당 결과는 설정의 다양성으로는 쏠림이 해소되지 않으며 증권사 차원의 종목별 주문 한도와 유동성 기준이 필요함을 의미합니다. 전체 고객 주문을 합산하여 통제하는 것은 개인 개발자가 수행할 수 없고 증권사가 수행할 수 있는 영역입니다. 이에 서비스를 단계별로 제공하는 것으로 설계하였습니다. PoC는 1단계에 해당하며 주문 연계는 준법 검토와 통제 장치 구축 이후 단계입니다.');

  // 5 Mission 2 + QR
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('How to Spread. 계좌 개설 전 비회원 체험', { placeholder: 'title' });
  const js = ['링크 접속', '비회원 체험', '앱 설치', '회원가입', '계좌 개설', '자동 주문 · 보고서'];
  const jx0 = M + 0.35, jx1 = W - M - 0.35, jy = 2.35, r = 0.22;
  s.addShape(pres.ShapeType.line, { x: jx0, y: jy, w: jx1 - jx0, h: 0, line: { color: C.text1, width: 1 }, objectName: '이용 단계 연결선' });
  js.forEach((t, i) => {
    const cx = jx0 + i * (jx1 - jx0) / 5, dark = i === 1;
    s.addShape(pres.ShapeType.ellipse, { x: cx - r, y: jy - r, w: 2 * r, h: 2 * r, fill: { color: dark ? C.accent2 : C.background1 }, line: { color: dark ? C.accent2 : C.text1, width: 1 }, objectName: `이용 단계 ${i + 1}` });
    T(s, String(i + 1), { x: cx - r, y: jy - 0.11, w: 2 * r, h: 0.22, fontSize: 10, align: 'center', color: dark ? C.background1 : C.text1 });
    T(s, t, { x: cx - 1, y: jy + 0.38, w: 2, h: 0.28, fontSize: 13, bold: true, align: 'center' });
  });
  const by = 3.75;
  T(s, '유입 채널', { x: M, y: by, w: 3, h: 0.25, fontSize: SM, color: C.text2 });
  ['투자 유튜브', '직장인 커뮤니티', '퀀트 · API 커뮤니티', '기존 고객 공유'].forEach((t, i) => {
    const y = by + 0.4 + i * 0.52;
    rule(s, M, y - 0.1, 3.3, `채널 구분선 ${i + 1}`, i ? 'D0D0D0' : '0A0A0A');
    T(s, t, { x: M, y, w: 3.3, h: 0.28, fontSize: 13, bold: true });
  });
  T(s, '공유 단위', { x: 5.1, y: by, w: 3, h: 0.25, fontSize: SM, color: C.text2 });
  const kw = 2.6; pic(s, 'e-card.png', 5.1, by + 0.35, kw, 720 / 716, '연구 설정 공유 카드');
  const tx = 8.6, tw = W - M - tx;
  T(s, '제공 범위', { x: tx, y: by, w: tw, h: 0.25, fontSize: SM, color: C.text2 });
  [['비회원', 'AI 학습 · 과거 검증 · 설정 공유'], ['회원', '기록 저장 · 복수 기기 조회'], ['계좌 개설 고객', '보유 자산 반영 · 자동 주문 · 운용 보고서']].forEach(([k, v], i) => {
    const y = by + 0.4 + i * 0.78;
    rule(s, tx, y - 0.1, tw, `범위 구분선 ${i + 1}`, i ? 'D0D0D0' : '0A0A0A');
    T(s, k, { x: tx, y, w: tw, h: 0.28, fontSize: 13, bold: true, color: i === 2 ? C.accent2 : C.text1 });
    T(s, v, { x: tx, y: y + 0.3, w: tw, h: 0.26, fontSize: SM, color: C.text2 });
  });
  s.addNotes('투자 콘텐츠 제작자와 기존 고객이 연구 설정을 공유하면 수신자는 계좌 개설 전 본인 조건으로 재학습합니다. 수익률, 종목, 개인 자산 정보는 공유 대상에서 제외합니다. 인증과 계좌 개설 절차는 체험 이후 단계에 배치합니다. 체험 범위는 과거 데이터 검증으로 한정하며 자동 주문과 운용 보고서는 키움증권 계좌 개설 고객에 한정하여 제공합니다. 자동 주문은 채택 가능 판정 모델, 주문 한도, 주문 전 고객 승인을 조건으로 하며 투자일임 해당 여부에 대한 준법 검토가 필요합니다. 측정 지표는 링크 접속률, 첫 학습 완료율, 앱 설치율, 계좌 개설 완료율, 30일 재방문율입니다.');

  // 4 PoC
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('시연과 검증 결과', { placeholder: 'title' });
  const q = 2.2, qy = 2.25;
  T(s, '시연 페이지', { x: M, y: 1.9, w: q, h: 0.25, fontSize: SM, color: C.text2 });
  s.addImage({ path: 'qr.png', x: M, y: qy, w: q, h: q, altText: '시연 페이지 QR 코드', objectName: 'QR', hyperlink: { url: 'https://kjhoeakjy.github.io/why-kw/' } });
  T(s, 'kjhoeakjy.github.io/why-kw', { x: M, y: qy + q + 0.08, w: q, h: 0.25, fontSize: 9, color: C.text2, align: 'center' });
  const sx = 3.75, sw = 5.0;
  T(s, '성향이 상이한 설정 3건의 검증 결과', { x: sx, y: 1.9, w: sw, h: 0.25, fontSize: SM, color: C.text2 });
  const col = [0, 2.3, 3.2, 4.1], hd = ['설정', '연 거래', '최대 낙폭', '연 수익률'];
  hd.forEach((h, j) => T(s, h, { x: sx + col[j], y: 2.3, w: j ? 0.9 : 2.2, h: 0.22, fontSize: 10, color: C.text2, align: j ? 'right' : 'left' }));
  [['단기 · 거래량 중시 · 5종목', '가격 · 거래량, 약 1주', '338회', '-53.9%', '-10.6%'], ['중기 · 위험 회피 · 10종목', '가격 · 위험 · 규모, 회피 조건 2종', '66회', '-38.8%', '-7.0%'], ['중기 · 보유 유지 · 5종목', '가격, 약 1개월', '65회', '-49.1%', '-7.6%']].forEach(([n, d, a1, a2, a3], i) => {
    const y = 2.72 + i * 0.82;
    rule(s, sx, y - 0.12, sw, `사례 구분선 ${i + 1}`, i ? 'D0D0D0' : '0A0A0A');
    T(s, n, { x: sx, y, w: 2.3, h: 0.26, fontSize: 12, bold: true });
    T(s, d, { x: sx, y: y + 0.3, w: 2.6, h: 0.22, fontSize: 9, color: C.text2 });
    [a1, a2, a3].forEach((v, j) => T(s, v, { x: sx + col[j + 1], y: y + 0.08, w: 0.9, h: 0.28, fontSize: 13, bold: j === 2, align: 'right' }));
  });
  rule(s, sx, 2.72 + 3 * 0.82 - 0.12, sw, '사례 하단선');
  T(s, '3건 간 주간 수익률 상관 0.30~0.54  |  코스피 대용 지수 연 +2.9%', { x: sx, y: 5.2, w: sw, h: 0.24, fontSize: 10, color: C.accent1 });
  T(s, '단순 전략 연 수익률: 모멘텀 -33.5%, 저변동성 +0.2%, 설정 중앙값 -2.8%', { x: sx, y: 5.5, w: sw + 0.3, h: 0.24, fontSize: 10, color: C.text2 });
  const cx = 9.35, cw4 = W - M - cx;
  T(s, '설정 512건 실측(100만 원 기준)', { x: cx, y: 1.9, w: cw4, h: 0.25, fontSize: SM, color: C.text2 });
  [['79%', '보유 종목 무중복 설정 쌍 비율'], ['0.38', '주간 수익률 상관계수 평균'], ['26%', '최다 중복 종목 보유 비율'], ['14%', '지수 상회 설정 비율'], ['0.15', '검증 · 이후 구간 순위 상관']].forEach(([n, l], i) => {
    const y = 2.3 + i * 0.66;
    rule(s, cx, y - 0.08, cw4, `실측 구분선 ${i + 1}`, i === 3 ? 'E9067F' : i ? 'D0D0D0' : '0A0A0A');
    T(s, n, { x: cx, y: y + 0.06, w: 0.9, h: 0.34, fontSize: 16, bold: true, color: i > 2 ? C.accent2 : C.accent1 });
    T(s, l, { x: cx + 0.9, y: y + 0.12, w: cw4 - 0.9, h: 0.26, fontSize: 10, color: C.text2, align: 'right' });
  });
  T(s, '검증 구간 2019~2024, 거래 비용 반영 실측  |  QR 시연은 화면 내 직접 학습·가상 운용 방식  |  출처: KRX 일별 시세(FinanceData/marcap)', { x: M, y: 6.4, w: W - 2 * M, h: 0.3, fontSize: 9, color: C.text2 });
  s.addNotes('QR 시연은 접속한 기기의 화면에서 직접 학습과 가상 운용을 계산하는 방식이며 실제 서비스가 아닙니다. 국내주식 시세 기반 변수 28개, 예측 기간 4종, 종목 수, 비중 배분, 손절·익절 기준, 보유·제외 종목, 본인 판단 방향이 계산에 반영됩니다. 현금성 자산, 지수 선물 헤지, 옵션, 레버리지·인버스 상품은 코스피 대용 지수와 이론가 기준 가정 계산입니다. 수급, 재무, 뉴스, 해외주식, 상장지수펀드는 자료 미확보로 설계안 표기입니다. 성향이 상이한 설정 3건은 거래 횟수, 최대 낙폭, 보유 종목이 서로 달랐으며 3건 간 주간 수익률 상관계수는 0.30~0.54입니다. 3건 모두 동일 기간 지수에 미달하였습니다. 투자금 100만 원 기준 설정 512건을 비교한 결과 임의의 설정 2건 간 보유 종목이 겹치지 않는 비율은 79%이며 주간 수익률 상관계수 평균은 0.38입니다. 개인별 설정이 상이한 결과로 이어진다는 근거입니다. 한계도 확인하였습니다. 설정의 26%가 동일 종목 1개를 동시에 보유하였습니다. 동일 기간 지수를 상회한 설정은 14%입니다. 검증 구간의 성과 순위와 이후 구간의 성과 순위 간 상관은 0.15로 과거 성과가 이후 성과로 이어진다고 보기 어렵습니다. 따라서 개인이 학습시킨 AI의 전략을 주문 전에 검증하는 절차와 앞 장의 위험 통제를 설계에 포함하였습니다. 단순 전략과도 비교하였습니다. 동일 조건(5종목, 약 1개월 주기)에서 60일 모멘텀 상위 종목 매수는 연 -33.5%, 저변동성 종목 매수는 연 +0.2%이며 학습 모델 설정 1,024건의 중앙값은 연 -2.8%입니다. 화면에서는 지수 미달 또는 원금 손실 설정을 실전 운용 부적합으로 판정하며 해당 설정은 주문 연계 대상에서 제외합니다. 손실 수치는 조정하지 않았습니다.');

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
})();

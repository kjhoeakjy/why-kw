const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/63122878-a884-444f-aae4-af6d8490fa3c_b3988ff4-46c4-43e3-804b-a29f0de7ded6/pptx/scripts/apply_theme.js');
const OUT = process.argv[2];
const THEME = { name: 'Mono', headFontFace: 'Malgun Gothic', bodyFontFace: 'Malgun Gothic',
  colors: { dk1: '0A0A0A', lt1: 'FFFFFF', dk2: '6B6B6B', lt2: 'F2F2F2', accent1: '0A0A0A', accent2: '6B6B6B', accent3: 'A6A6A6', accent4: 'D0D0D0', accent5: 'F2F2F2', accent6: '3A3A3A', hlink: '0A0A0A', folHlink: '6B6B6B' } };
(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = 'Why Kiwoom? 나만의 AI를 키움'; pres.author = '김연주';
  const C = pres.SchemeColor, W = 13.333, M = 0.9;
  pres.defineSlideMaster({ title: 'Dark', background: { color: '0A0A0A' }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 3.0, w: W - 2 * M, h: 0.8, fontSize: 32, bold: true, color: C.background1, align: 'left', valign: 'top', margin: 0 }, text: '' } } ] });
  pres.defineSlideMaster({ title: 'Light', background: { color: 'FFFFFF' }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: M, y: 0.8, w: W - 2 * M, h: 0.6, fontSize: 22, bold: true, color: C.text1, align: 'left', valign: 'top', margin: 0 }, text: '' } },
    { line: { x: M, y: 1.5, w: W - 2 * M, h: 0, line: { color: '0A0A0A', width: 1 } } },
    { text: { text: '나만의 AI를 키움', options: { x: M, y: 6.85, w: 4, h: 0.3, fontSize: 9, color: C.text2, margin: 0 } } } ],
    slideNumber: { x: W - M - 0.6, y: 6.85, w: 0.6, h: 0.3, fontSize: 9, color: C.text2, align: 'right' } });
  const T = (s, text, o) => s.addText(text, { isTextBox: true, margin: 0, valign: 'top', color: C.text1, ...o });
  const rule = (s, x, y, w, name, col) => s.addShape(pres.ShapeType.line, { x, y, w, h: 0, line: { color: col || 'D0D0D0', width: 0.75 }, objectName: name });
  const phone = (s, path, x, y, h, name) => { const w = h * 390 / 780;
    s.addShape(pres.ShapeType.rect, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: C.background1 }, line: { color: C.accent3, width: 0.75 }, objectName: name + ' 테두리' });
    s.addImage({ path, x, y, w, h, altText: name, objectName: name }); return w; };
  const SM = 11, BD = 14;

  const box = (s, x, y, w, h, name, dark) => s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: dark ? C.text1 : C.background1 }, line: { color: C.text1, width: 1 }, objectName: name });
  const pic = (s, path, x, y, w, ratio, name) => { const h = w * ratio;
    s.addShape(pres.ShapeType.rect, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: C.background1 }, line: { color: C.accent3, width: 0.75 }, objectName: name + ' 테두리' });
    s.addImage({ path, x, y, w, h, altText: name, objectName: name }); return h; };

  // 1 표지
  pres.addSection({ title: '제안' });
  let s = pres.addSlide({ masterName: 'Dark', sectionTitle: '제안' });
  T(s, '2026 신입사원 Challenge Mission  |  Why Kiwoom?', { x: M, y: 0.9, w: 9, h: 0.3, fontSize: SM, color: C.accent3 });
  s.addText('나만의 AI를 키움', { placeholder: 'title' });
  T(s, '개인 투자 기준 학습 AI 서비스 제안', { x: M, y: 3.8, w: 9, h: 0.4, fontSize: BD, color: C.accent3 });
  T(s, '키움증권 신입사원 22기 김연주', { x: M, y: 6.3, w: 6, h: 0.3, fontSize: SM, color: C.accent3 });
  s.addNotes('개인의 투자 기준으로 투자 AI를 학습·검증·개선하는 서비스 제안입니다.');

  // 2 대상 고객·서비스 구성
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('Mission 1. 대상 고객과 서비스 구성', { placeholder: 'title' });
  T(s, '대상', { x: M, y: 1.9, w: 1, h: 0.3, fontSize: SM, color: C.text2 });
  T(s, '투자 기준 보유, 검증 수단 부재 타사 직접투자자', { x: M + 1.0, y: 1.87, w: 8, h: 0.3, fontSize: 15, bold: true });
  const fx = M, fw = 5.3, fh = 0.6;
  [['01', '투자 기준 입력'], ['02', '개인 모델 학습'], ['03', '실제 데이터 검증'], ['04', '요청 기반 개선'], ['05', '보유 자산 연계']].forEach(([n, t], i) => {
    const y = 2.55 + i * (fh + 0.12), dark = i === 1;
    box(s, fx, y, fw, fh, `단계 ${n}`, dark);
    T(s, n, { x: fx + 0.25, y: y + 0.19, w: 0.5, h: 0.25, fontSize: SM, color: dark ? C.accent3 : C.text2 });
    T(s, t, { x: fx + 0.85, y: y + 0.15, w: fw - 1, h: 0.32, fontSize: 15, bold: true, color: dark ? C.background1 : C.text1 });
  });
  const ph = 3.45, py = 2.65;
  [[7.2, 's-my-home.png', 'MY AI', '일반 투자자 · 간편모드'], [10.1, 's-qs-create.png', 'QUANT STUDIO', '적극적 투자자 · 일반모드']].forEach(([x, img, t, d]) => {
    phone(s, img, x, py, ph, t + ' 화면');
    T(s, t, { x, y: py - 0.75, w: 2.6, h: 0.3, fontSize: 13, bold: true });
    T(s, d, { x, y: py - 0.42, w: 2.6, h: 0.25, fontSize: SM, color: C.text2 });
  });
  s.addNotes('대상은 종목 선택 기준은 있으나 검증 수단이 없는 타사 직접투자자입니다. 숙련도에 따라 간편모드의 MY AI와 일반모드의 QUANT STUDIO로 구분합니다. 보유 자산 연계는 상용화 단계 범위이며 준법 검토가 필요합니다. 고객 유형은 가설이며 인터뷰 결과가 아닙니다.');

  // 3 Why Kiwoom
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('Why Kiwoom. 기존 자산 기반 확장', { placeholder: 'title' });
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
  T(s, '개인 모델 학습 · 검증 · 개선', { x: M, y: dy + 2.02, w: dw, h: 0.25, fontSize: SM, color: C.accent4, align: 'center' });
  const hw = (dw - 0.2) / 2;
  [['MY AI', '간편모드'], ['QUANT STUDIO', '일반모드']].forEach(([k, v], i) => {
    const x = M + i * (hw + 0.2), y = dy + 2.85;
    s.addShape(pres.ShapeType.line, { x: x + hw / 2, y: dy + 2.5, w: 0, h: 0.35, line: { color: C.text1, width: 1 }, objectName: `하위 연결선 ${i + 1}` });
    box(s, x, y, hw, 0.9, `모드 ${i + 1}`);
    T(s, k, { x, y: y + 0.18, w: hw, h: 0.3, fontSize: 13, bold: true, align: 'center' });
    T(s, v, { x, y: y + 0.5, w: hw, h: 0.25, fontSize: SM, color: C.text2, align: 'center' });
  });
  const cx2 = 9.0, cw2 = W - M - cx2;
  T(s, '유형별 고객 역할', { x: cx2, y: dy - 0.3, w: cw2, h: 0.25, fontSize: SM, color: C.text2 });
  [['AI 시그널', '정보 확인'], ['로보어드바이저', '운용 위임'], ['조건검색', '조건 설정'], ['퀀트 플랫폼', '코드 개발'], ['나만의 AI를 키움', '모델 학습·개선']].forEach(([k, v], i) => {
    const y = dy + 0.12 + i * 0.72;
    rule(s, cx2, y - 0.12, cw2, `유형 구분선 ${i + 1}`, i ? 'D0D0D0' : '0A0A0A');
    T(s, k, { x: cx2, y: y + 0.08, w: cw2, h: 0.28, fontSize: 12, bold: i === 4 });
    T(s, v, { x: cx2, y: y + 0.08, w: cw2, h: 0.28, fontSize: 12, bold: i === 4, color: i === 4 ? C.text1 : C.text2, align: 'right' });
  });
  rule(s, cx2, dy + 5 * 0.72, cw2, '유형 하단선');
  s.addNotes('키움증권은 조건검색, 성과검증, API로 개인 투자자의 전략 개발 환경을 제공해 왔습니다. 본 제안은 해당 기반에 개인 모델 학습·검증·개선 기능을 결합하여 코딩을 하지 않는 고객까지 대상을 확장합니다. 유형 비교는 일반 기능 기준이며 개별 경쟁사의 기능 범위와 상이할 수 있습니다.');

  // 4 PoC
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('PoC 실험 결과', { placeholder: 'title' });
  [['629만 행', '국내주식 일별 시세'], ['20개', '학습 모델'], ['640건', '검증 실행']].forEach(([n, l], i) => {
    const y = 1.95 + i * 1.05;
    T(s, n, { x: M, y, w: 2.3, h: 0.45, fontSize: 24, bold: true });
    T(s, l, { x: M, y: y + 0.5, w: 2.3, h: 0.25, fontSize: SM, color: C.text2 });
  });
  T(s, '실험별 연 수익률(%)', { x: 3.5, y: 1.9, w: 5, h: 0.25, fontSize: SM, color: C.text2 });
  s.addChart(pres.charts.BAR, [{ name: '연 수익률', labels: ['기본 설정', '거래 횟수 축소', '하락장 매수 중단', '위험 변수 추가', '비용 없음 가정', '슬리피지 3배', '코스피 대용'], values: [-10.7, -1.7, -2.9, -13.9, 1.9, -17.6, 2.9] }],
    { x: 3.4, y: 2.15, w: 5.6, h: 3.5, barDir: 'bar', chartColors: ['0A0A0A'], showLegend: false, showValue: true, dataLabelFormatCode: '0.0', dataLabelFontSize: 10, dataLabelFontFace: '+mn-lt', dataLabelColor: '0A0A0A',
      catAxisLabelFontSize: 10, catAxisLabelFontFace: '+mn-lt', catAxisLabelColor: '0A0A0A', catAxisOrientation: 'maxMin', catAxisLabelPos: 'low', valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' },
      barGapWidthPct: 60, altText: '실험별 연 수익률 막대 차트', objectName: '연 수익률 차트' });
  const ow = 2.75; pic(s, 'e-opt-c.png', W - M - ow, 1.95, ow, 1000 / 700, '개선 후보 판정 화면');
  T(s, '검증 구간 2019~2024, 투자금 100만 원, 비용 반영 실측  |  코스피 대용: 시가총액 가중 산출  |  QR 시연: 사전 계산 결과 조회  |  출처: KRX 일별 시세(FinanceData/marcap)', { x: M, y: 6.3, w: W - 2 * M, h: 0.3, fontSize: 9, color: C.text2 });
  s.addNotes('실제 시세로 모델 20개를 학습하고 640건을 검증하였습니다. 기본 설정은 연 -10.7%, 거래 횟수 축소 재학습은 -1.7%, 위험 변수 추가는 -13.9%로 악화되어 채택 보류로 판정하였습니다. 동일 모델도 비용 없음 가정 +1.9%, 슬리피지 3배 -17.6%로 거래 조건에 따라 결과가 달라집니다. 전 실험이 코스피 대용 지수 +2.9%를 하회하며 수치는 조정하지 않았습니다. 최종 평가 구간에서도 거래 횟수 축소 모델 +43.6%, 코스피 대용 +188.8%로 상대 부진이 지속됩니다.');

  // 5 Mission 2 + QR
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('Mission 2. 유입 경로와 시연', { placeholder: 'title' });
  const js = ['링크 접속', '비회원 체험', '앱 설치', '회원가입', '계좌 개설', '지속 이용'];
  const jx0 = M + 0.35, jx1 = W - M - 0.35, jy = 2.35, r = 0.22;
  s.addShape(pres.ShapeType.line, { x: jx0, y: jy, w: jx1 - jx0, h: 0, line: { color: C.text1, width: 1 }, objectName: '이용 단계 연결선' });
  js.forEach((t, i) => {
    const cx = jx0 + i * (jx1 - jx0) / 5, dark = i === 1;
    s.addShape(pres.ShapeType.ellipse, { x: cx - r, y: jy - r, w: 2 * r, h: 2 * r, fill: { color: dark ? C.text1 : C.background1 }, line: { color: C.text1, width: 1 }, objectName: `이용 단계 ${i + 1}` });
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
  const kw = 2.9; pic(s, 'e-card.png', 5.1, by + 0.35, kw, 662 / 700, '연구 설정 공유 카드');
  const q = 2.3, qx = W - M - q, qy = by + 0.35;
  T(s, '시연 페이지', { x: qx, y: by, w: q, h: 0.25, fontSize: SM, color: C.text2 });
  s.addImage({ path: 'qr.png', x: qx, y: qy, w: q, h: q, altText: '시연 페이지 QR 코드', objectName: 'QR', hyperlink: { url: 'https://kjhoeakjy.github.io/why-kw/' } });
  T(s, 'kjhoeakjy.github.io/why-kw', { x: qx, y: qy + q + 0.05, w: q, h: 0.25, fontSize: 9, color: C.text2, align: 'center' });
  s.addNotes('투자 콘텐츠 제작자와 기존 고객이 연구 설정을 공유하면 수신자는 계좌 개설 전 본인 조건으로 재학습합니다. 수익률, 종목, 개인 자산 정보는 공유 대상에서 제외합니다. 인증과 계좌 개설 절차는 유지하되 체험 이후 단계로 배치합니다. 측정 지표는 링크 접속률, 첫 학습 완료율, 앱 설치율, 계좌 개설 완료율, 30일 재방문율입니다. QR 시연은 사전 학습·검증 결과를 조회하는 방식이며 실제 서비스가 아닙니다.');

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
})();

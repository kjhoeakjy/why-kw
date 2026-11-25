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

  // 1 표지
  pres.addSection({ title: '제안' });
  let s = pres.addSlide({ masterName: 'Dark', sectionTitle: '제안' });
  T(s, '2026 신입사원 Challenge Mission  |  Why Kiwoom?', { x: M, y: 0.9, w: 9, h: 0.3, fontSize: SM, color: C.accent3 });
  s.addText('나만의 AI를 키움', { placeholder: 'title' });
  T(s, '개인 투자 기준 학습 AI 서비스 제안', { x: M, y: 3.8, w: 9, h: 0.4, fontSize: BD, color: C.accent3 });
  T(s, '플랫폼본부 김연주', { x: M, y: 6.3, w: 6, h: 0.3, fontSize: SM, color: C.accent3 });
  s.addNotes('타 증권사 고객의 키움증권 이용 사유를 제안합니다.');

  // 2 배경
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('제안 배경', { placeholder: 'title' });
  [['대상', '타사 모바일 트레이딩 시스템(MTS) 이용 직접투자자'],
   ['한계', '증권사 간 분석 정보 유사, 개인 투자 기준 반영·검증 기능 부재'],
   ['제안', '개인 투자 기준 기반 예측 모델 학습·검증 기능(영웅문S#)']].forEach(([k, v], i) => {
    const y = 2.3 + i * 1.1;
    T(s, k, { x: M, y, w: 1.6, h: 0.4, fontSize: BD, color: C.text2 });
    T(s, v, { x: M + 1.8, y, w: W - 2 * M - 1.8, h: 0.4, fontSize: 16, bold: i === 2 });
    rule(s, M, y + 0.75, W - 2 * M, `구분선 ${i + 1}`);
  });
  s.addNotes('대상은 타사 MTS 이용 직접투자자입니다. 증권사 간 분석 정보는 유사하며 개인 투자 기준을 반영·검증하는 기능은 없습니다. 이에 따라 개인 기준 모델 학습·검증 기능을 제안합니다.');

  // 3 화면 구성
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('이용자 유형별 화면 구성', { placeholder: 'title' });
  const ph = 4.4, py = 2.0;
  [[M, 's-my-create.png', 'MY AI', '개인 투자자', '선택형 설정, AI 자동 설계'], [7.1, 's-qs-create.png', 'QUANT STUDIO', '전문 투자자', '데이터·모델·전략 직접 설계']].forEach(([x, img, en, ko, d]) => {
    const w = phone(s, img, x, py, ph, en + ' 화면'), tx = x + w + 0.45;
    T(s, en, { x: tx, y: py + 0.05, w: 3.3, h: 0.3, fontSize: SM, color: C.text2, charSpacing: 1.5 });
    T(s, ko, { x: tx, y: py + 0.45, w: 3.3, h: 0.45, fontSize: 20, bold: true });
    T(s, d, { x: tx, y: py + 1.1, w: 3.3, h: 0.7, fontSize: BD, color: C.text2 });
  });
  s.addNotes('개인 투자자 화면은 정보 유형과 보유 기간 선택 시 AI가 연구를 설계합니다. 전문 투자자 화면은 데이터, 모델, 전략, 목적함수를 직접 설정합니다. 두 화면의 학습·검증 방식은 동일합니다.');

  // 4 검증 결과
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('실제 시세 기반 학습·검증 결과', { placeholder: 'title' });
  [['629만 행', '국내주식 일별 시세(2015~2026.9)'], ['640건', '학습·검증 실행'], ['20개', '학습 모델']].forEach(([n, l], i) => {
    const x = M + i * 2.85;
    T(s, n, { x, y: 2.0, w: 2.7, h: 0.6, fontSize: 30, bold: true });
    T(s, l, { x, y: 2.7, w: 2.7, h: 0.3, fontSize: SM, color: C.text2 });
  });
  const tw = 8.3, cx = [M, M + 4.1, M + 5.6, M + 7.1], ty = 3.65;
  rule(s, M, ty - 0.12, tw, '표 상단선', '0A0A0A');
  ['구분', '연 수익률', '최대 낙폭', '연 거래'].forEach((h, j) => T(s, h, { x: cx[j], y: ty, w: j ? 1.2 : 4, h: 0.3, fontSize: SM, color: C.text2, align: j ? 'right' : 'left' }));
  [['기본 설정', '−10.7%', '−53.9%', '338회'], ['거래 횟수 축소 재학습', '−1.7%', '−39.3%', '78회']].forEach((r, i) => {
    const y = ty + 0.5 + i * 0.55;
    rule(s, M, y - 0.12, tw, `표 구분선 ${i + 1}`);
    r.forEach((v, j) => T(s, v, { x: cx[j], y, w: j ? 1.2 : 4, h: 0.3, fontSize: BD, bold: i === 1, align: j ? 'right' : 'left' }));
  });
  rule(s, M, ty + 1.5, tw, '표 하단선');
  T(s, '검증 구간 2019~2024년, 투자금 100만 원, 수수료·거래세·슬리피지 반영 실측', { x: M, y: ty + 1.7, w: tw, h: 0.25, fontSize: 10, color: C.text2 });
  T(s, '동일 기간 코스피 연 +2.9%(비용·배당 미반영)', { x: M, y: ty + 1.97, w: tw, h: 0.25, fontSize: 10, color: C.text2 });
  T(s, '출처: KRX 전종목 일별 시세(FinanceData/marcap 공개 데이터)', { x: M, y: ty + 2.24, w: tw, h: 0.3, fontSize: 10, color: C.text2 });
  phone(s, 's-my-opt.png', W - M - 2.2, 1.95, 4.4, '개선 결과 화면');
  s.addNotes('KRX 일별 시세로 모델 20개를 학습하고 640건을 검증하였습니다. 기본 설정은 비용 차감 후 연 -10.7%, 거래 횟수 축소 요청에 따른 20거래일 모델 재학습 결과는 연 -1.7%입니다. 두 결과 모두 손실이며 수치는 조정하지 않았습니다.');

  // 5 확산
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('연구 설정 공유 기반 확산 경로', { placeholder: 'title' });
  const steps = [['01', '연구 설정 공유', '기존 고객의 링크 전달'], ['02', '비회원 체험', '계좌 개설 전 본인 기준 재학습'], ['03', '영웅문S# 설치', '모델·실험 기록 저장'], ['04', '계좌 개설·연결', '보유 종목 기준 재산정']];
  const sw = (W - 2 * M - 3 * 0.35) / 4;
  steps.forEach(([n, t, d], i) => {
    const x = M + i * (sw + 0.35);
    rule(s, x, 2.6, sw, `단계 ${n} 상단선`, '0A0A0A');
    T(s, n, { x, y: 2.8, w: sw, h: 0.3, fontSize: SM, color: C.text2 });
    T(s, t, { x, y: 3.3, w: sw, h: 0.4, fontSize: 16, bold: true });
    T(s, d, { x, y: 3.85, w: sw, h: 0.6, fontSize: 12, color: C.text2 });
  });
  T(s, '공유 범위: 연구 설정(수익률·종목 미포함)', { x: M, y: 5.3, w: 9, h: 0.3, fontSize: SM, color: C.text2 });
  s.addNotes('기존 고객이 연구 설정 링크를 전달하면 타사 고객은 계좌 개설 전 본인 기준으로 재학습합니다. 모델·기록 저장 단계에서 영웅문S# 설치로 연결하며 계좌 개설은 최종 단계입니다.');

  // 6 시연
  s = pres.addSlide({ masterName: 'Dark', sectionTitle: '제안' });
  s.addText('시연 페이지', { placeholder: 'title' });
  T(s, '개인 투자자·전문 투자자 화면 선택, 계좌 개설 불필요', { x: M, y: 3.8, w: 7, h: 0.4, fontSize: BD, color: C.accent3 });
  T(s, '과제 시연용, 실제 서비스 아님', { x: M, y: 6.3, w: 7, h: 0.3, fontSize: 10, color: C.accent3 });
  const q = 2.6, qx = W - M - q, qy = 2.35;
  s.addShape(pres.ShapeType.rect, { x: qx - 0.12, y: qy - 0.12, w: q + 0.24, h: q + 0.24, fill: { color: C.background1 }, line: { color: C.background1, width: 0 }, objectName: 'QR 배경' });
  s.addImage({ path: 'qr.png', x: qx, y: qy, w: q, h: q, altText: '시연 페이지 QR 코드', objectName: 'QR', hyperlink: { url: 'https://kjhoeakjy.github.io/why-kw/' } });
  T(s, 'kjhoeakjy.github.io/why-kw', { x: qx - 0.12, y: qy + q + 0.3, w: q + 0.24, h: 0.3, fontSize: 10, color: C.accent3, align: 'center' });
  s.addNotes('QR 접속 후 개인 투자자 또는 전문 투자자 화면을 선택하여 실행합니다.');

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
})();

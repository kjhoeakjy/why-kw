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
  T(s, '고객별 투자 기준을 학습하는 개인 투자 AI 서비스 제안', { x: M, y: 3.8, w: 9, h: 0.4, fontSize: BD, color: C.accent3 });
  T(s, '플랫폼본부 김연주', { x: M, y: 6.3, w: 6, h: 0.3, fontSize: SM, color: C.accent3 });
  s.addNotes('고객이 자신의 투자 기준으로 투자 AI를 만들고 검증하며 지속적으로 개선하는 서비스를 제안합니다.');

  // 2 고객
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('핵심 고객과 미충족 수요', { placeholder: 'title' });
  T(s, '핵심 고객', { x: M, y: 1.85, w: 2, h: 0.3, fontSize: SM, color: C.text2 });
  T(s, '타 증권사에서 국내주식에 직접 투자하며 종목 선택 기준을 보유하였으나 데이터 기반 검증과 전략 구현이 어려운 고객', { x: M, y: 2.2, w: W - 2 * M, h: 0.4, fontSize: 15, bold: true });
  const cw = (W - 2 * M - 0.6) / 2;
  [['일반 투자자 A', '직장인, 타사 MTS 이용', '거래량·가격 흐름 중시, 분석 시간 부족', '본인 기준을 반영한 투자 판단 지원', 'MY AI (간편모드)'],
   ['적극적 투자자 B', '투자 경력 다수, 타사 MTS 이용', '매매 원칙 보유, 모델 개발 역량 부족', '투자 가설의 모델 구현과 검증', 'QUANT STUDIO (일반모드)']].forEach(([n, p, now, need, svc], i) => {
    const x = M + i * (cw + 0.6), y = 3.05;
    rule(s, x, y, cw, `${n} 상단선`, '0A0A0A');
    T(s, n, { x, y: y + 0.2, w: cw, h: 0.35, fontSize: 16, bold: true });
    T(s, p, { x, y: y + 0.6, w: cw, h: 0.3, fontSize: SM, color: C.text2 });
    [['현재 상황', now], ['요구 사항', need], ['제공 서비스', svc]].forEach(([k, v], j) => {
      const yy = y + 1.1 + j * 0.55;
      rule(s, x, yy, cw, `${n} 구분선 ${j + 1}`);
      T(s, k, { x, y: yy + 0.15, w: 1.3, h: 0.3, fontSize: SM, color: C.text2 });
      T(s, v, { x: x + 1.4, y: yy + 0.13, w: cw - 1.4, h: 0.3, fontSize: 13, bold: j === 2 });
    });
  });
  T(s, '제외 대상: 투자 무관심층, 적립식 상장지수펀드(ETF) 중심 고객  |  고객 가설 기반 가상 인물이며 실제 인터뷰 결과 아님', { x: M, y: 6.1, w: W - 2 * M, h: 0.3, fontSize: 10, color: C.text2 });
  s.addNotes('핵심 고객은 자신의 종목 선택 기준은 있으나 이를 데이터로 검증하거나 전략으로 구현하기 어려운 타사 직접투자자입니다. 동일한 문제를 가진 고객을 숙련도에 따라 두 화면으로 구분합니다.');

  // 3 서비스 구성
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('Mission 1. 나만의 AI를 키움 서비스 구성', { placeholder: 'title' });
  [['투자 기준 입력', '투자 목적, 중시 정보, 보유 기간, 투자금'], ['개인 모델 학습', '고객별 데이터 선택, 예측 모델 학습'], ['실제 데이터 검증', '과거 성과, 최대 낙폭, 거래 비용'],
   ['요청 기반 개선', '개선 요청, 후보 실험, 채택·보류 판정'], ['투자 환경 연계', '보유 종목·현금 반영(상용화 단계)']].forEach(([k, v], i) => {
    const y = 1.95 + i * 0.82;
    T(s, String(i + 1).padStart(2, '0'), { x: M, y, w: 0.5, h: 0.3, fontSize: SM, color: C.text2 });
    T(s, k, { x: M + 0.55, y: y - 0.02, w: 4.5, h: 0.32, fontSize: 15, bold: true });
    T(s, v, { x: M + 0.55, y: y + 0.33, w: 5, h: 0.3, fontSize: 12, color: C.text2 });
    if (i < 4) rule(s, M, y + 0.72, 5.6, `단계 구분선 ${i + 1}`);
  });
  const ph = 4.0, py = 1.95;
  [[7.0, 's-my-home.png', 'MY AI 간편모드', '원하는 결과 전달'], [10.05, 's-qs-create.png', 'QUANT STUDIO 일반모드', '산출 방식 직접 제어']].forEach(([x, img, t, d]) => {
    const w = phone(s, img, x, py, ph, t + ' 화면');
    T(s, t, { x, y: py + ph + 0.15, w: 2.6, h: 0.3, fontSize: 12, bold: true });
    T(s, d, { x, y: py + ph + 0.45, w: 2.6, h: 0.3, fontSize: SM, color: C.text2 });
  });
  s.addNotes('고객은 투자 기준을 입력하고 개인 모델을 학습시킨 뒤 실제 과거 데이터로 검증합니다. 이후 개선을 요청하면 AI가 후보를 실험하고 채택 또는 보류로 판정합니다. 간편모드 고객은 원하는 결과를 전달하고 일반모드 고객은 데이터, 모델, 전략까지 직접 설정합니다.');

  // 4 Why Kiwoom
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('Why Kiwoom. 기존 투자전략 개발 환경의 확장', { placeholder: 'title' });
  const tx = [M, M + 2.6, M + 5.3], tw2 = 7.9;
  ['서비스 유형', '고객 역할', '제공 내용'].forEach((h, j) => T(s, h, { x: tx[j], y: 1.95, w: 2.6, h: 0.3, fontSize: SM, color: C.text2 }));
  rule(s, M, 1.85, tw2, '비교표 상단선', '0A0A0A');
  [['AI 시그널', 'AI 분석 정보 확인', '종목 변동 원인 이해'], ['로보어드바이저', '목표·성향 입력', '자산 운용 위임'], ['조건검색', '검색 조건 직접 설정', '조건 충족 종목 탐색'],
   ['퀀트 연구 플랫폼', '전략 코드 개발', '전문 연구 환경'], ['나만의 AI를 키움', '개인 AI 학습·검증·개선', '지속 관리형 개인 투자 모델']].forEach((r, i) => {
    const y = 2.45 + i * 0.55;
    rule(s, M, y - 0.12, tw2, `비교표 구분선 ${i + 1}`);
    r.forEach((v, j) => T(s, v, { x: tx[j], y, w: j === 2 ? 2.6 : 2.5, h: 0.3, fontSize: 13, bold: i === 4 }));
  });
  rule(s, M, 2.45 + 5 * 0.55 - 0.12, tw2, '비교표 하단선');
  T(s, '유형별 일반 기능 비교이며 개별 경쟁사의 기능 범위와 상이할 수 있음', { x: M, y: 5.25, w: tw2, h: 0.3, fontSize: 10, color: C.text2 });
  const rx = 9.45, rw = W - M - rx;
  T(s, '키움증권 기존 자산', { x: rx, y: 1.95, w: rw, h: 0.3, fontSize: SM, color: C.text2 });
  rule(s, rx, 1.85, rw, '기존 자산 상단선', '0A0A0A');
  [['조건검색', '투자 기준 설정'], ['성과검증', '과거 전략 검증'], ['Open API+ · REST API', '투자 시스템 구현']].forEach(([k, v], i) => {
    const y = 2.45 + i * 0.55;
    rule(s, rx, y - 0.12, rw, `기존 자산 구분선 ${i + 1}`);
    T(s, k, { x: rx, y: y - 0.04, w: rw, h: 0.25, fontSize: 13, bold: true });
    T(s, v, { x: rx, y: y + 0.22, w: rw, h: 0.22, fontSize: SM, color: C.text2 });
  });
  T(s, '코딩 역량 보유 고객 중심의 전략 개발 환경을 투자 기준 보유 고객 전체로 확장', { x: rx, y: 4.25, w: rw, h: 0.8, fontSize: 13, bold: true });
  s.addNotes('AI 활용이나 개인 전략 구현 자체는 타사도 제공합니다. 키움증권은 조건검색, 성과검증, API로 개인 투자자의 전략 개발 환경을 이미 제공해 왔습니다. 이 기반 위에 개인 모델 학습과 개선 기능을 결합하여 코딩을 하지 않는 고객까지 대상을 확장합니다.');

  // 5 PoC
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('PoC 구현 및 실험 결과', { placeholder: 'title' });
  const lw = 3.6;
  [['데이터', '국내주식 일별 시세 629만 행, 2,864종목'], ['모델', '20개, Ridge·LightGBM, 연 단위 전진 분석'], ['검증', '640건, 수수료·거래세·슬리피지 반영'], ['시연 방식', '사전 학습 결과 조회, 실시간 학습은 서버']].forEach(([k, v], i) => {
    const y = 1.95 + i * 0.85;
    rule(s, M, y - 0.12, lw, `구현 구분선 ${i + 1}`, i ? 'D0D0D0' : '0A0A0A');
    T(s, k, { x: M, y, w: lw, h: 0.3, fontSize: SM, color: C.text2 });
    T(s, v, { x: M, y: y + 0.3, w: lw, h: 0.45, fontSize: 12 });
  });
  const ex = M + lw + 0.5, ew = W - M - ex, ec = [ex, ex + 3.85, ex + 5.0, ex + 6.15];
  ['실험', '연 수익률', '최대 낙폭', '판정'].forEach((h, j) => T(s, h, { x: ec[j], y: 1.95, w: j ? 1.05 : 3.7, h: 0.3, fontSize: SM, color: C.text2, align: j ? 'right' : 'left' }));
  rule(s, ex, 1.83, ew, '실험표 상단선', '0A0A0A');
  [['기본 설정', '−10.7%', '−53.9%', '기준'], ['거래 횟수 축소(20거래일 재학습)', '−1.7%', '−39.3%', '조건부 채택'], ['하락장 신규 매수 중단', '−2.9%', '−24.9%', '조건부 채택'],
   ['위험 변수 추가 재학습', '−13.9%', '−65.0%', '채택 보류'], ['기본 설정, 비용 없음 가정', '+1.9%', '−51.5%', '참고'], ['기본 설정, 슬리피지 3배 가정', '−17.6%', '−68.5%', '참고']].forEach((r, i) => {
    const y = 2.45 + i * 0.5;
    rule(s, ex, y - 0.11, ew, `실험표 구분선 ${i + 1}`);
    r.forEach((v, j) => T(s, v, { x: ec[j], y, w: j ? 1.05 : 3.7, h: 0.3, fontSize: 12, bold: i === 1, align: j ? 'right' : 'left' }));
  });
  rule(s, ex, 2.45 + 6 * 0.5 - 0.11, ew, '실험표 하단선');
  T(s, [{ text: '검증 구간 2019~2024년, 투자금 100만 원 기준 실측. 전 실험 손실이며 수치 무조정', options: { breakLine: true } },
    { text: '동일 기간 코스피 대용(시가총액 가중 산출) 연 +2.9%. 최종 평가 구간(2025.1~2026.9) 거래 횟수 축소 모델 +43.6%, 코스피 대용 +188.8%', options: { breakLine: true } },
    { text: '출처: KRX 전종목 일별 시세(FinanceData/marcap 공개 데이터)' }], { x: ex, y: 5.55, w: ew, h: 1.0, fontSize: 10, color: C.text2, paraSpaceAfter: 3 });
  s.addNotes('실제 시세로 모델 20개를 학습하고 640건을 검증하였습니다. 동일 모델의 연 수익률은 비용 없음 가정 +1.9%, 기본 가정 -10.7%, 슬리피지 3배 -17.6%로 거래 조건에 따라 달라집니다. 위험 변수 추가처럼 성과가 악화된 개선안은 채택 보류로 판정합니다. QR 시연은 사전 학습·검증 결과를 조회하는 방식이며 실시간 학습은 서버 환경에서 실행됩니다.');

  // 6 Mission 2
  s = pres.addSlide({ masterName: 'Light', sectionTitle: '제안' });
  s.addText('Mission 2. 연구 설정 공유 기반 고객 유입', { placeholder: 'title' });
  const mc = [M, M + 2.9, M + 7.3], mw = W - 2 * M;
  ['채널', '콘텐츠', '고객 행동'].forEach((h, j) => T(s, h, { x: mc[j], y: 1.95, w: 4, h: 0.3, fontSize: SM, color: C.text2 }));
  rule(s, M, 1.85, mw, '채널표 상단선', '0A0A0A');
  [['투자 유튜브', '거래량 중시 투자 AI 구성 영상', '설명란 연구 설정 링크 접속'], ['직장인 커뮤니티', '거래 횟수 축소에 따른 성과 비교', 'MY AI 체험'],
   ['퀀트·API 이용자 커뮤니티', '코딩 없는 모델 구축, 알고리즘 비교', 'QUANT STUDIO 연구 복제'], ['키움증권 기존 고객', '본인 연구 설정 공유', '지인 링크 전달']].forEach((r, i) => {
    const y = 2.4 + i * 0.47;
    rule(s, M, y - 0.1, mw, `채널표 구분선 ${i + 1}`);
    r.forEach((v, j) => T(s, v, { x: mc[j], y, w: 4.3, h: 0.3, fontSize: 12, bold: j === 0 }));
  });
  const js = [['링크 접속', '관심 주제 연계 콘텐츠'], ['비회원 체험', '개인정보 입력 없음'], ['영웅문S# 설치', '웹 체험 기록 이전'], ['회원가입', '여러 기기 기록 조회'], ['계좌 개설·인증', '진행 단계 표시'], ['지속 이용', '신규 실험 결과 제공']];
  const jw = (mw - 5 * 0.2) / 6, jy = 4.85;
  T(s, '이용 단계와 이탈 방지 요소', { x: M, y: jy - 0.4, w: 5, h: 0.3, fontSize: SM, color: C.text2 });
  js.forEach(([t, d], i) => {
    const x = M + i * (jw + 0.2);
    rule(s, x, jy, jw, `이용 단계 ${i + 1}`, '0A0A0A');
    T(s, String(i + 1).padStart(2, '0'), { x, y: jy + 0.12, w: jw, h: 0.25, fontSize: 10, color: C.text2 });
    T(s, t, { x, y: jy + 0.4, w: jw, h: 0.3, fontSize: 13, bold: true });
    T(s, d, { x, y: jy + 0.75, w: jw, h: 0.3, fontSize: SM, color: C.text2 });
  });
  T(s, '공유 제외: 수익률, 종목, 개인 자산 정보  |  측정 지표: 링크 접속률, 첫 학습 완료율, 재실험률, 앱 설치율, 계좌 개설 완료율, 30일 재방문율', { x: M, y: 6.1, w: mw, h: 0.3, fontSize: 10, color: C.text2 });
  s.addNotes('투자 콘텐츠 제작자와 기존 고객이 연구 설정을 공유하면 수신자는 본인의 투자금과 보유 기간으로 변경하여 재학습합니다. 본인인증과 계좌 개설 절차는 유지하되 고객이 서비스를 체험한 뒤 진행하도록 순서를 조정합니다.');

  // 7 시연
  s = pres.addSlide({ masterName: 'Dark', sectionTitle: '제안' });
  s.addText('시연 페이지', { placeholder: 'title' });
  T(s, '개인 투자자·전문 투자자 화면 선택, 계좌 개설 불필요', { x: M, y: 3.8, w: 7, h: 0.4, fontSize: BD, color: C.accent3 });
  T(s, '사전 학습·검증 결과 640건 조회 방식. 과제 시연용이며 실제 서비스 아님', { x: M, y: 6.3, w: 8, h: 0.3, fontSize: 10, color: C.accent3 });
  const q = 2.6, qx = W - M - q, qy = 2.35;
  s.addShape(pres.ShapeType.rect, { x: qx - 0.12, y: qy - 0.12, w: q + 0.24, h: q + 0.24, fill: { color: C.background1 }, line: { color: C.background1, width: 0 }, objectName: 'QR 배경' });
  s.addImage({ path: 'qr.png', x: qx, y: qy, w: q, h: q, altText: '시연 페이지 QR 코드', objectName: 'QR', hyperlink: { url: 'https://kjhoeakjy.github.io/why-kw/' } });
  T(s, 'kjhoeakjy.github.io/why-kw', { x: qx - 0.12, y: qy + q + 0.3, w: q + 0.24, h: 0.3, fontSize: 10, color: C.accent3, align: 'center' });
  s.addNotes('QR 접속 후 개인 투자자 또는 전문 투자자 화면을 선택하여 실행합니다.');

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
})();

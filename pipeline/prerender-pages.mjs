// 계산기 페이지의 숫자를 정적 HTML로 미리 채웁니다. 모델 호출이 없으므로 비용은 0원입니다.
//
//   node prerender-pages.mjs              전체
//   node prerender-pages.mjs margin       한 페이지만
//
// 두 가지를 합니다.
//  1) 자바스크립트가 채우는 칸(결과·표)을 Edge 헤드리스로 실제 렌더링해서 그 결과를 HTML에 박는다.
//     페이지마다 렌더 코드를 다시 짜지 않으므로 화면과 숫자가 어긋날 수 없다.
//     단, 자바스크립트가 덮어쓰는(innerHTML·textContent) 칸만 넣는다. 덧붙이는 칸(칩 버튼 등)을 넣으면 두 번 생긴다.
//  2) 같은 계산 엔진으로 페이지마다 고유한 설명 섹션(<!-- PRE:이름 --> 자리)을 만든다.
//
// salary.html 은 prerender-salary.mjs 가 따로 맡습니다. 여러 번 돌려도 결과는 같습니다.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

function engine(file, names) {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(SITE, 'assets', file), 'utf8') + `\n;globalThis.__e = { ${names.join(', ')} };`, ctx);
  return ctx.__e;
}

// ── HTML 조각 다루기 ─────────────────────────────────────────
// id 가 붙은 요소의 안쪽 범위를 찾는다. 같은 태그가 안에 중첩돼도 짝을 맞춘다.
function innerRange(html, id) {
  const open = new RegExp(`<([a-z0-9]+)\\b[^>]*\\bid="${id}"[^>]*>`, 'i').exec(html);
  if (!open) return null;
  const tag = open[1].toLowerCase(), start = open.index + open[0].length;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi'); re.lastIndex = start;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[1]) { if (--depth === 0) return [start, m.index]; } else depth++;
  }
  return null;
}
function setInner(html, id, body) {
  const r = innerRange(html, id);
  if (!r) throw new Error(`id="${id}" 를 못 찾았습니다`);
  return html.slice(0, r[0]) + body + html.slice(r[1]);
}
function setBlock(html, name, body) {
  const re = new RegExp(`(<!-- PRE:${name}:START -->)[\\s\\S]*?(<!-- PRE:${name}:END -->)`);
  if (!re.test(html)) throw new Error(`PRE:${name} 표시가 없습니다`);
  return html.replace(re, (_, a, b) => a + body + b);
}

function renderDom(file) {
  const url = pathToFileURL(path.join(SITE, file)).href;
  return execFileSync(EDGE, ['--headless', '--disable-gpu', '--virtual-time-budget=4000', '--dump-dom', url],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
}

const table = (head, rows) => `
  <div class="card scroll">
    <table class="cmp">
      <thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>
${rows.map(r => `        <tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('\n')}
      </tbody>
    </table>
  </div>`;

// ───────────────────────── 연차 ─────────────────────────
function leaveBlocks() {
  // 날짜는 엔진 쪽 Date 로 만들어야 한다. 바깥 Date 는 엔진의 instanceof Date 검사에 걸려 0일이 나온다
  const E = engine('leave2026.js', ['RULE', 'daysForYear', 'accrue', 'fiscalFirstYear', 'addMonths', 'ymd', 'ko', 'Date']);
  const D = (y, m, d) => new E.Date(y, m - 1, d);
  const blocks = {};

  // 근속연수별 일수
  const rows = [];
  let cum = E.RULE.monthlyCap;
  for (let y = 1; y <= 21; y++) {
    cum += E.daysForYear(y);
    if (y <= 7 || y % 2 === 1 || y === 21) rows.push([`만 ${y}년`, `${E.daysForYear(y)}일`, `${cum}일`]);
  }
  blocks['leave-years'] = `
  <h2>근속연수별 연차 일수 한눈에 보기</h2>
  <p>매 입사 기념일에 생기는 일수와, 입사 후 그날까지 모두 합친 일수입니다. 누적에는 1년 미만 기간의 ${E.RULE.monthlyCap}일이 들어 있습니다. 출근율 80% 이상, 개근을 전제로 했습니다.</p>
${table(['근속', '그날 생기는 연차', '입사 후 누적 발생'], rows)}
  <p>만 21년에 ${E.RULE.cap}일이 된 뒤로는 더 늘지 않습니다. 만 22년에도, 만 30년에도 매년 ${E.RULE.cap}일입니다.</p>
`;

  // 하루 차이로 갈리는 날
  const hire = D(2024, 3, 4);
  const cases = [[2025, 3, 3], [2025, 3, 4], [2027, 3, 3], [2027, 3, 4]].map(([y, m, d]) => {
    const r = E.accrue(hire, D(y, m, d));
    return [`${E.ymd(D(y, m, d))}`, `${r.total}일`];
  });
  const h31 = D(2026, 1, 31);
  const monthly = [1, 2, 3, 4].map(m => E.ymd(E.addMonths(h31, m)));
  const f = E.fiscalFirstYear(D(2025, 7, 1));
  blocks['leave-edges'] = `
  <h2>하루 차이로 일수가 갈리는 날</h2>
  <p>${E.ko(hire)}에 입사한 사람이 아래 날짜까지 일하고 퇴사하면, 그때까지 생긴 연차는 이렇습니다.</p>
${table(['마지막 근무일', '지금까지 발생한 연차'], cases.map((c, i) => [c[0] + (i % 2 ? ' (기념일 당일)' : ' (기념일 전날)'), c[1]]))}
  <p>입사 기념일 당일까지 일해야 그해의 연차가 생깁니다. 1년째에는 ${cases[0][1]}에서 ${cases[1][1]}로, 3년째에는 ${cases[2][1]}에서 ${cases[3][1]}로 하루 만에 달라집니다. 1년 계약직이 계약 기간만 채우고 나가는 경우 연차는 11일이라는 것이 대법원 판례(2021다227100)입니다.</p>

  <h3>입사일이 31일이면 매달 말일에 생깁니다</h3>
  <p>${E.ko(h31)}에 입사했다면 1년 미만 연차는 ${monthly.join(', ')}에 하루씩 생깁니다. 2월 31일이나 4월 31일은 없으니 그달의 마지막 날로 맞춥니다. 이 계산기도 같은 방식으로 날짜를 셉니다.</p>

  <h3>회계연도 기준 회사라면 첫해는 비례로</h3>
  <p>1월 1일에 모든 직원에게 연차를 주는 회사는 첫해 연차를 일한 날만큼 나눠 줍니다. 2025년 7월 1일에 입사했다면 그해 근무일이 ${f.worked}일이라 <strong>15일 × ${f.worked} ÷ 365 = ${f.days}일</strong>을 ${E.ko(f.grantOn)}에 받습니다. 1년 미만 기간의 월 1일씩은 이와 별도로 생깁니다. 퇴사할 때는 입사일 기준으로 다시 계산해서 그보다 적게 받았다면 차액을 받아야 합니다.</p>
`;
  return blocks;
}

// ───────────────────────── 마진 ─────────────────────────
function marginBlocks() {
  const E = engine('margin2026.js', ['VAT', 'marginOf', 'supplyOf', 'vatOf']);
  const won = n => Math.round(n).toLocaleString('ko-KR');
  const pct = r => (r * 100).toFixed(1) + '%';
  const base = { price: 30000, cost: 15000, feeRate: 0.06, ship: 3000, etc: 500, general: true };
  const r = E.marginOf(base);
  const blocks = {};

  const row = (k, f, v) => [k, f, v];
  blocks['margin-example'] = `
  <h2>예시: 3만원짜리 한 건을 따라가 보면</h2>
  <p>위 계산기의 기본값(판매가 ${won(base.price)}원 · 매입원가 ${won(base.cost)}원 · 수수료 ${base.feeRate * 100}% · 배송비 ${won(base.ship)}원 · 포장 ${won(base.etc)}원 · 일반과세자)을 단계별로 풀었습니다. 표의 숫자는 계산기와 같은 계산식으로 만든 것입니다.</p>
${table(['단계', '계산', '금액'], [
    row('고객이 낸 돈', '판매가', won(r.price) + '원'),
    row('수수료', `${won(r.price)} × ${base.feeRate * 100}% + 수수료 부가세 10%`, '−' + won(r.feeTotal) + '원'),
    row('정산 입금액', '판매가 − 수수료', won(r.settled) + '원'),
    row('내가 낸 비용', `원가 ${won(base.cost)} + 배송 ${won(base.ship)} + 포장 ${won(base.etc)}`, '−' + won(base.cost + base.ship + base.etc) + '원'),
    row('여기까지 남은 돈', '입금액 − 비용', won(r.settled - base.cost - base.ship - base.etc) + '원'),
    row('받은 부가세', `${won(r.price)} ÷ 11`, won(r.vatOut) + '원'),
    row('낸 부가세 (공제)', '원가·배송·포장 ÷ 11 + 수수료 부가세', '−' + won(r.vatIn) + '원'),
    row('신고 때 낼 부가세', '받은 부가세 − 낸 부가세', '−' + won(r.vatDue) + '원'),
    row('진짜 남는 돈', '여기까지 남은 돈 − 낼 부가세', '<strong>' + won(r.profit) + '원</strong>'),
  ])}
  <p>정산금에서 비용만 빼면 ${won(r.settled - base.cost - base.ship - base.etc)}원이 남은 것 같지만, 그중 ${won(r.vatDue)}원은 다음 부가세 신고 때 나라에 내야 하는 돈입니다. 진짜 남는 돈은 <strong>${won(r.profit)}원, 마진율 ${pct(r.marginRate)}</strong>입니다.</p>
`;

  const fees = [[0.033, '카드 3.3%'], [0.06, '스마트스토어 6%'], [0.12, '오픈마켓 12%'], [0.30, '배달앱 30%']];
  const cmp = fees.map(([f, label]) => {
    const g = E.marginOf({ ...base, feeRate: f });
    const s = E.marginOf({ ...base, feeRate: f, general: false });
    const naive = g.settled - base.cost - base.ship - base.etc;
    return { label, naive, g, s };
  });
  blocks['margin-compare'] = `
  <h2>수수료율별로 얼마나 착각하게 되나</h2>
  <p>같은 3만원짜리 상품을 수수료율만 바꿔 팔았을 때입니다. '부가세 빼먹은 계산'은 정산금에서 비용만 뺀 금액이고, '진짜 남는 돈'은 일반과세자가 부가세 신고까지 마친 뒤 남는 금액입니다.</p>
${table(['수수료', '부가세 빼먹은 계산', '진짜 남는 돈', '차이'],
    cmp.map(x => [x.label, won(x.naive) + '원', won(x.g.profit) + '원', '−' + won(x.naive - x.g.profit) + '원']))}
  <p>차이는 신고 때 낼 부가세만큼입니다. 수수료가 클수록 차이가 줄어드는 것은 수수료에 붙은 부가세를 공제받기 때문입니다. ${cmp[3].g.profit < 0
      ? `배달앱 수수료 수준이면 이 조건으로는 한 건 팔 때마다 ${won(-cmp[3].g.profit)}원씩 손해입니다. 부가세를 빼먹은 계산으로는 ${cmp[3].naive < 0 ? won(-cmp[3].naive) + '원 손해로 보여 손해 폭을 작게 보게 됩니다' : won(cmp[3].naive) + '원 남는 것처럼 보입니다'}.`
      : ''}</p>

  <p>연 매출 4,800만원 미만이라 부가세 납부가 면제되는 간이과세자는 왼쪽 '부가세 빼먹은 계산'이 실제로 남는 돈과 같습니다. 그보다 매출이 큰 간이과세자는 업종별 부가율에 따른 세금을 내므로 그 사이 어딘가가 됩니다.</p>
`;
  return blocks;
}

// ───────────────────────── 시급·주휴수당 ─────────────────────────
function hourlyBlocks() {
  const E = engine('labor2026.js', ['LABOR', 'wageWithHoliday', 'won']);
  const w = E.LABOR.minWage, won = E.won;
  const full = E.wageWithHoliday(40, w);
  const naive = full.totalWeekly * E.LABOR.weeksPerMonth;
  const official = w * E.LABOR.monthlyHours;
  const rows = [14, 15, 20, 25, 30, 40].map(h => {
    const x = E.wageWithHoliday(h, w);
    return [h + '시간', x.holiday.eligible ? won(x.holiday.monthly) + '원' : '없음', won(x.totalMonthly) + '원'];
  });
  const m14 = E.wageWithHoliday(14, w).totalMonthly, m15 = E.wageWithHoliday(15, w).totalMonthly;
  return { 'hourly-extra': `
  <h2>주급에 4.345를 곱하면 왜 월급과 안 맞을까</h2>
  <p>2026년 최저시급 ${won(w)}원으로 주 40시간 일하면 주휴수당을 포함한 주급은 ${won(full.totalWeekly)}원입니다. 한 달을 4.345주로 보고 곱하면 <strong>${won(naive)}원</strong>이 나옵니다. 그런데 정부가 공표하는 최저 월급은 <strong>${won(official)}원</strong>(시급 × 209시간)입니다. ${won(official - naive)}원이 차이 납니다.</p>
  <p>209시간은 주 48시간(근로 40 + 주휴 8)에 4.345를 곱한 208.56시간을 <strong>먼저 반올림한 값</strong>입니다. 시간을 반올림한 뒤 시급을 곱하느냐, 돈에 4.345를 곱하느냐의 차이입니다. 월급 계약서와 맞추려면 시간을 먼저 반올림해야 하고, 이 계산기도 그렇게 계산합니다.</p>
  <h3>최저시급으로 주 몇 시간 일하면 한 달에 얼마</h3>
${table(['주 소정근로시간', '월 주휴수당', '월 급여 (주휴 포함)'], rows)}
  <p>주 14시간과 15시간은 한 시간 차이지만 월 급여는 ${won(m14)}원과 ${won(m15)}원으로 <strong>${won(m15 - m14)}원</strong> 벌어집니다. 15시간부터 주휴수당이 붙기 때문입니다.</p>
` };
}

// ───────────────────────── 퇴직금 ─────────────────────────
function severanceBlocks() {
  const E = engine('labor2026.js', ['severancePay', 'retirementTax', 'serviceYears', 'averagePeriodDays', 'daysBetween', 'won', 'Date']);
  const won = E.won, pay = 3000000;
  const rows = [[2026, 3, 1], [2026, 6, 1], [2026, 9, 1], [2026, 12, 1]].map(([y, m, d]) => {
    const leave = new E.Date(y, m - 1, d), join = new E.Date(y - 3, m - 1, d);
    const days = E.daysBetween(join, leave), pd = E.averagePeriodDays(leave);
    return { label: `${y}년 ${m}월 ${d}일`, days, pd, years: E.serviceYears(join, leave), r: E.severancePay({ days, periodDays: pd, monthlyPay: pay }) };
  });
  const hi = rows.reduce((a, b) => b.r.amount > a.r.amount ? b : a);
  const lo = rows.reduce((a, b) => b.r.amount < a.r.amount ? b : a);
  const base = rows[0], t = E.retirementTax(base.r.amount, base.days, base.years);
  return { 'severance-extra': `
  <h2>같은 3년을 일해도 언제 그만두느냐에 따라 다릅니다</h2>
  <p>월급 ${won(pay)}원으로 딱 3년을 일하고 퇴직한 경우입니다. 근속기간은 같지만, 평균임금을 구할 때 나누는 <strong>직전 3개월의 달력 일수</strong>가 퇴직일마다 달라서 퇴직금도 달라집니다.</p>
${table(['퇴직일', '직전 3개월 일수', '1일 평균임금', '퇴직금'], rows.map(x => [x.label, x.pd + '일', won(x.r.dailyAverage) + '원', won(x.r.amount) + '원']))}
  <p>직전 3개월이 가장 짧은 ${hi.label} 퇴직이 ${won(hi.r.amount)}원으로 가장 많고, 가장 긴 ${lo.label} 퇴직이 ${won(lo.r.amount)}원으로 가장 적습니다. 차이는 ${won(hi.r.amount - lo.r.amount)}원입니다. 같은 석 달 치 월급을 더 적은 일수로 나누면 하루 평균임금이 올라가기 때문입니다.</p>
  <h3>퇴직소득세는 이렇게 나옵니다 (${base.label} 퇴직 기준)</h3>
${table(['단계', '계산', '금액'], [
    ['퇴직금', '위 표 첫 줄', won(base.r.amount) + '원'],
    ['근속연수공제', `근속 ${t.years}년 기준`, '−' + won(t.yearDed) + '원'],
    ['환산급여', `(퇴직금 − 근속연수공제) × 12 ÷ ${t.years}`, won(t.converted) + '원'],
    ['환산급여공제', '환산급여 구간별 공제', '−' + won(t.convDed) + '원'],
    ['과세표준', '환산급여 − 환산급여공제', won(t.taxBase) + '원'],
    ['퇴직소득세', `과세표준에 세율을 곱한 뒤 ÷ 12 × ${t.years}`, won(t.incomeTax) + '원'],
    ['지방소득세', '퇴직소득세 × 10%', won(t.localTax) + '원'],
    ['실수령 퇴직금', '퇴직금 − 세금', '<strong>' + won(t.net) + '원</strong>'],
  ])}
  <p>퇴직금 ${won(base.r.amount)}원에 붙는 세금은 ${won(t.total)}원, 실효세율 ${(t.effectiveRate * 100).toFixed(2)}%입니다. 같은 돈을 월급으로 받았을 때보다 훨씬 적은데, 여러 해에 걸쳐 쌓인 돈을 1년치로 나눠(환산급여) 세율을 매기기 때문입니다.</p>
` };
}

// ───────────────────────── 4대보험 ─────────────────────────
function insuranceBlocks() {
  const E = engine('insurance2026.js', ['insuranceOf', 'won']);
  const won = E.won, o = { pay: 2500000, taxFree: 200000, size: 'u150' };
  const cases = [['일반 직원', {}], ['60세 이상', { over60: true }], ['월 60시간 미만', { shortTime: true }]]
    .map(([k, x]) => [k, E.insuranceOf({ ...o, ...x })]);
  const base = cases[0][1];
  return { 'insurance-extra': `
  <h2>월급 250만원 직원 한 명, 회사는 실제로 얼마를 쓰나</h2>
  <p>월급 ${won(o.pay)}원(식대 비과세 ${won(o.taxFree)}원 포함), 150인 미만 사업장, 산재보험 평균 요율 기준입니다.</p>
${table(['항목', '직원이 내는 돈', '회사가 내는 돈'], base.rows.map(r => [r.label, r.worker ? won(r.worker) + '원' : '–', won(r.employer) + '원'])
    .concat([['합계', '<strong>' + won(base.workerTotal) + '원</strong>', '<strong>' + won(base.employerTotal) + '원</strong>']]))}
  <p>직원 통장에서 ${won(base.workerTotal)}원이 빠지고, 회사는 월급과 별도로 ${won(base.employerTotal)}원을 더 냅니다. 이 직원 한 명에게 회사가 쓰는 돈은 한 달에 <strong>${won(base.laborCost)}원</strong>, 월급의 ${(100 + base.burdenRate * 100).toFixed(1)}%입니다.</p>
  <h3>60세 이상이거나 월 60시간 미만이면</h3>
${table(['경우', '직원 부담', '회사 부담', '회사 총 인건비'], cases.map(([k, x]) => [k, won(x.workerTotal) + '원', won(x.employerTotal) + '원', won(x.laborCost) + '원']))}
  <p>60세 이상이면 국민연금이 빠지고, 월 60시간 미만이면 국민연금과 건강보험·장기요양이 함께 빠집니다. 고용보험과 산재보험은 그대로 남습니다.</p>
` };
}

// ───────────────────────── 대출 ─────────────────────────
function loanBlocks() {
  const E = engine('finance2026.js', ['loanSchedule', 'won']);
  const won = E.won;
  const rs = [3.5, 4.0, 4.5, 5.0].map(r => ({ r, s: E.loanSchedule(300000000, r, 360, 'equal', 0) }));
  return { 'loan-extra': `
  <h2>금리 0.5%p가 30년 동안 만드는 차이</h2>
  <p>3억원을 30년 원리금균등으로 빌렸을 때 금리별 월 상환액과 총이자입니다.</p>
${table(['금리', '월 상환액', '총이자', '갚는 돈 합계'], rs.map(x => [x.r.toFixed(1) + '%', won(x.s.equalPayment) + '원', won(x.s.totalInterest) + '원', won(x.s.totalPayment) + '원']))}
  <p>4.0%와 4.5%는 월 상환액으로 보면 ${won(rs[2].s.equalPayment - rs[1].s.equalPayment)}원 차이지만, 30년을 모으면 총이자가 <strong>${won(rs[2].s.totalInterest - rs[1].s.totalInterest)}원</strong> 벌어집니다. 금리 0.5%p를 깎는 협상이나 갈아타기가 생각보다 큰돈이 되는 이유입니다. 3.5%와 5.0% 사이의 총이자 차이는 ${won(rs[3].s.totalInterest - rs[0].s.totalInterest)}원입니다.</p>
` };
}

// ───────────────────────── 전월세 ─────────────────────────
function rentBlocks() {
  const E = engine('finance2026.js', ['FINANCE', 'legalConversionRate', 'jeonseToMonthly', 'monthlyToJeonse', 'won', 'bigWon']);
  const won = E.won, big = E.bigWon, legal = E.legalConversionRate();
  const rates = [4, legal, 6];
  const cv = E.monthlyToJeonse(100000000, 1000000, legal);
  return { 'rent-extra': `
  <h2>보증금을 얼마나 낮추면 월세가 얼마나 붙나</h2>
  <p>전세 보증금에서 낮추는 금액과 전환율에 따른 월세입니다. 가운데 열이 지금 법정 상한(기준금리 ${E.FINANCE.baseRate}% + ${E.FINANCE.rentSpread}% = 연 ${legal}%)입니다.</p>
${table(['낮추는 보증금'].concat(rates.map(r => '전환율 ' + r + '%')),
    [50000000, 100000000, 200000000, 300000000].map(g => [big(g)].concat(rates.map(r => won(E.jeonseToMonthly(g, 0, r).monthly) + '원'))))}
  <p>보증금 1억원을 월세로 돌리면 법정 상한 기준으로 월 ${won(E.jeonseToMonthly(100000000, 0, legal).monthly)}원입니다. 집주인이 이보다 많이 요구하면 전환율이 상한을 넘는 것인지 먼저 계산해 보세요. 다만 상한은 계약 기간 중 전환하거나 갱신할 때 적용되고, 신규 계약에는 적용되지 않습니다.</p>
  <h3>반대로, 지금 월세는 전세로 치면 얼마일까</h3>
  <p>보증금 1억원에 월세 100만원인 집은 연 ${legal}% 기준으로 월세를 보증금 ${big(cv.converted)}으로 환산할 수 있습니다. 전세로 치면 <strong>${big(cv.jeonse)}</strong>짜리 집과 같은 조건입니다. 비슷한 전세 매물과 비교할 때 이 숫자를 기준으로 보면 됩니다.</p>
` };
}

// ───────────────────────── 평수 ─────────────────────────
function areaBlocks() {
  const E = engine('finance2026.js', ['m2ToPyeong']);
  return { 'area-extra': `
  <h2>매물에 자주 나오는 전용면적, 평으로는</h2>
  <p>아파트 매물에는 전용면적이 제곱미터로 적힙니다. 자주 보이는 크기를 평으로 바꾸면 이렇습니다. 1평 = 400/121㎡(약 3.3058㎡)로 계산했습니다.</p>
${table(['전용면적', '평 (정확한 값)', '3.3으로 나눈 어림값'], [39, 49, 59, 74, 84, 101, 114, 135].map(m => [m + '㎡', E.m2ToPyeong(m).toFixed(1) + '평', (m / 3.3).toFixed(1) + '평']))}
  <p>3.3으로 나누는 어림셈은 정확한 값보다 조금 크게 나옵니다. 작은 면적에서는 거의 같지만, 계약서처럼 숫자가 정확해야 할 때는 3.3058로 나누세요. 위 표의 평은 전용면적 기준이라, 흔히 말하는 공급면적 평형(예: 84㎡ = 34평형)보다 작습니다.</p>
` };
}

// ───────────────────────── 실행 ─────────────────────────
const PAGES = {
  'annual-leave': {
    file: 'annual-leave.html',
    fill: ['live', 'sub', 'r-tenure', 'r-month', 'r-year', 'r-total', 'r-dead', 'r-used', 'r-left', 'r-daily', 'r-allow', 'timeline'],
    blocks: leaveBlocks,
  },
  margin: {
    file: 'margin.html',
    fill: ['profit', 'sub', 'flow', 'vat', 'vatNote', 'r-be', 'target'],
    blocks: marginBlocks,
  },
  hourly: { file: 'hourly.html', blocks: hourlyBlocks,
    fill: ['cmp', 'holiday', 'r-month', 'r-monthhol', 'r-monthwork', 'r-week', 'r-weekhol', 'r-weekwork', 'r-year', 'sub'] },
  severance: { file: 'severance.html', blocks: severanceBlocks,
    fill: ['amount', 'cmp', 'r-amount', 'r-daily', 'r-days', 'r-local', 'r-net', 'r-period', 'r-rate', 'r-tax', 'r-years', 'sub'] },
  insurance: { file: 'insurance.html', blocks: insuranceBlocks,
    fill: ['cmp', 'cost', 'costSub', 'r-ded', 'r-gross', 'r-net', 'rowNote', 'rows', 'tot'] },
  loan: { file: 'loan.html', blocks: loanBlocks,
    fill: ['cap', 'cmp', 'payment', 'r-first', 'r-grace', 'r-interest', 'r-last', 'r-principal', 'r-total', 'sched', 'sub'] },
  rent: { file: 'rent.html', blocks: rentBlocks,
    fill: ['cap', 'cmp', 'out', 'r-deposit', 'r-gap', 'r-jeonse', 'r-legal', 'r-out', 'r-outlabel', 'r-rate', 'sub'] },
  area: { file: 'area.html', blocks: areaBlocks, fill: ['cmp', 'out'] },
};

const only = process.argv[2];
for (const [name, p] of Object.entries(PAGES)) {
  if (only && only !== name) continue;
  const file = path.join(SITE, p.file);
  let html = fs.readFileSync(file, 'utf8');
  for (const [k, v] of Object.entries(p.blocks())) html = setBlock(html, k, v);
  if (html.includes('<!-- PRE:date:START -->')) html = setBlock(html, 'date', new Date().toISOString().slice(0, 10));
  fs.writeFileSync(file, html, 'utf8');

  // 고유 섹션을 넣은 뒤에 렌더링해야 렌더 결과에 같은 HTML이 담긴다
  const dom = renderDom(p.file);
  for (const id of p.fill) {
    const r = innerRange(dom, id);
    if (!r) throw new Error(`${p.file}: 렌더 결과에 id="${id}" 가 없습니다`);
    html = setInner(html, id, dom.slice(r[0], r[1]));
  }
  fs.writeFileSync(file, html, 'utf8');
  console.log(`${p.file} 갱신 — ${p.fill.length}칸 채움, 섹션 ${Object.keys(p.blocks()).length}개`);
}

// salary.html 의 숫자를 정적 HTML로 미리 채웁니다. 모델 호출이 없으므로 비용은 0원입니다.
//
//   node prerender-salary.mjs
//
// 계산기는 원래 자바스크립트가 숫자를 채우기 때문에, 구글이 처음 받는 HTML에는
// 결과·표가 전부 '–' 로 비어 있었습니다. 같은 계산 엔진(site/assets/tax2026.js)으로
// 기본값 결과, 연봉별 표, 계산 예시, 작년 대비 표를 미리 계산해 넣습니다.
// 요율을 바꾼 뒤에는 이 스크립트를 다시 돌리면 됩니다. 여러 번 돌려도 결과는 같습니다.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = path.join(ROOT, 'site', 'salary.html');
const ENGINE = path.join(ROOT, 'site', 'assets', 'tax2026.js');

// 브라우저와 같은 엔진을 그대로 불러온다 (const 는 vm 전역에 안 붙으므로 끝에서 꺼낸다)
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(ENGINE, 'utf8') + '\n;globalThis.__e = { RATES, calcNetPay, won, man };', ctx);
const { RATES, calcNetPay, won, man } = ctx.__e;

// 기본 입력값 (페이지 입력칸 기본값과 같아야 한다)
const DEFAULT = { annualMan: 4000, taxFree: 200000, dep: 1 };

// 작년 같은 기간(2025년 7~12월) 4대보험 요율. 값은 pipeline/facts.json 의 '낡은값'과 같다.
const RATES_2025H2 = {
  pension: { worker: 0.045, min: 400000, max: 6370000 },
  health: { worker: 0.03545 },
  ltc: { rate: 0.1295 },
};

const pct = (r, d = 3) => +(r * 100).toFixed(d) + '%';
const raw = n => (Math.round(n * 100) / 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 });

function withRates(over, fn) {
  const saved = JSON.parse(JSON.stringify({ pension: RATES.pension, health: RATES.health, ltc: RATES.ltc }));
  Object.assign(RATES.pension, over.pension); Object.assign(RATES.health, over.health); Object.assign(RATES.ltc, over.ltc);
  try { return fn(); } finally { Object.assign(RATES.pension, saved.pension); Object.assign(RATES.health, saved.health); Object.assign(RATES.ltc, saved.ltc); }
}

// ── 1. 결과 카드·공제 내역 기본값 ─────────────────────────────
const r = calcNetPay(DEFAULT.annualMan * 10000, DEFAULT.taxFree, DEFAULT.dep, false);
const fills = {
  net: won(r.net) + '원',
  sub: `연 실수령 ${man(r.netYear)}만원 · 월 공제 ${won(r.totalDeduction)}원`,
  'r-gross': won(r.grossMonth) + '원', 'r-taxable': won(r.taxableMonth) + '원', 'r-free': won(r.taxFree) + '원',
  'r-pension': '-' + won(r.pension) + '원', 'r-health': '-' + won(r.health) + '원', 'r-ltc': '-' + won(r.ltc) + '원',
  'r-employ': '-' + won(r.employ) + '원', 'r-income': '-' + won(r.incomeTax) + '원', 'r-local': '-' + won(r.localTax) + '원',
  'r-total': '-' + won(r.totalDeduction) + '원', 'r-net': won(r.net) + '원',
  'r-netyear': won(r.netYear) + '원', 'r-rate': (r.totalDeduction / r.grossMonth * 100).toFixed(1) + '%',
};

// ── 2. 연봉별 표 (페이지 스크립트의 buildTable 과 같은 구간) ──────
const tableRows = [];
for (let m = 2400; m <= 12000; m += (m < 6000 ? 200 : 500)) {
  const x = calcNetPay(m * 10000, 200000, 1, false);
  tableRows.push(`<tr class="${m === DEFAULT.annualMan ? 'hi' : ''}">
        <td>${m.toLocaleString()}만원</td>
        <td>${won(x.net)}원</td>
        <td>${won(x.totalDeduction)}원</td>
        <td>${man(x.netYear)}만원</td></tr>`);
}

// ── 3. 계산 예시: 기본값을 한 줄씩 ──────────────────────────
function exampleHtml() {
  const d = r.detail, annual = DEFAULT.annualMan * 10000;
  const pBase = Math.min(Math.max(Math.floor(r.taxableMonth / 1000) * 1000, RATES.pension.min), RATES.pension.max);
  const g = d.taxableYear;
  const eiFormula =
    g <= 5000000 ? `총급여 × 70%` :
    g <= 15000000 ? `350만원 + (총급여 − 500만원) × 40%` :
    g <= 45000000 ? `750만원 + (총급여 − 1,500만원) × 15%` :
    g <= 100000000 ? `1,200만원 + (총급여 − 4,500만원) × 5%` : `1,475만원 + (총급여 − 1억원) × 2%`;
  const br = RATES.brackets.find(([cap]) => d.taxBase <= cap);
  const ins = r.pension + r.health + r.ltc + r.employ;
  const row = (k, f, v) => `      <tr><th>${k}</th><td class="f">${f}</td><td>${v}</td></tr>`;
  return `
  <h2>예시: 연봉 ${DEFAULT.annualMan.toLocaleString()}만원을 한 줄씩 따라가 보면</h2>
  <p>위 계산기의 기본값(연봉 ${DEFAULT.annualMan.toLocaleString()}만원 · 식대 비과세 ${(DEFAULT.taxFree / 10000)}만원 · 부양가족 본인 1명 · 퇴직금 별도)이 실제로 어떻게 계산되는지 모든 단계를 숫자로 적었습니다. 표의 숫자는 계산기와 같은 계산식으로 만든 것입니다.</p>
  <h3>매달 떼는 4대보험</h3>
  <div class="card scroll">
    <table class="cmp">
      <thead><tr><th>항목</th><th>계산</th><th>금액</th></tr></thead>
      <tbody>
${row('월 급여', `${won(annual)} ÷ 12 → 10원 단위 반올림`, won(r.grossMonth) + '원')}
${row('과세 대상', `${won(r.grossMonth)} − 비과세 ${won(r.taxFree)}`, won(r.taxableMonth) + '원')}
${row('국민연금', `${won(pBase)} (천원 미만 버림) × ${pct(RATES.pension.worker)} = ${raw(pBase * RATES.pension.worker)}`, won(r.pension) + '원')}
${row('건강보험', `${won(r.taxableMonth)} × ${pct(RATES.health.worker)} = ${raw(r.taxableMonth * RATES.health.worker)}`, won(r.health) + '원')}
${row('장기요양', `건강보험료 ${won(r.health)} × ${pct(RATES.ltc.rate, 2)} = ${raw(r.health * RATES.ltc.rate)}`, won(r.ltc) + '원')}
${row('고용보험', `${won(r.taxableMonth)} × ${pct(RATES.employ.worker, 1)} = ${raw(r.taxableMonth * RATES.employ.worker)}`, won(r.employ) + '원')}
${row('4대보험 합계', '보험료는 모두 10원 미만을 버림', won(ins) + '원')}
      </tbody>
    </table>
  </div>
  <h3>소득세 (1년치를 계산한 뒤 12로 나눔)</h3>
  <div class="card scroll">
    <table class="cmp">
      <thead><tr><th>단계</th><th>계산</th><th>금액</th></tr></thead>
      <tbody>
${row('총급여', `과세 대상 ${won(r.taxableMonth)} × 12`, won(g) + '원')}
${row('근로소득공제', eiFormula, '−' + won(d.eiDeduction) + '원')}
${row('인적공제', `150만원 × ${DEFAULT.dep}명`, '−' + won(d.personal) + '원')}
${row('보험료 공제', `4대보험 ${won(ins)} × 12`, '−' + won(d.insuranceDed) + '원')}
${row('과세표준', '총급여에서 위 공제를 뺀 금액', won(d.taxBase) + '원')}
${row('산출세액', `${won(d.taxBase)} × ${pct(br[1], 0)} − 누진공제 ${won(br[2])}`, won(d.calcTax) + '원')}
${row('근로소득세액공제', '산출세액에 비례, 총급여에 따라 한도 있음', '−' + won(d.credit) + '원')}
${row('결정세액 (연)', '산출세액 − 세액공제', won(d.finalTax) + '원')}
${row('월 소득세', `${won(d.finalTax)} ÷ 12 → 10원 미만 버림`, won(r.incomeTax) + '원')}
${row('월 지방소득세', `소득세 × 10%`, won(r.localTax) + '원')}
      </tbody>
    </table>
  </div>
  <p>정리하면 월 급여 ${won(r.grossMonth)}원에서 4대보험 ${won(ins)}원과 세금 ${won(r.incomeTax + r.localTax)}원을 뺀 <strong>${won(r.net)}원</strong>이 통장에 들어옵니다. 공제되는 돈의 ${Math.round(ins / r.totalDeduction * 100)}%가 세금이 아니라 4대보험입니다.</p>
`;
}

// ── 4. 작년 같은 기간 대비 4대보험 ─────────────────────────
function yoyHtml() {
  const ins = x => x.pension + x.health + x.ltc + x.employ;
  const salaries = [3000, 4000, 5000, 7000, 10000];
  const label = m => m >= 10000 ? `${m / 10000}억원` : `${m.toLocaleString()}만원`;
  const rows = salaries.map(m => {
    const now = calcNetPay(m * 10000, 200000, 1, false);
    const prev = withRates(RATES_2025H2, () => calcNetPay(m * 10000, 200000, 1, false));
    const a = ins(prev), b = ins(now);
    return { m, a, b, diff: b - a, pPrev: prev.pension, pNow: now.pension };
  });
  const top = rows[rows.length - 1];
  return `
  <h2>작년 이맘때보다 4대보험이 얼마나 늘었나</h2>
  <p>2026년에는 국민연금 요율(근로자 ${pct(RATES_2025H2.pension.worker, 2)} → ${pct(RATES.pension.worker, 2)})과 건강보험 요율(${pct(RATES_2025H2.health.worker)} → ${pct(RATES.health.worker)}), 장기요양 요율(건강보험료의 ${pct(RATES_2025H2.ltc.rate, 2)} → ${pct(RATES.ltc.rate, 2)})이 함께 올랐습니다. 국민연금 기준소득월액 상한도 ${man(RATES_2025H2.pension.max)}만원에서 ${man(RATES.pension.max)}만원으로 올랐습니다. 같은 연봉이라도 매달 떼는 4대보험이 이만큼 늘었습니다.</p>
  <div class="card scroll">
    <table class="cmp">
      <thead><tr><th>연봉</th><th>2025년 7~12월</th><th>2026년 7월~</th><th>월 증가액</th></tr></thead>
      <tbody>
${rows.map(x => `        <tr><td>${label(x.m)}</td><td>${won(x.a)}원</td><td>${won(x.b)}원</td><td>+${won(x.diff)}원</td></tr>`).join('\n')}
      </tbody>
    </table>
  </div>
  <p class="lead" style="font-size:.9em">비과세 20만원 · 부양가족 1명 기준, 근로자 부담분입니다. 고용보험(0.9%)은 바뀌지 않았습니다. 4대보험이 늘면 그만큼 소득세 과세표준이 줄어 세금은 아주 조금 줄어듭니다. 이 표에는 그 효과를 넣지 않았습니다.</p>
  <p>연봉 ${label(top.m)}처럼 국민연금 상한에 걸리는 구간은 요율과 상한이 함께 올라 증가 폭이 큽니다. 국민연금만 월 ${won(top.pPrev)}원에서 ${won(top.pNow)}원으로 늘었습니다.</p>
`;
}

// ── 적용 ─────────────────────────────────────────────────
let html = fs.readFileSync(PAGE, 'utf8');
const block = (name, body) => {
  const re = new RegExp(`(<!-- PRE:${name}:START -->)[\\s\\S]*?(<!-- PRE:${name}:END -->)`);
  if (!re.test(html)) throw new Error(`salary.html 에 PRE:${name} 표시가 없습니다`);
  html = html.replace(re, `$1${body}$2`);
};
for (const [id, v] of Object.entries(fills)) {
  const re = new RegExp(`(id="${id}">)[^<]*(<)`);
  if (!re.test(html)) throw new Error(`id="${id}" 를 못 찾았습니다`);
  html = html.replace(re, `$1${v}$2`);
}
html = html.replace(/(<tbody id="cmp">)[\s\S]*?(<\/tbody>)/, `$1\n${tableRows.join('\n')}\n      $2`);
block('example', exampleHtml());
block('yoy', yoyHtml());
block('date', new Date().toISOString().slice(0, 10));

fs.writeFileSync(PAGE, html, 'utf8');
console.log(`salary.html 갱신 — 기본값 ${DEFAULT.annualMan}만원: 월 실수령 ${won(r.net)}원, 표 ${tableRows.length}행`);

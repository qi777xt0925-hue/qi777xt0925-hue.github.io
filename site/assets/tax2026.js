/* ─────────────────────────────────────────────────────────────
   2026년 기준 급여 공제 계산 엔진
   요율이 바뀌면 아래 RATES 객체만 고치면 사이트 전체가 반영됩니다.
   ───────────────────────────────────────────────────────────── */
const RATES = {
  year: 2026,
  // 국민연금: 총 9.5% (근로자 4.75%) · 기준소득월액 41만~659만 (2026.7~2027.6)
  pension:  { worker: 0.0475, total: 0.095, min: 410000, max: 6590000 },
  // 건강보험: 총 7.19% (근로자 3.595%)
  health:   { worker: 0.03595, total: 0.0719 },
  // 장기요양보험: 건강보험료의 12.95% (근로자·사업주 절반씩 → 근로자분 건강보험료 기준 동일 비율)
  ltc:      { rate: 0.1295 },
  // 고용보험(실업급여): 근로자 0.9%
  employ:   { worker: 0.009 },
  // 소득세 과세표준 구간: [상한, 세율, 누진공제]
  brackets: [
    [ 14000000, 0.06,        0],
    [ 50000000, 0.15,  1260000],
    [ 88000000, 0.24,  5760000],
    [150000000, 0.35, 15440000],
    [300000000, 0.38, 19940000],
    [500000000, 0.40, 25940000],
    [1000000000,0.42, 35940000],
    [Infinity,  0.45, 65940000]
  ],
  localTaxRate: 0.10,      // 지방소득세 = 소득세의 10%
  personalDeduction: 1500000  // 인적공제 1인당 150만원
};

/* 근로소득공제 (연 2,000만원 한도) */
function earnedIncomeDeduction(gross){
  let d;
  if      (gross <=   5000000) d = gross * 0.7;
  else if (gross <=  15000000) d =  3500000 + (gross -   5000000) * 0.4;
  else if (gross <=  45000000) d =  7500000 + (gross -  15000000) * 0.15;
  else if (gross <= 100000000) d = 12000000 + (gross -  45000000) * 0.05;
  else                         d = 14750000 + (gross - 100000000) * 0.02;
  return Math.min(d, 20000000);
}

/* 산출세액 (누진세율) */
function progressiveTax(base){
  if (base <= 0) return 0;
  for (const [cap, rate, sub] of RATES.brackets){
    if (base <= cap) return base * rate - sub;
  }
  return 0;
}

/* 근로소득세액공제 */
function earnedIncomeTaxCredit(calcTax, gross){
  let credit = calcTax <= 1300000
    ? calcTax * 0.55
    : 715000 + (calcTax - 1300000) * 0.30;
  let cap;
  if      (gross <=  33000000) cap = 740000;
  else if (gross <=  70000000) cap = Math.max(740000 - (gross -  33000000) * 0.008, 660000);
  else if (gross <= 120000000) cap = Math.max(660000 - (gross -  70000000) * 0.5,   500000);
  else                         cap = Math.max(500000 - (gross - 120000000) * 0.5,   200000);
  return Math.min(credit, cap);
}

/**
 * 월 실수령액 계산
 * @param {number} annual        계약 연봉 (원)
 * @param {number} taxFreeMonth  월 비과세액 (식대 등, 원)
 * @param {number} dependents    본인 포함 공제대상 가족 수 (최소 1)
 * @param {boolean} severanceIncluded 연봉에 퇴직금이 포함되어 있는지
 */
function calcNetPay(annual, taxFreeMonth, dependents, severanceIncluded){
  // 퇴직금 포함 연봉이면 실제 연간 급여는 연봉 × 12/13
  const paidAnnual = severanceIncluded ? annual * 12 / 13 : annual;

  const grossMonth   = paidAnnual / 12;                       // 월 총지급액
  const taxFree      = Math.min(taxFreeMonth, grossMonth);    // 월 비과세
  const taxableMonth = Math.max(grossMonth - taxFree, 0);     // 월 과세소득
  const taxableYear  = taxableMonth * 12;                     // 연 과세급여(총급여)

  // ── 4대보험 (월) ──
  const pensionBase = Math.min(Math.max(taxableMonth, RATES.pension.min), RATES.pension.max);
  const pension = Math.floor(pensionBase * RATES.pension.worker / 10) * 10;
  const health  = Math.floor(taxableMonth * RATES.health.worker / 10) * 10;
  const ltc     = Math.floor(health * RATES.ltc.rate / 10) * 10;
  const employ  = Math.floor(taxableMonth * RATES.employ.worker / 10) * 10;

  // ── 소득세 (연간 정식 계산 후 ÷12) ──
  const eiDeduction   = earnedIncomeDeduction(taxableYear);
  const personal      = RATES.personalDeduction * Math.max(dependents, 1);
  const insuranceDed  = (pension + health + ltc + employ) * 12;   // 연금보험료공제 + 보험료공제
  const taxBase       = Math.max(taxableYear - eiDeduction - personal - insuranceDed, 0);
  const calcTax       = Math.max(progressiveTax(taxBase), 0);
  const credit        = earnedIncomeTaxCredit(calcTax, taxableYear);
  const finalTax      = Math.max(calcTax - credit, 0);

  const incomeTax = Math.floor(finalTax / 12 / 10) * 10;
  const localTax  = Math.floor(incomeTax * RATES.localTaxRate / 10) * 10;

  const totalDeduction = pension + health + ltc + employ + incomeTax + localTax;
  const net = grossMonth - totalDeduction;

  return {
    grossMonth, taxFree, taxableMonth,
    pension, health, ltc, employ, incomeTax, localTax,
    totalDeduction, net,
    netYear: net * 12,
    paidAnnual,
    detail: { taxableYear, eiDeduction, personal, insuranceDed, taxBase, calcTax, credit, finalTax }
  };
}

/* 표시 헬퍼 */
const won  = n => Math.round(n).toLocaleString('ko-KR');
const man  = n => (Math.round(n / 10000)).toLocaleString('ko-KR');

/* 숫자 입력칸에 천단위 콤마 자동 적용 */
function attachComma(input, onChange){
  const fmt = () => {
    const raw = input.value.replace(/[^0-9]/g, '');
    input.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
  };
  input.addEventListener('input', () => { fmt(); onChange && onChange(); });
  fmt();
}
function numOf(input){ return Number(String(input.value).replace(/[^0-9]/g, '')) || 0; }

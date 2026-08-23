/* ─────────────────────────────────────────────────────────────
   대출 상환 · 전월세 전환 · 면적 변환 엔진

   전월세 전환율 상한은 기준금리에 연동됩니다.
   기준금리가 바뀌면 아래 BASE_RATE 만 고치면 페이지 전체가 따라갑니다.

   tax2026.js / labor2026.js 와 나란히 쓰지 않습니다.
   한 페이지는 엔진 하나만 불러오며, 그래서 표시 헬퍼가 각 파일에 들어 있습니다.
   ───────────────────────────────────────────────────────────── */
const FINANCE = {
  year: 2026,
  baseRate: 2.5,        // 한국은행 기준금리 (%)
  rentSpread: 2.0,      // 주택임대차보호법 시행령이 정한 가산 이율 (%)
  pyeongToM2: 400 / 121 // 1평 = 3.3058㎡ (6자 × 6자)
};

/** 법정 전월세 전환율 상한 = 기준금리 + 시행령 이율 */
function legalConversionRate(){
  return FINANCE.baseRate + FINANCE.rentSpread;
}

/* ── 대출 상환 ───────────────────────────────────────────── */

/**
 * @param {number} principal 대출 원금
 * @param {number} annualRate 연이율 (%)
 * @param {number} months 총 상환 개월수
 * @param {string} kind 'equal'(원리금균등) | 'principal'(원금균등) | 'bullet'(만기일시)
 * @param {number} graceMonths 거치기간 (이자만 내는 개월수)
 */
function loanSchedule(principal, annualRate, months, kind, graceMonths){
  const r = annualRate / 100 / 12;
  const grace = Math.min(graceMonths || 0, months);
  const repayMonths = months - grace;
  const rows = [];
  let balance = principal;
  let totalInterest = 0;

  // 거치기간: 이자만 냅니다
  for (let i = 0; i < grace; i++){
    const interest = balance * r;
    totalInterest += interest;
    rows.push({ no: i + 1, payment: interest, principal: 0, interest: interest, balance: balance });
  }

  if (kind === 'bullet'){
    for (let i = 0; i < repayMonths; i++){
      const interest = balance * r;
      totalInterest += interest;
      const last = i === repayMonths - 1;
      rows.push({
        no: grace + i + 1,
        payment: interest + (last ? balance : 0),
        principal: last ? balance : 0,
        interest: interest,
        balance: last ? 0 : balance
      });
    }
    if (repayMonths > 0) balance = 0;
  } else if (kind === 'principal'){
    const monthlyPrincipal = repayMonths > 0 ? principal / repayMonths : 0;
    for (let i = 0; i < repayMonths; i++){
      const interest = balance * r;
      totalInterest += interest;
      balance -= monthlyPrincipal;
      rows.push({
        no: grace + i + 1,
        payment: monthlyPrincipal + interest,
        principal: monthlyPrincipal,
        interest: interest,
        balance: Math.max(balance, 0)
      });
    }
  } else {
    // 원리금균등: 매달 같은 금액을 냅니다
    const payment = r === 0
      ? (repayMonths > 0 ? principal / repayMonths : 0)
      : principal * r * Math.pow(1 + r, repayMonths) / (Math.pow(1 + r, repayMonths) - 1);
    for (let i = 0; i < repayMonths; i++){
      const interest = balance * r;
      const principalPart = payment - interest;
      totalInterest += interest;
      balance -= principalPart;
      rows.push({
        no: grace + i + 1,
        payment: payment,
        principal: principalPart,
        interest: interest,
        balance: Math.max(balance, 0)
      });
    }
  }

  const repayRows = rows.slice(grace);
  return {
    rows: rows,
    graceMonths: grace,
    gracepayment: grace > 0 ? rows[0].payment : 0,
    firstPayment: repayRows.length ? repayRows[0].payment : 0,
    lastPayment:  repayRows.length ? repayRows[repayRows.length - 1].payment : 0,
    equalPayment: kind === 'equal' && repayRows.length ? repayRows[0].payment : null,
    totalInterest: totalInterest,
    totalPayment: principal + totalInterest
  };
}

/* ── 전월세 전환 ─────────────────────────────────────────── */

/** 전세 → 월세: 낮출 보증금에 전환율을 적용해 월세를 구합니다 */
function jeonseToMonthly(deposit, newDeposit, rate){
  const gap = Math.max(deposit - newDeposit, 0);
  return {
    gap: gap,
    monthly: gap * (rate / 100) / 12
  };
}

/** 월세 → 전세: 월세를 보증금으로 환산해 더합니다 */
function monthlyToJeonse(deposit, monthly, rate){
  if (rate <= 0) return { converted: 0, jeonse: deposit };
  const converted = monthly * 12 / (rate / 100);
  return { converted: converted, jeonse: deposit + converted };
}

/** 지금 조건의 전환율이 몇 %인지 */
function currentConversionRate(jeonseDeposit, monthlyDeposit, monthly){
  const gap = jeonseDeposit - monthlyDeposit;
  if (gap <= 0) return null;
  return (monthly * 12) / gap * 100;
}

/* ── 면적 변환 ───────────────────────────────────────────── */
const pyeongToM2 = p => p * FINANCE.pyeongToM2;
const m2ToPyeong = m => m / FINANCE.pyeongToM2;

/* ── 표시 헬퍼 ───────────────────────────────────────────── */
const won = n => Math.round(n).toLocaleString('ko-KR');
const man = n => (Math.round(n / 10000)).toLocaleString('ko-KR');

/** 원 단위 금액을 "1억 2,340만원"처럼 읽기 쉽게 */
function bigWon(n){
  const v = Math.round(n);
  if (v === 0) return '0원';
  const eok = Math.floor(v / 100000000);
  const manPart = Math.round((v % 100000000) / 10000);
  const parts = [];
  if (eok) parts.push(eok + '억');
  if (manPart) parts.push(manPart.toLocaleString('ko-KR') + '만');
  if (!parts.length) return won(v) + '원';
  return parts.join(' ') + '원';
}

function attachComma(input, onChange){
  input.addEventListener('input', function(){
    const raw = String(input.value).replace(/[^0-9]/g, '');
    input.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    onChange();
  });
}

function numOf(input){ return Number(String(input.value).replace(/[^0-9]/g, '')) || 0; }

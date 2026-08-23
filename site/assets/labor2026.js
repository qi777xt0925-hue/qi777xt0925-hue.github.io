/* ─────────────────────────────────────────────────────────────
   2026년 기준 퇴직금 · 주휴수당 계산 엔진

   기준이 바뀌면 아래 LABOR 객체와 공제표만 고치면 됩니다.

   tax2026.js 와 나란히 쓰지 않습니다. 한 페이지는 엔진 하나만 불러오며,
   그래서 won/floor10 같은 표시 헬퍼가 양쪽에 각각 들어 있습니다.
   ───────────────────────────────────────────────────────────── */
const LABOR = {
  year: 2026,
  minWage: 10320,          // 2026년 최저시급
  monthlyHours: 209,       // 주40시간 + 주휴8시간, 월 4.345주 환산
  weeksPerMonth: 4.345,
  weeklyThreshold: 15,     // 주휴수당이 발생하는 최소 소정근로시간
  fullTimeWeekly: 40,      // 주휴수당 산정 상한
  // 퇴직소득세 과세표준 구간: [상한, 세율, 누진공제]
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
  localTaxRate: 0.10
};

function floor10(n){
  return Math.floor(Math.round(n * 1e6) / 1e6 / 10) * 10;
}

/* ── 주휴수당 ─────────────────────────────────────────────
   1주 소정근로시간이 15시간 이상이고 소정근로일을 개근하면 발생합니다.
   주 40시간을 넘는 부분은 산정에 넣지 않습니다. */
function weeklyHolidayPay(weeklyHours, hourlyWage){
  if (weeklyHours < LABOR.weeklyThreshold){
    return { eligible:false, reason:'주 소정근로시간 15시간 미만', hours:0, weekly:0, monthly:0, yearly:0 };
  }
  const counted = Math.min(weeklyHours, LABOR.fullTimeWeekly);
  const hours = counted / LABOR.fullTimeWeekly * 8;
  // 월 환산은 주 시간을 먼저 월 시간으로 반올림한 뒤 시급을 곱합니다.
  // 주급에 4.345를 곱하면 공표된 월 환산액(시급 × 209시간)과 몇천원 어긋납니다.
  const monthlyHours = Math.round(hours * LABOR.weeksPerMonth);
  return {
    eligible: true,
    hours,
    monthlyHours,
    weekly:  floor10(hours * hourlyWage),
    monthly: floor10(monthlyHours * hourlyWage),
    yearly:  floor10(hours * 52 * hourlyWage)
  };
}

/* 주휴수당을 포함한 급여 전체 */
function wageWithHoliday(weeklyHours, hourlyWage){
  const hol = weeklyHolidayPay(weeklyHours, hourlyWage);
  const workMonthlyHours = Math.round(weeklyHours * LABOR.weeksPerMonth);
  const totalHours = workMonthlyHours + (hol.monthlyHours || 0);
  return {
    holiday: hol,
    workWeekly:   floor10(weeklyHours * hourlyWage),
    workMonthly:  floor10(workMonthlyHours * hourlyWage),
    monthlyHours: totalHours,
    totalWeekly:  floor10(weeklyHours * hourlyWage) + hol.weekly,
    totalMonthly: floor10(totalHours * hourlyWage),
    belowMinWage: hourlyWage < LABOR.minWage
  };
}

/* ── 퇴직금 ───────────────────────────────────────────────
   퇴직금 = 1일 평균임금 × 30 × (재직일수 ÷ 365)
   평균임금 = 퇴직일 이전 3개월 임금총액 ÷ 그 기간의 총일수
   연간 상여금과 연차수당은 3/12 만큼 평균임금에 가산합니다. */
function severancePay(o){
  const days = o.days;
  if (days < 365){
    return { eligible:false, reason:'계속근로 1년 미만', amount:0, days:days };
  }
  const periodDays = o.periodDays || 91;
  const threeMonthPay = o.monthlyPay * 3 + (o.annualBonus || 0) * 3 / 12 + (o.annualLeave || 0) * 3 / 12;
  const dailyAverage = threeMonthPay / periodDays;

  // 통상일급은 참고용으로만 함께 돌려줍니다.
  //
  // 근로기준법은 평균임금이 통상임금보다 적으면 통상임금을 쓰도록 하지만,
  // 통상일급(월급÷209×8)은 8시간분 임금이고 평균일급은 달력 일수로 나눈 값이라
  // 월급제 근로자는 늘 통상일급이 높게 나옵니다. 이걸 그대로 적용하면
  // 퇴직금이 "1년에 한 달치"보다 16%쯤 부풀어 실제와 어긋납니다.
  // 그래서 자동 대체는 하지 않고, 무급휴직 등으로 평균임금이 깎인 경우에만
  // 확인하도록 화면에 안내합니다.
  const ordinaryDaily = o.monthlyPay / LABOR.monthlyHours * 8;

  return {
    eligible: true,
    days,
    periodDays,
    dailyAverage: Math.round(dailyAverage),
    ordinaryDaily: Math.round(ordinaryDaily),
    amount: Math.round(dailyAverage * 30 * days / 365)
  };
}

/* ── 퇴직소득세 ───────────────────────────────────────────
   국세청 계산 순서를 그대로 따릅니다.
   근속연수는 1년 미만 기간을 1년으로 봅니다. */
function serviceYearDeduction(years){
  if (years <= 5)  return years * 1000000;
  if (years <= 10) return 5000000  + (years - 5)  * 2000000;
  if (years <= 20) return 15000000 + (years - 10) * 2500000;
  return 40000000 + (years - 20) * 3000000;
}

function convertedDeduction(converted){
  if (converted <= 8000000)   return converted;
  if (converted <= 70000000)  return 8000000   + (converted - 8000000)   * 0.60;
  if (converted <= 100000000) return 45200000  + (converted - 70000000)  * 0.55;
  if (converted <= 300000000) return 61700000  + (converted - 100000000) * 0.45;
  return 151700000 + (converted - 300000000) * 0.35;
}

function progressiveTax(base){
  if (base <= 0) return 0;
  for (var i = 0; i < LABOR.brackets.length; i++){
    var b = LABOR.brackets[i];
    if (base <= b[0]) return base * b[1] - b[2];
  }
  return 0;
}

function retirementTax(severance, days){
  const years = Math.max(Math.ceil(days / 365), 1);
  const yearDed = serviceYearDeduction(years);
  const afterYearDed = Math.max(severance - yearDed, 0);

  if (afterYearDed === 0){
    return { years, yearDed, converted:0, convDed:0, taxBase:0, incomeTax:0, localTax:0, total:0, net:severance };
  }

  const converted = afterYearDed * 12 / years;
  const convDed   = convertedDeduction(converted);
  const taxBase   = Math.max(converted - convDed, 0);
  const calcTax   = Math.max(progressiveTax(taxBase), 0);

  const incomeTax = floor10(calcTax / 12 * years);
  const localTax  = floor10(incomeTax * LABOR.localTaxRate);

  return {
    years, yearDed,
    converted: Math.round(converted),
    convDed:   Math.round(convDed),
    taxBase:   Math.round(taxBase),
    incomeTax, localTax,
    total: incomeTax + localTax,
    net:   severance - incomeTax - localTax,
    effectiveRate: (incomeTax + localTax) / severance
  };
}

/* ── 날짜 헬퍼 ───────────────────────────────────────────── */
const DAY = 86400000;

/** 두 날짜 사이의 일수 */
function daysBetween(from, to){
  return Math.round((to - from) / DAY);
}

/** 퇴직일 이전 3개월의 실제 일수 (평균임금 산정기간) */
function averagePeriodDays(leaveDate){
  const start = new Date(leaveDate.getTime());
  start.setMonth(start.getMonth() - 3);
  return daysBetween(start, leaveDate);
}

/* ── 표시 헬퍼 ───────────────────────────────────────────── */
const won = n => Math.round(n).toLocaleString('ko-KR');
const man = n => (Math.round(n / 10000)).toLocaleString('ko-KR');

/** 입력창에 천단위 콤마를 붙이며 값이 바뀔 때마다 콜백 */
function attachComma(input, onChange){
  input.addEventListener('input', function(){
    const raw = String(input.value).replace(/[^0-9]/g, '');
    input.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    onChange();
  });
}

function numOf(input){ return Number(String(input.value).replace(/[^0-9]/g, '')) || 0; }

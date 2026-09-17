/* ─────────────────────────────────────────────────────────────
   연차유급휴가 계산 엔진 — 근로기준법 제60조

   요율이 아니라 법 조문을 따르므로 해마다 바뀌지 않습니다.
   조문이 개정되면 RULE 객체와 daysForYear() 만 고치면 됩니다.

   다른 엔진과 나란히 쓰지 않습니다. 한 페이지는 엔진 하나만 부르며,
   그래서 won/attachComma 같은 표시 헬퍼가 각 파일에 따로 들어 있습니다.
   ───────────────────────────────────────────────────────────── */
const RULE = {
  base: 15,            // 1년 이상 · 출근율 80% 이상이면 15일
  monthlyCap: 11,      // 1년 미만 기간에 월 1일씩, 최대 11일
  bonusEvery: 2,       // 3년 이상이면 매 2년에 1일 가산
  cap: 25,             // 가산 한도
  monthlyHours: 209    // 통상일급 환산 기준 (주 40시간 + 주휴)
};

/**
 * 계속근로 y년이 되는 날 발생하는 연차 일수.
 *   1~2년 → 15일, 3~4년 → 16일, 5~6년 → 17일 … 21년 이상 → 25일
 */
function daysForYear(y){
  if (y < 1) return 0;
  const bonus = Math.floor((y - 1) / RULE.bonusEvery);
  return Math.min(RULE.base + bonus, RULE.cap);
}

/* ── 날짜 헬퍼 ───────────────────────────────────────────── */
const DAY = 86400000;

function addMonths(d, n){
  const r = new Date(d.getTime());
  const day = r.getDate();
  r.setMonth(r.getMonth() + n);
  // 1/31 + 1개월이 3/3으로 넘어가는 것을 막고 말일로 맞춥니다.
  if (r.getDate() !== day) r.setDate(0);
  return r;
}

function addYears(d, n){
  return addMonths(d, n * 12);
}

function daysBetween(a, b){
  return Math.round((b - a) / DAY);
}

function ymd(d){
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + dd;
}

function ko(d){
  return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
}

/**
 * 입사일 기준으로 기준일까지 발생한 연차를 모두 모읍니다.
 *
 * @param {Date} hire 입사일
 * @param {Date} asOf 기준일 (오늘 또는 퇴사일)
 * @returns {{items:Array, total:number, months:number, years:number, tenureDays:number}}
 */
function accrue(hire, asOf){
  const items = [];
  if (!(hire instanceof Date) || isNaN(hire) || !(asOf instanceof Date) || isNaN(asOf) || asOf < hire){
    return { items, total: 0, months: 0, years: 0, tenureDays: 0, valid: false };
  }

  const tenureDays = daysBetween(hire, asOf);
  const firstAnniv = addYears(hire, 1);

  // ── 1년 미만: 1개월 개근마다 1일 (최대 11일) ──────────────
  // 사용기한은 개정 근로기준법에 따라 모두 입사 1주년까지입니다.
  let months = 0;
  for (let m = 1; m <= RULE.monthlyCap; m++){
    const on = addMonths(hire, m);
    if (on > asOf) break;
    months++;
    items.push({
      kind: 'month',
      on: on,
      days: 1,
      expire: firstAnniv,
      label: '입사 ' + m + '개월'
    });
  }

  // ── 1년 이상: 매 주년마다 15일 + 가산 ────────────────────
  let years = 0;
  for (let y = 1; y <= 60; y++){
    const on = addYears(hire, y);
    if (on > asOf) break;
    years = y;
    items.push({
      kind: 'year',
      on: on,
      days: daysForYear(y),
      expire: addYears(hire, y + 1),
      label: '만 ' + y + '년'
    });
  }

  const total = items.reduce((s, i) => s + i.days, 0);
  return { items, total, months, years, tenureDays, valid: true, firstAnniv };
}

/**
 * 기준일 현재 아직 살아 있는(사용기한이 지나지 않은) 연차만 추립니다.
 * 소멸한 연차는 수당 청구 대상이 될 수 있어 따로 돌려줍니다.
 */
function alive(result, asOf){
  const live = result.items.filter(i => i.expire > asOf);
  const dead = result.items.filter(i => i.expire <= asOf);
  return {
    live,
    dead,
    liveDays: live.reduce((s, i) => s + i.days, 0),
    deadDays: dead.reduce((s, i) => s + i.days, 0)
  };
}

/** 1일 통상임금 = 월 통상임금 ÷ 209 × 8 */
function dailyOrdinary(monthlyPay){
  return monthlyPay / RULE.monthlyHours * 8;
}

/** 미사용 연차수당 */
function leaveAllowance(unusedDays, monthlyPay){
  const daily = dailyOrdinary(monthlyPay);
  return { daily: Math.round(daily), amount: Math.round(daily * unusedDays) };
}

/**
 * 회계연도(1월 1일) 기준으로 부여하는 회사를 위한 참고 계산입니다.
 * 법정 기준이 아니라 취업규칙으로 정하는 방식이라, 퇴사 시점에
 * 입사일 기준보다 적으면 그 차액을 채워 주어야 합니다.
 */
function fiscalFirstYear(hire){
  const yearEnd = new Date(hire.getFullYear(), 11, 31);
  const worked = daysBetween(hire, yearEnd) + 1;
  return {
    worked,
    days: Math.round(RULE.base * worked / 365 * 10) / 10,
    grantOn: new Date(hire.getFullYear() + 1, 0, 1)
  };
}

/* ── 표시 헬퍼 ───────────────────────────────────────────── */
const won = n => Math.round(n).toLocaleString('ko-KR');

function attachComma(input, onChange){
  input.addEventListener('input', function(){
    const raw = String(input.value).replace(/[^0-9]/g, '');
    input.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    onChange();
  });
}

function numOf(input){ return Number(String(input.value).replace(/[^0-9]/g, '')) || 0; }

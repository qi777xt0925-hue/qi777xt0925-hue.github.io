/* ─────────────────────────────────────────────────────────────
   2026년 기준 4대보험 계산 엔진 — 근로자 공제분과 사업주 부담분

   tax2026.js 는 "연봉에서 얼마가 빠지나"(근로자 시점)를 봅니다.
   이 파일은 "한 명 쓰면 회사가 얼마를 내나"(사업주 시점)까지 봅니다.

   요율이 바뀌면 아래 INS 객체만 고치면 페이지 전체가 따라갑니다.
   pipeline/facts.json 의 '현재요율' 항목과 값을 맞춰 두세요.

   다른 엔진과 나란히 쓰지 않습니다. 한 페이지는 엔진 하나만 부르며,
   그래서 won/floor10 같은 표시 헬퍼가 각 파일에 따로 들어 있습니다.
   ───────────────────────────────────────────────────────────── */
const INS = {
  year: 2026,

  // 국민연금 — 총 9.5%를 근로자·사업주가 절반씩.
  // 기준소득월액은 천원 미만을 버린 뒤 상·하한을 적용합니다.
  pension: { worker: 0.0475, employer: 0.0475, min: 410000, max: 6590000 },

  // 건강보험 — 총 7.19%를 절반씩.
  health: { worker: 0.03595, employer: 0.03595 },

  // 장기요양보험 — 건강보험료에 곱합니다(보수월액이 아닙니다).
  ltc: { rate: 0.1314 },

  // 고용보험 실업급여분 — 근로자·사업주 각 0.9%.
  employ: { worker: 0.009, employer: 0.009 },

  // 고용안정·직업능력개발사업분 — 사업주만 냅니다. 사업장 규모로 갈립니다.
  stability: [
    { id: 'u150',  label: '150인 미만',            rate: 0.0025 },
    { id: 'p150',  label: '150인 이상 우선지원대상', rate: 0.0045 },
    { id: 'u1000', label: '150인 이상 1,000인 미만', rate: 0.0065 },
    { id: 'o1000', label: '1,000인 이상 · 국가·지자체', rate: 0.0085 }
  ],

  // 산재보험 — 사업주가 전액 부담하고 업종마다 다릅니다.
  // 평균이 1.47%라 기본값으로 두었을 뿐, 내 업종 요율로 바꿔 넣어야 맞습니다.
  accident: { avgRate: 0.0147, commute: 0.0006 },

  // 국민연금·건강보험은 월 60시간 미만 단시간근로자를 원칙적으로 제외합니다.
  shortTimeHours: 60
};

/** 10원 미만 절사 — 4대보험료 고지 방식입니다. */
function floor10(n){
  return Math.floor(Math.round(n * 1e6) / 1e6 / 10) * 10;
}

/** 국민연금 기준소득월액 — 천원 미만 절사 후 상·하한 적용 */
function pensionBase(pay){
  const cut = Math.floor(pay / 1000) * 1000;
  return Math.min(Math.max(cut, INS.pension.min), INS.pension.max);
}

function stabilityRate(sizeId){
  const found = INS.stability.find(s => s.id === sizeId);
  return found ? found.rate : INS.stability[0].rate;
}

/**
 * 4대보험 한 달치를 근로자·사업주로 나눠 계산합니다.
 *
 * @param {object} o
 * @param {number} o.pay         월 급여 (세전, 비과세 포함한 지급액)
 * @param {number} o.taxFree     이 중 비과세액 (식대 등). 보험료 산정에서 빠집니다
 * @param {string} o.size        사업장 규모 id — INS.stability 참고
 * @param {number} o.accRate     산재보험료율 (소수, 예: 0.0147)
 * @param {boolean} o.over60     60세 이상이면 국민연금을 내지 않습니다
 * @param {boolean} o.shortTime  월 60시간 미만 단시간근로자
 */
function insuranceOf(o){
  const gross   = Math.max(o.pay || 0, 0);
  const taxFree = Math.min(Math.max(o.taxFree || 0, 0), gross);
  // 보수월액 — 비과세를 뺀 금액이 모든 보험료의 기준입니다.
  const base = gross - taxFree;

  // 월 60시간 미만이면 국민연금·건강보험은 원칙적으로 적용되지 않습니다.
  // 고용보험은 3개월 이상 계속 근로하면 60시간 미만이어도 적용되고,
  // 산재보험은 시간과 무관하게 전원 적용입니다.
  const hasPension = !o.over60 && !o.shortTime;
  const hasHealth  = !o.shortTime;

  const pBase = pensionBase(base);

  const pensionW  = hasPension ? floor10(pBase * INS.pension.worker)   : 0;
  const pensionE  = hasPension ? floor10(pBase * INS.pension.employer) : 0;

  const healthW   = hasHealth ? floor10(base * INS.health.worker)   : 0;
  const healthE   = hasHealth ? floor10(base * INS.health.employer) : 0;

  const ltcW      = hasHealth ? floor10(healthW * INS.ltc.rate) : 0;
  const ltcE      = hasHealth ? floor10(healthE * INS.ltc.rate) : 0;

  const employW   = floor10(base * INS.employ.worker);
  const employE   = floor10(base * INS.employ.employer);

  const sRate     = stabilityRate(o.size);
  const stabilityE = floor10(base * sRate);

  const accRate   = (o.accRate == null ? INS.accident.avgRate : o.accRate) + INS.accident.commute;
  const accidentE = floor10(base * accRate);

  const workerTotal   = pensionW + healthW + ltcW + employW;
  const employerTotal = pensionE + healthE + ltcE + employE + stabilityE + accidentE;

  return {
    gross, taxFree, base, pensionBase: pBase,
    hasPension, hasHealth,
    stabilityRate: sRate,
    accidentRate: accRate,
    rows: [
      { key:'pension',   label:'국민연금',       worker:pensionW, employer:pensionE,
        note: hasPension ? '기준소득월액 ' + pBase.toLocaleString('ko-KR') + '원 × 각 4.75%'
                         : (o.over60 ? '60세 이상 — 납부 대상 아님' : '월 60시간 미만 — 적용 제외') },
      { key:'health',    label:'건강보험',       worker:healthW,  employer:healthE,
        note: hasHealth ? '보수월액 × 각 3.595%' : '월 60시간 미만 — 적용 제외' },
      { key:'ltc',       label:'장기요양보험',   worker:ltcW,     employer:ltcE,
        note: hasHealth ? '건강보험료 × 13.14%' : '건강보험 미적용에 따라 함께 제외' },
      { key:'employ',    label:'고용보험',       worker:employW,  employer:employE,
        note:'실업급여분 각 0.9%' },
      { key:'stability', label:'고용안정·직업능력개발', worker:0,  employer:stabilityE,
        note:'사업주만 부담 · ' + (sRate * 100).toFixed(2) + '%' },
      { key:'accident',  label:'산재보험',       worker:0,        employer:accidentE,
        note:'사업주 전액 · ' + (accRate * 100).toFixed(2) + '% (출퇴근재해 0.06% 포함)' }
    ],
    workerTotal,
    employerTotal,
    net: gross - workerTotal,          // 4대보험만 뗀 금액 (소득세 별도)
    laborCost: gross + employerTotal,  // 회사가 실제로 쓰는 돈
    burdenRate: gross > 0 ? employerTotal / gross : 0
  };
}

/* ── 표시 헬퍼 ───────────────────────────────────────────── */
const won = n => Math.round(n).toLocaleString('ko-KR');
const man = n => (Math.round(n / 10000)).toLocaleString('ko-KR');

function attachComma(input, onChange){
  input.addEventListener('input', function(){
    const raw = String(input.value).replace(/[^0-9]/g, '');
    input.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    onChange();
  });
}

function numOf(input){ return Number(String(input.value).replace(/[^0-9]/g, '')) || 0; }

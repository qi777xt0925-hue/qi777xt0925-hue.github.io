/* ─────────────────────────────────────────────────────────────
   마진 · 부가세 계산 엔진 — 온라인 판매와 매장 판매 공통

   핵심은 하나입니다.
   판매가에서 수수료만 빼고 "남았다"고 보면 부가세만큼 어긋납니다.
   일반과세자는 받은 부가세가 내 돈이 아니라 맡아 둔 돈이기 때문입니다.

   부가가치세율 10%는 부가가치세법 제30조로 오래 고정돼 있습니다.

   다른 엔진과 나란히 쓰지 않습니다. 한 페이지는 엔진 하나만 부르며,
   그래서 won 같은 표시 헬퍼가 각 파일에 따로 들어 있습니다.
   ───────────────────────────────────────────────────────────── */
const VAT = {
  rate: 0.10,
  // 수수료 청구서에도 부가세가 붙고, 일반과세자는 그만큼 공제받습니다.
  feeHasVat: true
};

/** 부가세 포함 금액에서 공급가액을 뽑아냅니다 */
function supplyOf(gross){ return gross / (1 + VAT.rate); }
/** 부가세 포함 금액에 들어 있는 부가세 */
function vatOf(gross){ return gross - supplyOf(gross); }

/**
 * 한 건 팔았을 때 실제로 남는 돈.
 *
 * 입력 금액은 모두 부가세가 포함된 실제 주고받는 금액입니다.
 *
 * @param {object} o
 * @param {number} o.price    판매가 (고객이 내는 금액)
 * @param {number} o.cost     매입원가 (내가 낸 금액)
 * @param {number} o.feeRate  수수료율 (소수, 예: 0.06) — 판매가 기준
 * @param {number} o.ship     내가 부담하는 배송비
 * @param {number} o.etc      포장·부자재 등 기타 비용
 * @param {boolean} o.general 일반과세자이면 true, 간이·면세이면 false
 */
function marginOf(o){
  const price = Math.max(o.price || 0, 0);
  const cost  = Math.max(o.cost  || 0, 0);
  const ship  = Math.max(o.ship  || 0, 0);
  const etc   = Math.max(o.etc   || 0, 0);
  const feeRate = Math.max(o.feeRate || 0, 0);

  // 수수료는 부가세 포함 판매가에 요율을 곱해 떼는 것이 일반적입니다.
  const feeSupply = price * feeRate;
  const feeVat    = VAT.feeHasVat ? feeSupply * VAT.rate : 0;
  const feeTotal  = feeSupply + feeVat;

  // 정산 계좌에 실제로 꽂히는 금액
  const settled = price - feeTotal;

  if (!o.general){
    // 간이과세자·면세사업자 — 부가세를 따로 떼어내지 않고 총액으로 봅니다.
    const profit = price - cost - feeTotal - ship - etc;
    return {
      general: false,
      price, cost, ship, etc,
      supply: price, costSupply: cost,
      vatOut: 0, vatIn: 0, vatDue: 0,
      feeSupply, feeVat, feeTotal, settled,
      profit,
      marginRate: price > 0 ? profit / price : 0,
      costRate:   price > 0 ? cost   / price : 0,
      breakEvenPrice: breakEven(cost, ship, etc, feeRate, false)
    };
  }

  const supply     = supplyOf(price);
  const vatOut     = price - supply;
  const costSupply = supplyOf(cost);
  const shipSupply = supplyOf(ship);
  const etcSupply  = supplyOf(etc);
  const vatIn      = vatOf(cost) + vatOf(ship) + vatOf(etc) + feeVat;
  const vatDue     = vatOut - vatIn;

  // 부가세를 걷어내고 나면 남는 돈은 공급가액끼리의 뺄셈과 같습니다.
  const profit = supply - costSupply - feeSupply - shipSupply - etcSupply;

  return {
    general: true,
    price, cost, ship, etc,
    supply, costSupply, shipSupply, etcSupply,
    vatOut, vatIn, vatDue,
    feeSupply, feeVat, feeTotal, settled,
    profit,
    marginRate: supply > 0 ? profit / supply : 0,
    costRate:   supply > 0 ? costSupply / supply : 0,
    breakEvenPrice: breakEven(cost, ship, etc, feeRate, true)
  };
}

/** 이익이 0이 되는 판매가 — 이보다 싸게 팔면 손해입니다 */
function breakEven(cost, ship, etc, feeRate, general){
  if (general){
    // 이익은 공급가액끼리의 뺄셈입니다.
    //   공급가액 - 고정비공급가 - 판매가×수수료율 = 0
    // 판매가 = 공급가액 × 1.1 이므로 수수료는 공급가액의 1.1배에 붙습니다.
    const fixed = supplyOf(cost) + supplyOf(ship) + supplyOf(etc);
    const denom = 1 - feeRate * (1 + VAT.rate);
    if (denom <= 0) return null;
    return (fixed / denom) * (1 + VAT.rate);
  }
  const denom = 1 - feeRate * (1 + VAT.rate);
  if (denom <= 0) return null;
  return (cost + ship + etc) / denom;
}

/** 목표 마진율을 맞추려면 얼마에 팔아야 하나 */
function priceForMargin(o, targetRate){
  if (targetRate >= 1) return null;
  if (o.general){
    const fixed = supplyOf(o.cost || 0) + supplyOf(o.ship || 0) + supplyOf(o.etc || 0);
    const denom = 1 - (o.feeRate || 0) * (1 + VAT.rate) - targetRate;
    if (denom <= 0) return null;
    return (fixed / denom) * (1 + VAT.rate);
  }
  const denom = 1 - (o.feeRate || 0) * (1 + VAT.rate) - targetRate;
  if (denom <= 0) return null;
  return ((o.cost || 0) + (o.ship || 0) + (o.etc || 0)) / denom;
}

/* ── 표시 헬퍼 ───────────────────────────────────────────── */
const won = n => Math.round(n).toLocaleString('ko-KR');
const pct = n => (n * 100).toFixed(1) + '%';

function attachComma(input, onChange){
  input.addEventListener('input', function(){
    const raw = String(input.value).replace(/[^0-9]/g, '');
    input.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    onChange();
  });
}

function numOf(input){ return Number(String(input.value).replace(/[^0-9]/g, '')) || 0; }

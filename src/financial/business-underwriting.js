// src/financial/business-underwriting.js
//
// Underwriting for businesses backed by real estate (the BizBuySell pipeline).
// The real-estate model prices a property off NOI and a cap rate; this one
// prices a business off an earnings multiple and adds the tangible assets that
// convey with it. Shared by the BizBuySell extension panel and the dashboard so
// both quote the same numbers from the same inputs.

import { FINANCIAL_CONSTANTS } from "../config/financial.js";
import { calculateBalloonBalance, calculatePMT } from "./calculations.js";

/**
 * Collateral advance rates for the down payment, and the earnings multiples
 * bounding the offer. The EBITDA leg only contributes at or above its threshold
 * — smaller earnings are not treated as collateral.
 */
export const BUSINESS_UNDERWRITING_CONSTANTS = {
  DSCR_AMORTIZATION_YEARS: 25,
  DSCR_INTEREST_RATE: 0.10,
  EBITDA_ADVANCE_RATE: 0.20,
  EBITDA_ADVANCE_THRESHOLD: 1000000,
  FF_E_ADVANCE_RATE: 0.30,
  INVENTORY_ADVANCE_RATE: 0.20,
  MANAGER_CEILING: 120000,
  MANAGER_FLOOR: 60000,
  MANAGER_RATE: 0.125,
  OFFER_MULTIPLE_HIGH: 3,
  OFFER_MULTIPLE_LOW: 2,
  OFFER_MULTIPLE_MID: 2.5,
  REAL_ESTATE_ADVANCE_RATE: 0.50,
  SELLER_AMORTIZATION_YEARS: 60,
};

// Coerce a scraped/stored figure to a finite number, else null. Absent data must
// stay absent — a missing earnings figure means "no offer", never "an offer of 0".
function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : parseFloat(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function toNonNegative(value) {
  const numeric = toNumber(value);
  return numeric === null || numeric < 0 ? null : numeric;
}

/**
 * Pick the earnings figure that drives the offer multiple, preferring EBITDA and
 * falling back to SDE then cash flow — most BizBuySell listings publish only
 * "Cash Flow (SDE)". The source is returned alongside so callers can label which
 * figure the multiple was applied to instead of implying it was EBITDA.
 * @param {{ebitda?:number, sde?:number, cashFlow?:number}} listing
 * @returns {{earnings:number|null, source:string|null}}
 */
export function resolveBusinessEarnings(listing = {}) {
  const ebitda = toNumber(listing.ebitda);
  if (ebitda !== null) return { earnings: ebitda, source: "ebitda" };

  const sde = toNumber(listing.sde);
  if (sde !== null) return { earnings: sde, source: "sde" };

  const cashFlow = toNumber(listing.cashFlow ?? listing.cash_flow);
  if (cashFlow !== null) return { earnings: cashFlow, source: "cash_flow" };

  return { earnings: null, source: null };
}

/**
 * Whether the real estate should be ADDED to the offer on top of the earnings multiple.
 *
 * Three inputs, in priority order:
 *   1. What the listing says. Explicit wording ("included in asking price", or its negation)
 *      is a statement of fact from the seller and always wins.
 *   2. The arithmetic. When the stated real-estate value is at or above the asking price,
 *      the building IS the ask — adding it again would quote an offer ceiling above the
 *      price being asked, which is nonsense. This is the common case on listings that
 *      publish a real-estate value and no inclusion wording at all.
 *   3. Otherwise include it, matching the default for every other asset: understating an
 *      offer by silently dropping an asset is worse than an inclusion that can be toggled
 *      off by hand.
 *
 * @param {{askingPrice?:number, realEstateValue?:number, statedInclusion?:boolean|null}} inputs
 * @returns {boolean}
 */
export function shouldIncludeRealEstate(inputs = {}) {
  if (typeof inputs.statedInclusion === "boolean") return inputs.statedInclusion;

  const askingPrice = toNumber(inputs.askingPrice);
  const realEstateValue = toNumber(inputs.realEstateValue);

  if (askingPrice !== null && askingPrice > 0 && realEstateValue !== null && realEstateValue >= askingPrice) {
    return false;
  }

  return true;
}

/**
 * Down payment as the sum of per-asset collateral advances: 50% of the real
 * estate, 30% of FF&E, 20% of inventory, plus 20% of EBITDA once EBITDA reaches
 * $1M. Each leg is capped at its own rate, and a leg with no reported value
 * contributes nothing.
 *
 * Deliberately NOT gated by the include_* flags. Those flags answer a different
 * question — whether an asset is ADDED to the offer on top of the earnings
 * multiple — and an asset excluded there is still being acquired. The common case
 * is a building whose value equals the asking price: it is not added to the offer
 * (that would quote a ceiling above the ask) but it is still bought, and it still
 * secures half its value. Gating this on those flags zeroes the collateral on
 * exactly the listings where the real estate matters most.
 *
 * The EBITDA leg reads EBITDA specifically, not the coalesced earnings figure —
 * an SDE-only listing does not qualify, because SDE includes owner compensation
 * and is not the same measure the threshold was set against. collateralizeEbitda
 * is a collateral-only switch, named apart from the include_* flags because it
 * answers that different question: EBITDA is the base the offer multiple is taken
 * against, so it never joins the offer range at all.
 *
 * @param {object} inputs
 * @param {number} [inputs.realEstateValue]
 * @param {number} [inputs.ffeValue]
 * @param {number} [inputs.inventoryValue]
 * @param {number} [inputs.ebitda]
 * @param {boolean} [inputs.collateralizeEbitda=true]
 * @returns {{downPayment:number, legs:{realEstate:number, ffe:number, inventory:number, ebitda:number}}}
 */
export function calculateBusinessDownPayment(inputs = {}) {
  const {
    EBITDA_ADVANCE_RATE,
    EBITDA_ADVANCE_THRESHOLD,
    FF_E_ADVANCE_RATE,
    INVENTORY_ADVANCE_RATE,
    REAL_ESTATE_ADVANCE_RATE,
  } = BUSINESS_UNDERWRITING_CONSTANTS;

  const { collateralizeEbitda = true } = inputs;

  const realEstateValue = toNonNegative(inputs.realEstateValue) ?? 0;
  const ffeValue = toNonNegative(inputs.ffeValue) ?? 0;
  const inventoryValue = toNonNegative(inputs.inventoryValue) ?? 0;
  const ebitda = collateralizeEbitda ? toNumber(inputs.ebitda) ?? 0 : 0;

  const legs = {
    ebitda: ebitda >= EBITDA_ADVANCE_THRESHOLD ? ebitda * EBITDA_ADVANCE_RATE : 0,
    ffe: ffeValue * FF_E_ADVANCE_RATE,
    inventory: inventoryValue * INVENTORY_ADVANCE_RATE,
    realEstate: realEstateValue * REAL_ESTATE_ADVANCE_RATE,
  };

  return {
    downPayment: legs.realEstate + legs.ffe + legs.inventory + legs.ebitda,
    legs,
  };
}

/**
 * The offer range: 2x to 3x earnings, plus the tangible assets that convey.
 * An asset the listing states is already covered by the asking price is excluded
 * by its include flag; the flags default to true, so an asset whose status could
 * not be determined is still offered on (dropping it silently would understate
 * the offer, which is the more damaging error).
 *
 * Returns nulls when no earnings figure exists — there is no honest multiple to
 * take, and quoting the assets alone would read as an offer.
 *
 * @param {object} inputs
 * @param {number} inputs.earnings - Earnings figure the multiple applies to
 * @param {number} [inputs.realEstateValue]
 * @param {number} [inputs.ffeValue]
 * @param {number} [inputs.inventoryValue]
 * @param {boolean} [inputs.includeRealEstate=true]
 * @param {boolean} [inputs.includeFfe=true]
 * @param {boolean} [inputs.includeInventory=true]
 * @returns {{assetsIncluded:number, offerHigh:number|null, offerLow:number|null, offerMid:number|null}}
 */
export function calculateBusinessOffer(inputs = {}) {
  const { OFFER_MULTIPLE_HIGH, OFFER_MULTIPLE_LOW, OFFER_MULTIPLE_MID } = BUSINESS_UNDERWRITING_CONSTANTS;

  const {
    includeFfe = true,
    includeInventory = true,
    includeRealEstate = true,
  } = inputs;

  const assetsIncluded =
    (includeRealEstate ? toNonNegative(inputs.realEstateValue) ?? 0 : 0) +
    (includeFfe ? toNonNegative(inputs.ffeValue) ?? 0 : 0) +
    (includeInventory ? toNonNegative(inputs.inventoryValue) ?? 0 : 0);

  const earnings = toNumber(inputs.earnings);
  if (earnings === null) return { assetsIncluded, offerHigh: null, offerLow: null, offerMid: null };

  return {
    assetsIncluded,
    offerHigh: earnings * OFFER_MULTIPLE_HIGH + assetsIncluded,
    offerLow: earnings * OFFER_MULTIPLE_LOW + assetsIncluded,
    offerMid: earnings * OFFER_MULTIPLE_MID + assetsIncluded,
  };
}

/**
 * The seller-carry terms for the price actually being offered.
 *
 * The offer range is a range; the LOI needs one number. priceOffered is that
 * choice, and the seller carries whatever the collateral down payment does not
 * cover. From there the arithmetic is the property engine's, so both sides quote
 * a balloon identically — a business is worked like a rental, only the earnings
 * measure differs.
 *
 * Returns nulls when no price has been offered yet. A zeroed payment schedule
 * would read as real terms on an LOI, which is the more damaging error.
 *
 * @param {object} inputs
 * @param {number} inputs.priceOffered - The figure being offered
 * @param {number} inputs.downPayment - Collateral-derived down payment
 * @param {number} [inputs.interestRate=0] - Annual seller-finance rate, as a decimal
 * @param {number} [inputs.amortizationYears=30]
 * @param {number} [inputs.balloonYears=7]
 * @param {string} [inputs.interestPaymentMode="standard"] - standard | simple_payout | compound_payout
 * @returns {{sellerFinanced:number|null, sfPayment:number|null, balloonBalance:number|null, performancePayout:number, totalPayments:number|null}}
 */
export function calculateBusinessSellerFinance(inputs = {}) {
  const {
    amortizationYears = FINANCIAL_CONSTANTS.SELLER_FI_AMORTIZATION,
    balloonYears = FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS,
    interestPaymentMode = "standard",
    interestRate = FINANCIAL_CONSTANTS.SELLER_FI_INTEREST_RATE,
  } = inputs;

  const priceOffered = toNumber(inputs.priceOffered);
  if (priceOffered === null) {
    return {
      balloonBalance: null,
      performancePayout: 0,
      sellerFinanced: null,
      sfPayment: null,
      totalPayments: null,
    };
  }

  const downPayment = toNonNegative(inputs.downPayment) ?? 0;
  // Never negative: collateral outrunning the offer is reported as a shortfall by
  // the caller, not folded back in here as a carry the seller owes the buyer.
  const sellerFinanced = Math.max(0, priceOffered - downPayment);

  let performancePayout = 0;
  let sfPayment;

  if (interestPaymentMode === "standard") {
    sfPayment = calculatePMT(sellerFinanced, interestRate, amortizationYears);
  } else {
    // Payout modes defer all interest to the balloon, so the running payment is
    // principal-only and the balloon carries the accrued interest instead.
    sfPayment = calculatePMT(sellerFinanced, 0, amortizationYears);
    if (interestPaymentMode === "simple_payout") {
      performancePayout = sellerFinanced * interestRate * balloonYears;
    } else if (interestPaymentMode === "compound_payout") {
      performancePayout = sellerFinanced * (Math.pow(1 + interestRate, balloonYears) - 1);
    }
  }

  // Mirrors the property engine: amortized down in standard mode, full principal
  // in the payout modes, with the deferred interest added on top.
  const baseBalloonBalance = interestPaymentMode === "standard"
    ? calculateBalloonBalance(sellerFinanced, interestRate, amortizationYears, balloonYears)
    : sellerFinanced;

  return {
    balloonBalance: baseBalloonBalance + performancePayout,
    performancePayout,
    sellerFinanced,
    sfPayment,
    totalPayments: sfPayment * 12 * balloonYears,
  };
}

/**
 * The debt-service gate. Does the business's earnings cover both loans it is bought
 * with, after a professional manager is installed?
 *
 * Two legs, each priced the way the deal is actually financed:
 *   - DSCR loan: principal + interest on the collateral advance (the down payment),
 *     amortized at the commercial rate/term. This is real money out every month.
 *   - Seller carry: principal only (0%), spread over the business carry term. The
 *     seller finances whatever the advance did not cover.
 *
 * The manager is the reason EBITDA and SDE are not interchangeable here. EBITDA is
 * already struck after management, so it is used as-is. SDE (and the SDE-shaped
 * "cash flow" figure most listings publish) still pays the owner, so a hired
 * manager's cost comes out first — 12.5% of revenue, floored at $60K so a tiny
 * business still budgets a real salary and capped at $120K so a large one does not
 * hand the whole upside to a GM.
 *
 * margin is that leftover cash flow over the price offered — the honest efficiency
 * metric, because this structure puts no buyer cash in and cash-on-cash is infinite.
 *
 * Returns null when there is no earnings figure or no price to gate: a zeroed
 * verdict would read as "fails", and a business with no published earnings has not
 * failed, it is simply un-underwritable until a figure exists.
 *
 * @param {object} inputs
 * @param {number} inputs.earnings - Annual earnings the deal is bought on
 * @param {string|null} inputs.earningsSource - "ebitda" | "sde" | "cash_flow" | null
 * @param {number} inputs.downPayment - Collateral advance = the DSCR loan principal
 * @param {number} inputs.priceOffered - The offer being gated (its seller carry = price − advance)
 * @param {number} [inputs.grossRevenue] - Drives the manager cost on non-EBITDA earnings
 * @param {number} [inputs.ebitdaLegAmount=0] - The EBITDA slice of the advance; > 0 flags cash-flow lending
 * @param {number} [inputs.offerHigh] - Ceiling offer, for the below-asking highlight
 * @param {number} [inputs.askingPrice] - For the below-asking highlight
 * @param {number} [inputs.dscrRate] - DSCR annual rate (default 10%)
 * @param {number} [inputs.dscrAmortizationYears] - DSCR term (default 25)
 * @param {number} [inputs.sellerAmortizationYears] - Seller carry term (default 60)
 * @param {number} [inputs.sellerRate] - Seller carry rate (default 0%)
 * @param {number} [inputs.balloonYears] - Seller carry balloon (default from FINANCIAL_CONSTANTS)
 * @returns {object|null} manager cost, both leg payments, blended rate, cash flow + margin (monthly/annual), pass, pills
 */
export function calculateBusinessCashFlow(inputs = {}) {
  const {
    DSCR_AMORTIZATION_YEARS,
    DSCR_INTEREST_RATE,
    MANAGER_CEILING,
    MANAGER_FLOOR,
    MANAGER_RATE,
    SELLER_AMORTIZATION_YEARS,
  } = BUSINESS_UNDERWRITING_CONSTANTS;

  const {
    askingPrice = null,
    balloonYears = FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS,
    dscrAmortizationYears = DSCR_AMORTIZATION_YEARS,
    dscrRate = DSCR_INTEREST_RATE,
    earningsSource = null,
    ebitdaLegAmount = 0,
    offerHigh = null,
    sellerAmortizationYears = SELLER_AMORTIZATION_YEARS,
    sellerRate = FINANCIAL_CONSTANTS.SELLER_FI_INTEREST_RATE,
  } = inputs;

  const price = toNumber(inputs.priceOffered);
  const earnings = toNumber(inputs.earnings);
  if (price === null || price <= 0 || earnings === null) return null;

  const advance = toNonNegative(inputs.downPayment) ?? 0;

  // EBITDA is already net of a manager; everything else still pays the owner, so the
  // manager comes out first. No revenue reported falls to the floor, never to zero.
  const managerCost =
    earningsSource === "ebitda"
      ? 0
      : Math.min(MANAGER_CEILING, Math.max(MANAGER_FLOOR, (toNonNegative(inputs.grossRevenue) ?? 0) * MANAGER_RATE));
  const adjustedEarnings = earnings - managerCost;

  const dscrPaymentMonthly = calculatePMT(advance, dscrRate, dscrAmortizationYears);
  const { sfPayment: sellerPaymentMonthly, sellerFinanced } = calculateBusinessSellerFinance({
    amortizationYears: sellerAmortizationYears,
    balloonYears,
    downPayment: advance,
    interestRate: sellerRate,
    priceOffered: price,
  });

  const dscrPaymentAnnual = dscrPaymentMonthly * 12;
  const sellerPaymentAnnual = sellerPaymentMonthly * 12;

  // What the whole capital stack costs, weighted by how much of it each leg is. The
  // property engine blends the same two rates the same way, so a business and a rental
  // quote a comparable number.
  const financed = advance + (sellerFinanced ?? 0);
  const blendedRate = financed > 0 ? (advance * dscrRate + (sellerFinanced ?? 0) * sellerRate) / financed : 0;
  const cashFlowAnnual = adjustedEarnings - dscrPaymentAnnual - sellerPaymentAnnual;
  const cashFlowMonthly = cashFlowAnnual / 12;

  const pass = cashFlowAnnual >= 0;
  const ebitdaFinanced = (toNonNegative(ebitdaLegAmount) ?? 0) > 0;
  const ceiling = toNumber(offerHigh);
  const asking = toNumber(askingPrice);
  const offerBelowAsking = ceiling !== null && asking !== null && asking > 0 && ceiling < asking;

  // Red flags, most damaging first. offerBelowAsking is a separate soft highlight,
  // not a pill — it does not disqualify the deal, it just says come in under asking.
  const pills = [];
  if (!pass) pills.push("Cash Flow");
  if (ebitdaFinanced) pills.push("EBITDA financed");

  return {
    adjustedEarnings,
    blendedRate,
    cashFlowAnnual,
    cashFlowMonthly,
    dscrPaymentAnnual,
    dscrPaymentMonthly,
    ebitdaFinanced,
    flagged: !pass || ebitdaFinanced,
    managerCost,
    marginAnnual: cashFlowAnnual / price,
    marginMonthly: cashFlowMonthly / price,
    offerBelowAsking,
    pass,
    pills,
    price,
    sellerFinanced,
    sellerPaymentAnnual,
    sellerPaymentMonthly,
  };
}

/**
 * Full underwrite for one listing: resolve earnings, size the down payment from
 * collateral, and bound the offer. The seller carries the balance of the ceiling
 * offer as preferred equity.
 *
 * collateralShortfall is set when the collateral-driven down payment exceeds the
 * offer itself — a real signal that the asset value has outrun what the earnings
 * multiple justifies. It is surfaced, never clamped away.
 *
 * downPaymentPercent lets an analyst answer the collateral back: set it and the down
 * payment is that share of the price instead of the sum of the advances.
 *
 * @param {object} listing - Scraped/stored figures (snake_case or camelCase)
 * @param {number} [listing.downPaymentPercent] - Decimal share of the price to put down, overriding collateral
 * @returns {object} earnings, earningsSource, downPayment, downPaymentPercent, downPaymentSource, collateralDownPayment, legs, offerLow, offerHigh, sellerCarry, collateralShortfall
 */
export function underwriteBusinessListing(listing = {}) {
  const realEstateValue = listing.realEstateValue ?? listing.real_estate_value;
  const ffeValue = listing.ffeValue ?? listing.ff_e_value;
  const inventoryValue = listing.inventoryValue ?? listing.inventory_value;
  const ebitda = listing.ebitda;

  const { earnings, source } = resolveBusinessEarnings({
    cashFlow: listing.cashFlow ?? listing.cash_flow,
    ebitda,
    sde: listing.sde,
  });

  // The collateral stack covers everything being acquired, so it takes no include_*
  // flag — those govern only what is ADDED to the offer range. Its one switch is
  // collateralizeEbitda, which has no offer-range counterpart.
  const { downPayment: collateralDownPayment, legs } = calculateBusinessDownPayment({
    collateralizeEbitda: listing.collateralizeEbitda ?? listing.collateralize_ebitda ?? true,
    ebitda,
    ffeValue,
    inventoryValue,
    realEstateValue,
  });

  const { assetsIncluded, offerHigh, offerLow, offerMid } = calculateBusinessOffer({
    earnings,
    ffeValue,
    includeFfe: listing.includeFfe ?? listing.include_ff_e ?? true,
    includeInventory: listing.includeInventory ?? listing.include_inventory ?? true,
    includeRealEstate: listing.includeRealEstate ?? listing.include_real_estate ?? true,
    inventoryValue,
    realEstateValue,
  });

  const earningsSource = listing.earningsSource ?? listing.earnings_source ?? source;

  // The price every derived figure is struck against: the LOI price when one has been
  // chosen, otherwise the end of the range being looked at (the ceiling by default,
  // which is the thinnest margin).
  const offerEnd = listing.offerEnd ?? listing.offer_end ?? "high";
  const explicitPrice = toNumber(listing.priceOffered ?? listing.price_offered);
  const gatePrice =
    explicitPrice ?? { high: offerHigh, low: offerLow, mid: offerMid }[offerEnd] ?? offerHigh;

  // A hand-set down payment percentage replaces the collateral stack for this listing.
  // The legs are still returned — they explain what the assets would have advanced — but
  // they stop sizing the deal: the down payment IS the DSCR loan principal, so an override
  // moves the loan, the seller carry, and the cash-flow gate with it. Cleared, the
  // collateral answers again.
  const overridePercent = toNumber(listing.downPaymentPercent ?? listing.down_payment_percent);
  const hasOverride = overridePercent !== null && overridePercent > 0 && gatePrice !== null;
  const downPayment = hasOverride ? gatePrice * overridePercent : collateralDownPayment;

  // Terms for the price actually offered. Kept separate from the range figures
  // above so there is no mistaking the deal being made for the ceiling that
  // bounds it — sellerCarry is the carry at offerHigh, terms.sellerFinanced the
  // carry at the price on the LOI.
  const terms = calculateBusinessSellerFinance({
    amortizationYears: listing.sellerAmortization ?? listing.seller_amortization ?? undefined,
    balloonYears: listing.balloonLength ?? listing.balloon_length ?? undefined,
    downPayment,
    interestPaymentMode: listing.interestPaymentMode ?? listing.interest_payment_mode ?? "standard",
    interestRate: listing.sellerFiRate ?? listing.seller_fi_rate ?? undefined,
    priceOffered: listing.priceOffered ?? listing.price_offered,
  });

  // The debt-service gate, priced at gatePrice above.
  const cashFlow = calculateBusinessCashFlow({
    askingPrice: listing.askingPrice ?? listing.asking_price,
    downPayment,
    earnings,
    earningsSource,
    ebitdaLegAmount: legs.ebitda,
    grossRevenue: listing.grossRevenue ?? listing.gross_revenue,
    offerHigh,
    priceOffered: gatePrice,
  });

  return {
    assetsIncluded,
    cashFlow,
    collateralDownPayment,
    collateralShortfall: offerHigh !== null && downPayment > offerHigh,
    downPayment,
    downPaymentPercent: gatePrice ? downPayment / gatePrice : null,
    downPaymentSource: hasOverride ? "override" : "collateral",
    earnings,
    earningsSource,
    legs,
    offerEnd,
    offerHigh,
    offerLow,
    offerMid,
    priceOffered: toNumber(listing.priceOffered ?? listing.price_offered),
    sellerCarry: offerHigh === null ? null : offerHigh - downPayment,
    terms,
  };
}

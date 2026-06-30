// src/financial/equity-carry.js

import { DEFAULT_CAP_RATE, INTEREST_RATE_TIERS, SELLER_FI_AMORTIZATION, SELLER_FI_INTEREST_RATE, determineInterestRateType } from "../config/financial.js";
import { calculateAssignmentFee, calculatePMT, resolveListingFinancials } from "./calculations.js";

/**
 * Equity Carry financing tiers (constant 110% leverage: DSCR % + seller carry % = 110).
 * Ordered highest down-payment first so a sweep stops at the strongest qualifying tier:
 * cash flow falls as the down payment rises (more of the stack moves to the market-rate
 * DSCR leg and off the 0% seller note), so the first tier that clears in a 60->20 sweep is
 * the highest down payment that still cash-flows.
 */
export const EQUITY_CARRY_TIERS = [
  { downPercent: 60, dscrPercent: 70, sellerPercent: 40 },
  { downPercent: 50, dscrPercent: 60, sellerPercent: 50 },
  { downPercent: 40, dscrPercent: 50, sellerPercent: 60 },
  { downPercent: 30, dscrPercent: 40, sellerPercent: 70 },
  { downPercent: 20, dscrPercent: 30, sellerPercent: 80 },
];

const DISCOUNT_BASIS = 0.85;
const FIXED_YIELD_TIER = EQUITY_CARRY_TIERS[EQUITY_CARRY_TIERS.length - 1]; // 20% down
const YIELD_BAND_HIGH = 0.08;
const YIELD_BAND_MEDIUM = 0.04;

/**
 * Annual debt service for one tier at a given price basis, from the suite primitives.
 * DSCR leg amortizes at the property's market rate/term; the seller carry leg is 0% / 30yr.
 * @param {{dscrPercent:number, sellerPercent:number}} tier
 * @param {number} basis - Price the financing is sized against (asking or discounted)
 * @param {number} dscrRate - DSCR annual interest rate (decimal)
 * @param {number} dscrAmortization - DSCR amortization (years)
 * @returns {number} Combined annual debt service (DSCR + seller carry)
 */
function tierAnnualDebtService(tier, basis, dscrRate, dscrAmortization) {
  const dscrAnnual = calculatePMT(basis * (tier.dscrPercent / 100), dscrRate, dscrAmortization) * 12;
  const sellerAnnual = calculatePMT(basis * (tier.sellerPercent / 100), SELLER_FI_INTEREST_RATE, SELLER_FI_AMORTIZATION) * 12;
  return dscrAnnual + sellerAnnual;
}

/**
 * Sweep the tiers (60 -> 20) at one price basis; return the first (highest down payment)
 * tier whose annual cash flow is positive AND whose down payment covers any known debt.
 * @returns {{tier:object, cashFlow:number}|null} Winning tier + its annual cash flow, or null
 */
function sweepTiers(noi, basis, dscrRate, dscrAmortization, estimatedDebt) {
  for (const tier of EQUITY_CARRY_TIERS) {
    const cashFlow = noi - tierAnnualDebtService(tier, basis, dscrRate, dscrAmortization);
    const downPayment = (tier.downPercent / 100) * basis;
    if (cashFlow > 0 && downPayment >= estimatedDebt) {
      return { cashFlow, tier };
    }
  }
  return null;
}

/**
 * Score a scraped listing with the Equity Carry Method and route it to a deal pool.
 *
 * Pure, no IO. Accepts inputs in the raw shape Postgres returns: `price` and `capRate` may
 * be NUMERIC strings, and `capRate` is a PERCENT (e.g. "6.5", not 0.065) — both are coerced
 * here, so the trap where a clean-decimal fixture passes while production data fails silently
 * cannot occur. A null/non-finite reported cap falls back to DEFAULT_CAP_RATE for multifamily.
 *
 * At score time the property is assumed 100% equity (estimatedDebt = 0), so debt coverage
 * always passes and the routing is driven purely by cash flow; the real debt figure is tested
 * later by the debt drain, which demotes uncovered prospect/discount rows to `shadow`.
 *
 * Run A (routing): sweep 60->20 at the asking price; the first qualifying tier => prospect.
 * If none qualify, re-sweep at 85% of asking; the first qualifying tier => discount. If none
 * qualify in either pass => dead.
 *
 * Run B (comparable yield): independent of Run A, the cash flow at a fixed 20%-down stack on
 * the chosen offer price, divided by that offer price. Banded high/medium/low; dead rows are
 * forced to band `none` (the raw yield is still returned).
 *
 * @param {Object} input
 * @param {number|null} [input.bedroomCount] - Bedroom count (assisted living NOI only)
 * @param {number|string|null} input.capRate - Reported cap rate as a PERCENT; null => estimate
 * @param {number|string} input.price - Asking price (positive); null/0 returns null
 * @param {string} [input.propertyType] - DB property type (mfr/str/assisted/other)
 * @param {number|string|null} [input.units] - Unit count (selects residential vs commercial DSCR tier)
 * @returns {{assignment:number, cap_source:string, cash_flow:(number|null), deal_pool:string, downpayment_percent:number, equity_tier:(object|null), offer_price:number, raw_yield:number, yield_band:string}|null}
 *   `cap_source` is "reported" when a usable cap was supplied, "estimate" when the row was
 *   scored on DEFAULT_CAP_RATE because none was — the UI flags "estimate" rows as
 *   needs-confirmation and offers a manual cap-rate input that re-scores the row. Most
 *   meaningful for cap-driven types (mfr/other); STR/assisted derive NOI from other models.
 *   Null when price is not a positive number (caller should skip + log; the SQL gate excludes these).
 */
export function calculateEquityCarryScore({
  bedroomCount = null,
  capRate,
  price,
  propertyType = "mfr",
  units = null,
} = {}) {
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) return null;

  const capPercent = capRate === null || capRate === undefined || capRate === "" ? NaN : Number(capRate);
  const reportedCapRate = Number.isFinite(capPercent) ? capPercent / 100 : null;

  const unitsNum = Number(units);
  const rateType = determineInterestRateType(propertyType, Number.isFinite(unitsNum) ? unitsNum : undefined);
  const { amortization: dscrAmortization, rate: dscrRate } = INTEREST_RATE_TIERS[rateType];

  const { noi } = resolveListingFinancials({
    bedroomCount,
    estimatedCapRate: DEFAULT_CAP_RATE,
    price: priceNum,
    propertyType,
    reportedCapRate,
  });

  const estimatedDebt = 0;

  let dealPool;
  let offerPrice;
  let winner = sweepTiers(noi, priceNum, dscrRate, dscrAmortization, estimatedDebt);
  if (winner) {
    dealPool = "prospect";
    offerPrice = priceNum;
  } else {
    const discountBasis = priceNum * DISCOUNT_BASIS;
    winner = sweepTiers(noi, discountBasis, dscrRate, dscrAmortization, estimatedDebt);
    if (winner) {
      dealPool = "discount";
      offerPrice = discountBasis;
    } else {
      dealPool = "dead";
      offerPrice = priceNum;
    }
  }

  const cashFlow20 = noi - tierAnnualDebtService(FIXED_YIELD_TIER, offerPrice, dscrRate, dscrAmortization);
  const rawYield = offerPrice > 0 ? cashFlow20 / offerPrice : 0;

  let yieldBand;
  if (dealPool === "dead") {
    yieldBand = "none";
  } else if (rawYield > YIELD_BAND_HIGH) {
    yieldBand = "high";
  } else if (rawYield >= YIELD_BAND_MEDIUM) {
    yieldBand = "medium";
  } else {
    yieldBand = "low";
  }

  return {
    assignment: calculateAssignmentFee(offerPrice),
    cap_source: reportedCapRate === null ? "estimate" : "reported",
    cash_flow: winner ? winner.cashFlow : null,
    deal_pool: dealPool,
    downpayment_percent: winner ? winner.tier.downPercent : -1,
    equity_tier: winner ? { ...winner.tier } : null,
    offer_price: offerPrice,
    raw_yield: rawYield,
    yield_band: yieldBand,
  };
}

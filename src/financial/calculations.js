// src/financial/calculations.js

import { FINANCIAL_CONSTANTS } from '../config/financial.js';
import { BUSINESS_CONSTANTS } from '../config/business.js';
import { PROPERTY_TYPE_CONSTANTS, PROPERTY_TYPES } from '../config/property-types.js';

const DEFAULT_TIER = FINANCIAL_CONSTANTS.INTEREST_RATE_TIERS[FINANCIAL_CONSTANTS.DEFAULT_INTEREST_RATE_TYPE];


/**
 * PMT function for loan payment calculation
 * @param {number} principal - Loan principal amount  
 * @param {number} annualRate - Annual interest rate (as decimal, e.g., 0.075 for 7.5%)
 * @param {number} years - Loan term in years
 * @returns {number} Monthly payment amount
 */
export function calculatePMT(principal, annualRate, years) {
  if (annualRate === 0) {
    return principal / (years * 12);
  }
  
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;
  const pmt = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
              (Math.pow(1 + monthlyRate, numPayments) - 1);
  return pmt;
}

export function calculateCOCR30(askingPrice, noi) {
  try {
    const cashInvested = askingPrice * 0.30; // 30% down payment
    const dscrLoanAmount = askingPrice * 0.70; // Fixed 70% DSCR loan
    const dscrPayment = calculatePMT(dscrLoanAmount, 0.075, 30) * 12; // Annual DSCR payment
    const annualCashFlow = noi - dscrPayment;
    const cocr = (annualCashFlow / cashInvested) * 100;
    
    return cocr;
  } catch (error) {
    return 0;
  }
}

export function calculateCashFlowYield(monthlyCashFlow, purchasePrice) {
  if (!purchasePrice || purchasePrice <= 0) return 0;
  const annualCashFlow = monthlyCashFlow * 12;
  return (annualCashFlow / purchasePrice) * 100;
}

/**
 * Equity as a decimal fraction of price, derived from outstanding debt.
 * equity = (price - debtBalance) / price. Recompute whenever the user edits price.
 * Falls back to 1 (100% equity) when debt is unavailable or price is non-positive,
 * matching the "estimated = 100%" rule when the debt service returns no number.
 * @param {number} price - Listing/asking/offered price.
 * @param {number} debtBalance - Outstanding mortgage balance owing.
 * @returns {number} Equity as a decimal (e.g. 0.59 for 59%); 1 when debt is unknown.
 */
export function equityPercentFromDebt(price, debtBalance) {
  const p = Number(price);
  const d = Number(debtBalance);
  if (!Number.isFinite(p) || p <= 0) return 1;
  if (!Number.isFinite(d)) return 1;
  return (p - d) / p;
}


/**
 * Calculate the property price that yields a target COCR percentage
 * @param {number} noi - Net Operating Income (annual)
 * @param {number} targetCOCR - Target COCR as decimal (default: 0.15 for 15%)
 * @param {Object} options - Configuration options (uses config constants as defaults)
 * @returns {number} Calculated property price
 */
export function calculatePriceForCOCR(noi, targetCOCR = 0.15, options = {}) {
  const {
    downPercent = FINANCIAL_CONSTANTS.DEFAULT_DOWN_PAYMENT * 100,
    dscrLtvPercent = FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE * 100,
    dscrRate = DEFAULT_TIER.rate,
    dscrTerm = DEFAULT_TIER.amortization,
    maxIterations = BUSINESS_CONSTANTS.MAX_ITERATIONS,
    tolerance = BUSINESS_CONSTANTS.CALCULATION_TOLERANCE
  } = options;

  try {
    let targetPrice = noi / 0.08; // Initial estimate: NOI / 8% cap rate
    let iterations = 0;
    
    while (iterations < maxIterations) {
      const cashInvested = targetPrice * (downPercent / 100);
      const dscrLoanAmount = targetPrice * (dscrLtvPercent / 100);
      const dscrPayment = calculatePMT(dscrLoanAmount, dscrRate, dscrTerm) * 12;
      const annualCashFlow = noi - dscrPayment;
      const currentCOCR = annualCashFlow / cashInvested;
      
      if (Math.abs(currentCOCR - targetCOCR) < tolerance) {
        break;
      }
      
      const error = currentCOCR - targetCOCR;
      const adjustment = error * BUSINESS_CONSTANTS.ADJUSTMENT_FACTOR;
      
      if (error > 0) {
        targetPrice = targetPrice * (1 + Math.abs(adjustment));
      } else {
        targetPrice = targetPrice * (1 - Math.abs(adjustment));
      }
      
      // Reasonable bounds during iteration (prevent extreme values)
      if (targetPrice < 1000) targetPrice = 1000;
      if (targetPrice > noi * BUSINESS_CONSTANTS.MAX_COCR15_PRICE_MULTIPLIER) {
        targetPrice = noi * BUSINESS_CONSTANTS.CONSERVATIVE_COCR15_PRICE_MULTIPLIER;
      }
      
      iterations++;
    }
    
    // Apply final bounds check AFTER iteration
    if (targetPrice < BUSINESS_CONSTANTS.MINIMUM_COCR15_PRICE) {
      targetPrice = BUSINESS_CONSTANTS.MINIMUM_COCR15_PRICE;
    }
    
    return targetPrice;
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate COCR at a specific down payment percentage
 * @param {number} askingPrice - Property asking price
 * @param {number} noi - Net Operating Income (annual)
 * @param {number} downPercent - Down payment percentage
 * @param {Object} options - Configuration options (uses config constants as defaults)
 * @returns {number} COCR percentage
 */
export function calculateCOCRAtPercent(askingPrice, noi, downPercent, options = {}) {
  const {
    dscrRate = DEFAULT_TIER.rate,
    dscrTerm = DEFAULT_TIER.amortization,
  } = options;

  try {
    const downDecimal = downPercent / 100;
    const cashInvested = askingPrice * downDecimal;
    
    // Fix financing structure: seller financing reduces available DSCR loan
    const dscrLoanAmount = askingPrice - cashInvested;
    
    const dscrPayment = calculatePMT(dscrLoanAmount, dscrRate, dscrTerm) * 12;
    
    const annualCashFlow = noi - dscrPayment;
    const cocr = (annualCashFlow / cashInvested) * 100;
    
    return cocr;
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate STR (short-term rental) NOI - the single source of STR NOI math.
 *
 * Resolution order:
 *   1. apiResult type 'noi'   -> value is already net, return as-is
 *   2. apiResult type 'gross' -> apply NOI margin (value * noiPercentage)
 *   3. no/invalid apiResult   -> estimate from price (price * grossRate * noiPercentage)
 *
 * apiResult comes from api.archerjessop.com/str-revenue: { value, type }.
 * Pass null while that backend is not live (the price estimate is used).
 *
 * @param {number} askingPrice - Property asking price
 * @param {{value:number, type:'noi'|'gross'}|null} apiResult - STR revenue API result
 * @param {Object} options - Rate overrides (default to STR config constants)
 * @returns {number} Annual NOI (0 on invalid input)
 */
export function calculateSTRNOI(askingPrice, apiResult = null, options = {}) {
  const {
    grossRate = PROPERTY_TYPE_CONSTANTS.STR.ESTIMATED_GROSS_RATE,
    noiPercentage = PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE
  } = options;

  try {
    if (apiResult && Number.isFinite(apiResult.value) && apiResult.value >= 0) {
      if (apiResult.type === "noi") return apiResult.value;
      if (apiResult.type === "gross") return apiResult.value * noiPercentage;
    }

    if (!Number.isFinite(askingPrice) || askingPrice <= 0) return 0;
    return askingPrice * grossRate * noiPercentage;
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate NOI based on property type
 * @param {number} askingPrice - Property asking price
 * @param {number} capRate - Cap rate as decimal (e.g., 0.08 for 8%)
 * @param {string} propertyType - Property type from PROPERTY_TYPES
 * @param {Object} options - Configuration options (uses config constants as defaults)
 * @returns {number} Calculated NOI
 */
export function calculateNOIByType(askingPrice, capRate, propertyType = PROPERTY_TYPES.MULTIFAMILY, options = {}) {
  const {
    strApiResult = null,
    strGrossIncomeMultiplier = PROPERTY_TYPE_CONSTANTS.STR.ESTIMATED_GROSS_RATE,
    strNoiPercentage = PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE,
    assistedIncomePerBedroom = PROPERTY_TYPE_CONSTANTS.ASSISTED_LIVING.INCOME_PER_BEDROOM_MONTHLY,
    bedroomCount = PROPERTY_TYPE_CONSTANTS.ASSISTED_LIVING.DEFAULT_BEDROOM_COUNT
  } = options;

  try {
    switch ((propertyType || PROPERTY_TYPES.MULTIFAMILY).toLowerCase()) {
      case PROPERTY_TYPES.STR:
        return calculateSTRNOI(askingPrice, strApiResult, {
          grossRate: strGrossIncomeMultiplier,
          noiPercentage: strNoiPercentage
        });

      case PROPERTY_TYPES.ASSISTED_LIVING:
        return bedroomCount * assistedIncomePerBedroom * 12;
        
      case PROPERTY_TYPES.MULTIFAMILY:
      default:
        return askingPrice * capRate;
    }
  } catch (error) {
    return 0;
  }
}

/**
 * Resolve a listing's canonical NOI and the cap rates derived from it.
 *
 * NOI is the source of truth; each property type computes it by its own model
 * (delegated to calculateNOIByType, unchanged). The active (displayed) cap rate is
 * always derived as NOI / price. The reported cap rate is carried through as
 * provenance (shown on hover; null => the UI shows "N/A"); it only DRIVES the NOI for
 * multifamily, where the cap rate is the model input.
 *
 * NOI precedence: an analyst-confirmed NOI overrides the per-type model; otherwise STR
 * uses measured 3rd-party revenue when present and the price-based estimate otherwise;
 * assisted uses bedroom count; multifamily uses the reported cap (or estimatedCapRate
 * when none was reported).
 *
 * @param {Object} input
 * @param {number|null} [input.bedroomCount] - Bedroom count for assisted living
 * @param {number|null} [input.confirmedNOI] - Analyst-confirmed/edited NOI; overrides the per-type model
 * @param {number} [input.estimatedCapRate] - Fallback cap (decimal) used for multifamily NOI when none was reported
 * @param {number} input.price - Asking price
 * @param {string} [input.propertyType] - One of PROPERTY_TYPES
 * @param {number|null} [input.reportedCapRate] - Real scraped/listed cap rate as a decimal (e.g. 0.0486); null when none was reported
 * @param {{value:number,type:'noi'|'gross'}|null} [input.strApiResult] - Measured STR revenue (3rd-party); null until that backend ships
 * @returns {{activeCapRate:(number|null), noi:number, noiSource:string, reportedCapRate:(number|null)}}
 */
export function resolveListingFinancials({
  bedroomCount = null,
  confirmedNOI = null,
  estimatedCapRate,
  price,
  propertyType = PROPERTY_TYPES.MULTIFAMILY,
  reportedCapRate = null,
  strApiResult = null,
} = {}) {
  const hasReported = reportedCapRate != null && Number.isFinite(reportedCapRate);
  const capForNOI = hasReported ? reportedCapRate : estimatedCapRate;
  const measured = strApiResult && Number.isFinite(strApiResult.value) && strApiResult.value >= 0 &&
    (strApiResult.type === "noi" || strApiResult.type === "gross");

  let noi;
  let noiSource;
  if (confirmedNOI != null && Number.isFinite(confirmedNOI) && confirmedNOI >= 0) {
    noi = confirmedNOI;
    noiSource = "confirmed";
  } else {
    noi = calculateNOIByType(price, capForNOI, propertyType, { bedroomCount, strApiResult });
    const type = (propertyType || "").toLowerCase();
    if (type === PROPERTY_TYPES.STR) {
      noiSource = measured ? "measured" : "estimate";
    } else if (type === PROPERTY_TYPES.ASSISTED_LIVING) {
      noiSource = "bedrooms";
    } else {
      noiSource = hasReported ? "cap" : "estimate";
    }
  }

  if (!Number.isFinite(noi)) noi = 0;
  const activeCapRate = Number.isFinite(price) && price > 0 ? noi / price : null;

  return {
    activeCapRate,
    noi,
    noiSource,
    reportedCapRate: hasReported ? reportedCapRate : null,
  };
}

/**
 * Calculate assignment fee
 * @param {number} askingPrice - Property asking price
 * @param {number} assignmentPercent - Assignment fee percentage (uses config default)
 * @returns {number} Assignment fee amount
 */
export function calculateAssignmentFee(askingPrice, assignmentPercent = BUSINESS_CONSTANTS.ASSIGNMENT_FEE_PERCENTAGE * 100) {
  try {
    return askingPrice * (assignmentPercent / 100);
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate the all-cash offer price from the 15%-COCR price.
 * The cash offer is the standard-investor 15%-COCR price less a haircut that
 * covers the assignment fee and associated costs, then floored DOWN to the
 * rounding step. Flooring (never rounding up) keeps the offer at or below the
 * 15%-COCR maximum threshold.
 * @param {number} cocr15Price - Price at which COCR hits 15% on the NOI (dollars)
 * @param {number} assignmentPercent - Haircut as a decimal (uses config default)
 * @param {number} roundingStep - Floor the result down to this step; 0 disables (uses config default)
 * @returns {number|null} Cash offer price, or null when cocr15Price is not a positive number
 */
export function calculateCashOfferPrice(
  cocr15Price,
  assignmentPercent = BUSINESS_CONSTANTS.CASH_OFFER_ASSIGNMENT_PERCENTAGE,
  roundingStep = BUSINESS_CONSTANTS.CASH_OFFER_ROUNDING
) {
  const price = Number(cocr15Price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const haircutPrice = price * (1 - assignmentPercent);
  if (!Number.isFinite(roundingStep) || roundingStep <= 0) return haircutPrice;
  // Round to whole dollars first so binary-float noise (e.g. 929999.9999) can't
  // knock the value down a whole step, then floor to the step.
  return Math.floor(Math.round(haircutPrice) / roundingStep) * roundingStep;
}

/**
 * Solve and analyze a Standard Seller Financing offer (pure seller carry: down payment
 * plus seller note equal 100% of the offer price — no bank/DSCR leg).
 *
 * The down payment is solved to the value that yields the target cash-on-cash return,
 * then capped at maxDownPercent. In the default 0%-interest structure the COCR falls as
 * the down payment rises (more cash for the same debt service), so:
 *   - if the target COCR is reachable at <= maxDownPercent down, that exact down is used
 *     (COCR lands on target);
 *   - otherwise the down is capped at maxDownPercent and the COCR comes in ABOVE target.
 * Either way the down never exceeds maxDownPercent and the COCR never falls below target
 * for a cash-flowing deal. A deal that cannot cash-flow even at the minimum down (COCR at
 * minDownPercent already below target) returns minDownPercent with its actual (poor) COCR.
 *
 * @param {number} noi - Annual net operating income
 * @param {number} price - Offer price the down payment and seller note are sized against
 * @param {Object} options - Term and target overrides (default to config constants)
 * @param {number} [options.amortizationYears] - Seller note amortization (years)
 * @param {number} [options.interestRate] - Seller note annual interest rate (decimal, e.g. 0.07)
 * @param {number} [options.maxDownPercent] - Down-payment ceiling (whole percent)
 * @param {number} [options.minDownPercent] - Down-payment floor (whole percent)
 * @param {number} [options.targetCOCR] - Target cash-on-cash return (whole percent)
 * @param {number} [options.yearsBalloon] - Balloon period (years)
 * @returns {{annualCashFlow:number, annualDebtService:number, balloonBalance:number, capped:boolean, cashFlowYield:number, cocr:number, downPaymentAmount:number, downPercent:number, monthlyPayment:number, sellerNoteAmount:number, solvedDownPercent:number, totalPaymentsToBalloon:number}}
 */
export function calculateSellerFinanceOffer(noi, price, options = {}) {
  const {
    amortizationYears = FINANCIAL_CONSTANTS.SELLER_FI_AMORTIZATION,
    interestRate = FINANCIAL_CONSTANTS.SELLER_FI_INTEREST_RATE,
    maxDownPercent = BUSINESS_CONSTANTS.SELLER_FINANCE_MAX_DOWN_PERCENT,
    minDownPercent = 1,
    targetCOCR = 15,
    yearsBalloon = FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS,
  } = options;

  const cocrAtDown = (downPercent) => {
    const downPaymentAmount = price * (downPercent / 100);
    const sellerNoteAmount = price * ((100 - downPercent) / 100);
    const monthlyPayment = sellerNoteAmount > 0 ? calculatePMT(sellerNoteAmount, interestRate, amortizationYears) : 0;
    const annualCashFlow = noi - monthlyPayment * 12;
    return downPaymentAmount > 0 ? (annualCashFlow / downPaymentAmount) * 100 : 0;
  };

  let solvedDownPercent;
  if (cocrAtDown(minDownPercent) <= targetCOCR) {
    solvedDownPercent = minDownPercent;
  } else {
    let low = minDownPercent;
    let high = 100;
    let iterations = 0;
    while (iterations < BUSINESS_CONSTANTS.MAX_ITERATIONS && high - low > 0.01) {
      const mid = (low + high) / 2;
      if (cocrAtDown(mid) < targetCOCR) {
        high = mid;
      } else {
        low = mid;
      }
      iterations++;
    }
    solvedDownPercent = (low + high) / 2;
  }

  const downPercent = Math.min(solvedDownPercent, maxDownPercent);
  const downPaymentAmount = price * (downPercent / 100);
  const sellerNoteAmount = price * ((100 - downPercent) / 100);
  const monthlyPayment = sellerNoteAmount > 0 ? calculatePMT(sellerNoteAmount, interestRate, amortizationYears) : 0;
  const annualDebtService = monthlyPayment * 12;
  const annualCashFlow = noi - annualDebtService;

  return {
    annualCashFlow,
    annualDebtService,
    balloonBalance: calculateBalloonBalance(sellerNoteAmount, interestRate, amortizationYears, yearsBalloon),
    capped: solvedDownPercent > maxDownPercent,
    cashFlowYield: price > 0 ? (annualCashFlow / price) * 100 : 0,
    cocr: downPaymentAmount > 0 ? (annualCashFlow / downPaymentAmount) * 100 : 0,
    downPaymentAmount,
    downPercent,
    monthlyPayment,
    sellerNoteAmount,
    solvedDownPercent,
    totalPaymentsToBalloon: annualDebtService * yearsBalloon,
  };
}

/**
 * Calculate net to buyer
 * @param {number} askingPrice - Property asking price
 * @param {Object} options - Configuration options (uses config constants as defaults)
 * @returns {number} Net to buyer amount
 */
export function calculateNetToBuyer(askingPrice, options = {}) {
  const {
    buyerCostPercent = BUSINESS_CONSTANTS.NET_TO_BUYER_PERCENTAGE * 100,
    sellerCostAssignment = BUSINESS_CONSTANTS.ASSIGNMENT_FEE_PERCENTAGE * 100,
    sellerCostClosing = BUSINESS_CONSTANTS.CLOSING_COSTS_PERCENTAGE * 100,
    additionalCostRehab = BUSINESS_CONSTANTS.REHAB_RATE * 100,
    additionalCostFinancing = BUSINESS_CONSTANTS.HARD_MONEY_RATE * 100,
    dscrLtvPercent = FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE * 100
  } = options;

  try {
    const dscrLoanAmount = askingPrice * (dscrLtvPercent / 100);
    
    return askingPrice * (buyerCostPercent / 100) - 
           askingPrice * ((sellerCostAssignment + sellerCostClosing) / 100) - 
           askingPrice * (additionalCostRehab / 100) - 
           (additionalCostFinancing / 100) * (askingPrice - dscrLoanAmount);
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate remaining loan balance at end of balloon period
 * @param {number} loanAmount - Initial loan amount
 * @param {number} interestRate - Annual interest rate as decimal (e.g., 0.075 for 7.5%)
 * @param {number} amortizationYears - Full amortization period in years
 * @param {number} balloonYears - Balloon period in years
 * @returns {number} Remaining balance at end of balloon period
 */
export function calculateBalloonBalance(loanAmount, interestRate, amortizationYears, balloonYears = FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS) {
  try {
    if (loanAmount <= 0 || interestRate < 0 || amortizationYears <= 0 || balloonYears <= 0) {
      return 0;
    }

    // If balloon period equals or exceeds amortization, loan is fully paid
    if (balloonYears >= amortizationYears) {
      return 0;
    }

    // Special handling for zero interest rate (simple linear paydown)
    if (interestRate === 0) {
      const totalPayments = amortizationYears * 12;
      const paymentsMade = balloonYears * 12;
      return loanAmount * (totalPayments - paymentsMade) / totalPayments;
    }

    const monthlyRate = interestRate / 12;
    const totalPayments = amortizationYears * 12;
    const balloonPayments = balloonYears * 12;

    // Calculate remaining balance using loan balance formula
    // Balance = P * [(1 + r)^n - (1 + r)^p] / [(1 + r)^n - 1]
    // Where P = principal, r = monthly rate, n = total payments, p = payments made
    
    const factor1 = Math.pow(1 + monthlyRate, totalPayments);
    const factor2 = Math.pow(1 + monthlyRate, balloonPayments);
    
    const remainingBalance = loanAmount * (factor1 - factor2) / (factor1 - 1);
    
    return Math.max(0, remainingBalance); // Ensure non-negative
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate property value after appreciation period
 * @param {number} currentValue - Current property value
 * @param {number} appreciationRate - Annual appreciation rate as decimal
 * @param {number} years - Number of years
 * @returns {number} Appreciated property value
 */
export function calculateAppreciatedValue(currentValue, appreciationRate = FINANCIAL_CONSTANTS.APPRECIATION_RATE, years = FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS) {
  try {
    if (currentValue <= 0 || appreciationRate < 0 || years < 0) {
      return currentValue;
    }
    
    return currentValue * Math.pow(1 + appreciationRate, years);
  } catch (error) {
    return currentValue;
  }
}

/**
 * Calculate cash out amount after appreciation refinance
 * @param {number} originalPrice - Original purchase price
 * @param {number} dscrLoanAmount - Original DSCR loan amount  
 * @param {number} sellerFiAmount - Original seller financing amount
 * @param {Object} options - Configuration options
 * @returns {number} Cash out amount (positive = cash out, negative = cash in)
 */
export function calculateCashOutAfterRefi(originalPrice, dscrLoanAmount, sellerFiAmount, options = {}) {
  const {
    appreciationRate = FINANCIAL_CONSTANTS.APPRECIATION_RATE,
    balloonYears = FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS,
    dscrRate = DEFAULT_TIER.rate,
    dscrTerm = DEFAULT_TIER.amortization,
    sellerFiTerm = FINANCIAL_CONSTANTS.SELLER_FI_AMORTIZATION,
    refiLtvPercent = 70 // 70% LTV on refi
  } = options;

  try {
    // Calculate appreciated property value
    const appreciatedValue = calculateAppreciatedValue(originalPrice, appreciationRate, balloonYears);
    
    // Calculate remaining balance on DSCR loan
    const dscrRemainingBalance = calculateBalloonBalance(dscrLoanAmount, dscrRate, dscrTerm, balloonYears);
    
    // Calculate remaining balance on seller financing (0% interest)
    const sellerFiRemainingBalance = calculateBalloonBalance(sellerFiAmount, FINANCIAL_CONSTANTS.SELLER_FI_INTEREST_RATE, sellerFiTerm, balloonYears);
    
    // Total remaining debt
    const totalRemainingDebt = dscrRemainingBalance + sellerFiRemainingBalance;
    
    // Calculate new loan amount at 70% LTV of appreciated value
    const newLoanAmount = appreciatedValue * (refiLtvPercent / 100);
    
    // Cash out = new loan - total remaining debt
    const cashOut = newLoanAmount - totalRemainingDebt;
    
    return cashOut;
  } catch (error) {
    return 0;
  }
}

// Cash Flow calculation (matching loopnet-analyzer exactly)
export function calculateCashFlow(monthlyNOI, dscrPayment, sfPayment) {
  return monthlyNOI - (dscrPayment + sfPayment);
}

/**
 * Calculate discount percentage from asking price and offered price
 * @param {number} askingPrice - Property asking price
 * @param {number} priceOffered - Offered price
 * @returns {number} Discount as decimal (positive = discount, negative = premium)
 */
export function calculateDiscountFromPrice(askingPrice, priceOffered) {
  if (!askingPrice || askingPrice <= 0) return 0;
  
  return (askingPrice - priceOffered) / askingPrice;
}

/**
 * Calculate price from asking price and discount percentage
 * @param {number} askingPrice - Property asking price  
 * @param {number} discountPercent - Discount as decimal (positive = discount, negative = premium)
 * @returns {number} Calculated price
 */
export function calculatePriceFromDiscount(askingPrice, discountPercent) {
  if (!askingPrice || askingPrice <= 0) return 0;
  
  return askingPrice * (1 - discountPercent);
}

export function safePercentage(value, fallback = 100) {
  return (value != null && !isNaN(value)) ? (value * 100) : fallback;
}
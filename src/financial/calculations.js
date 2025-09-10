// src/financial/calculations.js

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
 * Calculate the property price that yields a target COCR percentage
 * @param {number} noi - Net Operating Income (annual)
 * @param {number} targetCOCR - Target COCR as decimal (e.g., 0.15 for 15%)
 * @param {Object} options - Configuration options
 * @param {number} options.downPercent - Down payment percentage (default: 30)
 * @param {number} options.dscrLtvPercent - DSCR loan LTV percentage (default: 70)
 * @param {number} options.dscrRate - DSCR interest rate as decimal (default: 0.075)
 * @param {number} options.dscrTerm - DSCR loan term in years (default: 30)
 * @param {number} options.maxIterations - Maximum iterations for convergence (default: 50)
 * @param {number} options.tolerance - Convergence tolerance (default: 0.001)
 * @returns {number} Calculated property price
 */
export function calculatePriceForCOCR(noi, targetCOCR = 0.15, options = {}) {
  const {
    downPercent = 30,
    dscrLtvPercent = 70,
    dscrRate = 0.075,
    dscrTerm = 30,
    maxIterations = 50,
    tolerance = 0.001
  } = options;

  try {
    // Initial estimate: NOI / 8% cap rate
    let targetPrice = noi / 0.08;
    let iterations = 0;
    
    while (iterations < maxIterations) {
      const cashInvested = targetPrice * (downPercent / 100);
      const dscrLoanAmount = targetPrice * (dscrLtvPercent / 100);
      const dscrPayment = calculatePMT(dscrLoanAmount, dscrRate, dscrTerm) * 12;
      const annualCashFlow = noi - dscrPayment;
      const currentCOCR = annualCashFlow / cashInvested;
      
      if (Math.abs(currentCOCR - targetCOCR) < tolerance) {
        return targetPrice;
      }
      
      const error = currentCOCR - targetCOCR;
      const adjustment = error * 0.5;
      
      if (error > 0) {
        targetPrice = targetPrice * (1 + Math.abs(adjustment));
      } else {
        targetPrice = targetPrice * (1 - Math.abs(adjustment));
      }
      
      // Reasonable bounds
      if (targetPrice < 10000) targetPrice = 10000;
      if (targetPrice > noi * 50) targetPrice = noi * 20;
      
      iterations++;
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
 * @param {Object} options - Configuration options
 * @param {number} options.dscrLtvPercent - DSCR loan LTV percentage (default: 70)
 * @param {number} options.sellerFiPercent - Seller financing percentage (default: 0)
 * @param {number} options.dscrRate - DSCR interest rate as decimal (default: 0.075)
 * @param {number} options.dscrTerm - DSCR loan term in years (default: 30)
 * @param {number} options.sellerFiTerm - Seller financing term in years (default: 30)
 * @returns {number} COCR percentage
 */
export function calculateCOCRAtPercent(askingPrice, noi, downPercent, options = {}) {
  const {
    dscrLtvPercent = 70,
    sellerFiPercent = 0,
    dscrRate = 0.075,
    dscrTerm = 30,
    sellerFiTerm = 30
  } = options;

  try {
    const downDecimal = downPercent / 100;
    const cashInvested = askingPrice * downDecimal;
    
    const dscrLoanAmount = askingPrice * (dscrLtvPercent / 100);
    const dscrPayment = calculatePMT(dscrLoanAmount, dscrRate, dscrTerm) * 12;
    
    const sellerFiAmount = askingPrice * (sellerFiPercent / 100);
    const jvPayment = calculatePMT(sellerFiAmount, 0, sellerFiTerm) * 12;
    
    const annualCashFlow = noi - dscrPayment - jvPayment;
    const cocr = (annualCashFlow / cashInvested) * 100;
    
    return cocr;
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate NOI based on property type
 * @param {number} askingPrice - Property asking price
 * @param {number} capRate - Cap rate as decimal (e.g., 0.08 for 8%)
 * @param {string} propertyType - Property type: "multifamily", "str", "assisted"
 * @param {Object} options - Configuration options
 * @param {number} options.strGrossIncomeMultiplier - STR gross income multiplier (default: 0.10)
 * @param {number} options.strExpenseRatio - STR expense ratio (default: 0.45)
 * @param {number} options.assistedIncomePerBedroom - Monthly income per bedroom for assisted living (default: 1500)
 * @param {number} options.bedroomCount - Number of bedrooms for assisted living (default: 4)
 * @returns {number} Calculated NOI
 */
export function calculateNOIByType(askingPrice, capRate, propertyType = "multifamily", options = {}) {
  const {
    strGrossIncomeMultiplier = 0.10,
    strExpenseRatio = 0.45,
    assistedIncomePerBedroom = 1500,
    bedroomCount = 4
  } = options;

  try {
    switch (propertyType.toLowerCase()) {
      case "str":
        // STR calculation: price * 10% gross income * 55% net ratio
        const estimatedGrossIncome = askingPrice * strGrossIncomeMultiplier;
        return estimatedGrossIncome * (1 - strExpenseRatio);
        
      case "assisted":
        // Assisted living: bedrooms * $1500/month * 12 months
        return bedroomCount * assistedIncomePerBedroom * 12;
        
      case "multifamily":
      default:
        // Standard multifamily: asking price * cap rate
        return askingPrice * capRate;
    }
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate assignment fee
 * @param {number} askingPrice - Property asking price
 * @param {number} assignmentPercent - Assignment fee percentage (default: 5)
 * @returns {number} Assignment fee amount
 */
export function calculateAssignmentFee(askingPrice, assignmentPercent = 5) {
  try {
    return askingPrice * (assignmentPercent / 100);
  } catch (error) {
    return 0;
  }
}

/**
 * Calculate net to buyer
 * @param {number} askingPrice - Property asking price
 * @param {Object} options - Configuration options
 * @param {number} options.buyerCostPercent - Buyer cost percentage (default: 10)
 * @param {number} options.sellerCostPercent - Seller cost percentage (default: 6.25)
 * @param {number} options.additionalCostPercent - Additional cost percentage (default: 3)
 * @param {number} options.dscrLtvPercent - DSCR loan LTV percentage for calculation (default: 70)
 * @returns {number} Net to buyer amount
 */
export function calculateNetToBuyer(askingPrice, options = {}) {
  const {
    buyerCostPercent = 10,
    sellerCostPercent = 6.25,
    additionalCostPercent = 3,
    dscrLtvPercent = 70
  } = options;

  try {
    const dscrLoanAmount = askingPrice * (dscrLtvPercent / 100);
    
    return askingPrice * (buyerCostPercent / 100) - 
           askingPrice * (sellerCostPercent / 100) - 
           (additionalCostPercent / 100) * (askingPrice - dscrLoanAmount);
  } catch (error) {
    return 0;
  }
}
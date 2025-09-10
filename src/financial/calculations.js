// src/financial/calculations.js

import { FINANCIAL_CONSTANTS } from '../config/financial.js';
import { BUSINESS_CONSTANTS } from '../config/business.js';
import { PROPERTY_TYPE_CONSTANTS, PROPERTY_TYPES } from '../config/property-types.js';


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
 * @param {number} targetCOCR - Target COCR as decimal (default: 0.15 for 15%)
 * @param {Object} options - Configuration options (uses config constants as defaults)
 * @returns {number} Calculated property price
 */
export function calculatePriceForCOCR(noi, targetCOCR = 0.15, options = {}) {
  const {
    downPercent = FINANCIAL_CONSTANTS.DEFAULT_DOWN_PAYMENT * 100,
    dscrLtvPercent = FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE * 100,
    dscrRate = FINANCIAL_CONSTANTS.DSCR_INTEREST_RATE,
    dscrTerm = FINANCIAL_CONSTANTS.DSCR_AMORTIZATION,
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
    dscrLtvPercent = FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE * 100,
    sellerFiPercent = 0,
    dscrRate = FINANCIAL_CONSTANTS.DSCR_INTEREST_RATE,
    dscrTerm = FINANCIAL_CONSTANTS.DSCR_AMORTIZATION,
    sellerFiTerm = FINANCIAL_CONSTANTS.SELLER_FI_AMORTIZATION
  } = options;

  try {
    const downDecimal = downPercent / 100;
    const cashInvested = askingPrice * downDecimal;
    
    // Fix financing structure: seller financing reduces available DSCR loan
    const sellerFiAmount = askingPrice * (sellerFiPercent / 100);
    const availableDscrPercent = Math.max(0, dscrLtvPercent - sellerFiPercent);
    const dscrLoanAmount = askingPrice * (availableDscrPercent / 100);
    
    const dscrPayment = calculatePMT(dscrLoanAmount, dscrRate, dscrTerm) * 12;
    const jvPayment = calculatePMT(sellerFiAmount, FINANCIAL_CONSTANTS.SELLER_FI_INTEREST_RATE, sellerFiTerm) * 12;
    
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
 * @param {string} propertyType - Property type from PROPERTY_TYPES
 * @param {Object} options - Configuration options (uses config constants as defaults)
 * @returns {number} Calculated NOI
 */
export function calculateNOIByType(askingPrice, capRate, propertyType = PROPERTY_TYPES.MULTIFAMILY, options = {}) {
  const {
    strGrossIncomeMultiplier = PROPERTY_TYPE_CONSTANTS.STR.ESTIMATED_GROSS_RATE,
    strNoiPercentage = PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE,
    assistedIncomePerBedroom = PROPERTY_TYPE_CONSTANTS.ASSISTED_LIVING.INCOME_PER_BEDROOM_MONTHLY,
    bedroomCount = PROPERTY_TYPE_CONSTANTS.ASSISTED_LIVING.DEFAULT_BEDROOM_COUNT
  } = options;

  try {
    switch (propertyType.toLowerCase()) {
      case PROPERTY_TYPES.STR:
        const estimatedGrossIncome = askingPrice * strGrossIncomeMultiplier;
        return estimatedGrossIncome * strNoiPercentage;
        
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




  async function calculateNOIByType(askingPrice, capRate, propertyType, address) {
    switch (propertyType) {
      case "str":
        const strNOI = await calculateSTRNOI(address);
        return strNOI || (askingPrice * capRate);
        
      case "assisted":
        const bedrooms = extractBedrooms();
        return bedrooms * PROPERTY_TYPES.ASSISTED_LIVING.INCOME_PER_BEDROOM_MONTHLY * 12;
        
      case "multifamily":
      default:
        return askingPrice * capRate;
    }
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
    additionalCostRehab = BUSINESS_CONSTANTS.REHAB_PERCENTAGE * 100,
    additionalCostFinancing = BUSINESS_CONSTANTS.FINANCING_FEE_PERCENTAGE * 100,
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
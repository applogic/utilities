/**
 * Financial calculation constants
 */

export const FINANCIAL_CONSTANTS = {
  // Interest rates
  DSCR_INTEREST_RATE: 0.075,        // 7.5%
  SELLER_FI_INTEREST_RATE: 0.0,     // 0% for seller financing
  
  // Loan terms and amortization
  DSCR_AMORTIZATION: 30,             // 30 years
  SELLER_FI_AMORTIZATION: 30,        // 30 years
  DEFAULT_BALLOON_PERIOD_YEARS: 7,   // 7 years
  
  // Down payments and financing structure
  DEFAULT_DOWN_PAYMENT: 0.30,        // 30%
  SELLER_FI_DOWN_PAYMENT: 0.60,      // 60%
  SELLER_FI_CARRY: 0.40,             // 40% seller financing
  MIN_DOWN_PAYMENT_PERCENT: 0,       // 0% minimum down
  
  // DSCR loan percentages
  DEFAULT_DSCR_PERCENTAGE: 0.70,     // 70%
  MAX_DSCR_PERCENTAGE: 0.70,         // Maximum DSCR loan
  
  // Cap rates
  DEFAULT_CAP_RATE: 0.05,            // 5% default cap rate
  MAX_ESTIMATED_CAP_RATE: 20,        // 20% maximum cap rate
  
  // Market assumptions
  APPRECIATION_RATE: 0.045,          // 4.5% annual appreciation
};

// Convenience exports for common calculations
export const {
  DSCR_INTEREST_RATE,
  SELLER_FI_INTEREST_RATE,
  DSCR_AMORTIZATION,
  SELLER_FI_AMORTIZATION,
  DEFAULT_DOWN_PAYMENT,
  SELLER_FI_DOWN_PAYMENT,
  SELLER_FI_CARRY,
  DEFAULT_DSCR_PERCENTAGE,
  DEFAULT_CAP_RATE,
  MAX_ITERATIONS,
  CALCULATION_TOLERANCE
} = FINANCIAL_CONSTANTS;

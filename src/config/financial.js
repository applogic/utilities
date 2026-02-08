/**
 * Financial calculation constants
 */

export const FINANCIAL_CONSTANTS = {
  // Interest rate tier system (replaces old DSCR_INTEREST_RATE / DSCR_AMORTIZATION)
  DEFAULT_INTEREST_RATE_TYPE: "dscr_residential",
  INTEREST_RATE_TIERS: {
    commercial: { amortization: 25, closingRange: "45-60 days", inspectionDays: 60, label: "Commercial", rate: 0.10 },
    dscr_commercial: { amortization: 30, closingRange: "45-60 days", inspectionDays: 60, label: "DSCR Commercial", rate: 0.10 },
    dscr_residential: { amortization: 30, closingRange: "45-60 days", inspectionDays: 30, label: "DSCR Residential", rate: 0.08 },
    mixed_use: { amortization: 25, closingRange: "45-60 days", inspectionDays: 60, label: "Mixed Use", rate: 0.10 },
    rv_park: { amortization: 25, closingRange: "45-60 days", inspectionDays: 60, label: "RV Park", rate: 0.11 },
  },

  // Seller financing
  SELLER_FI_INTEREST_RATE: 0.0,     // 0% for seller financing
  SELLER_FI_AMORTIZATION: 30,        // 30 years

  // Loan terms
  DEFAULT_BALLOON_PERIOD_YEARS: 7,   // 7 years

  // Down payments and financing structure
  DEFAULT_DOWN_PAYMENT: 0.30,        // 30%
  SELLER_FI_DOWN_PAYMENT: 0.60,      // 60%
  SELLER_FI_CARRY: 0.40,             // 40% seller financing
  MIN_DOWN_PAYMENT_PERCENT: 0,       // 0% minimum down
  DEFAULT_EQUITY_ESTIMATE: 0.40,     // 40% seller equity

  // DSCR loan percentages
  DEFAULT_DSCR_PERCENTAGE: 0.70,     // 70%
  MAX_DSCR_PERCENTAGE: 0.70,         // Maximum DSCR loan

  // Cap rates
  DEFAULT_CAP_RATE: 0.05,            // 5% default cap rate
  MAX_ESTIMATED_CAP_RATE: 25,        // 20% maximum cap rate

  // Market assumptions
  APPRECIATION_RATE: 0.045,          // 4.5% annual appreciation
  NOI_APPRECIATION: 0.02,           // 2% annual NOI appreciation
};

// Convenience exports for common calculations
export const {
  CALCULATION_TOLERANCE,
  DEFAULT_CAP_RATE,
  DEFAULT_DOWN_PAYMENT,
  DEFAULT_DSCR_PERCENTAGE,
  DEFAULT_EQUITY_ESTIMATE,
  DEFAULT_INTEREST_RATE_TYPE,
  INTEREST_RATE_TIERS,
  MAX_ITERATIONS,
  SELLER_FI_AMORTIZATION,
  SELLER_FI_CARRY,
  SELLER_FI_DOWN_PAYMENT,
  SELLER_FI_INTEREST_RATE,
} = FINANCIAL_CONSTANTS;

export function determineInterestRateType(propertyType, numberOfUnits = 4) {
  if (propertyType === "rv_park") return "rv_park";
  if (propertyType === "mixed_use") return "mixed_use";
  if (propertyType === "business" || propertyType === "commercial") return "commercial";
  if ((propertyType === "mfr" || propertyType === "multifamily") && numberOfUnits >= 5) return "dscr_commercial";
  return "dscr_residential";
}

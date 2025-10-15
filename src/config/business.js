/**
 * Business logic and fee constants
 */

import { getEnvVar } from "../environment/utilities.js";

export const BUSINESS_CONSTANTS = {
  // Assignment and transaction fees
  ASSIGNMENT_FEE_PERCENTAGE: 0.05,    // 5% assignment fee
  NET_TO_BUYER_PERCENTAGE: 0.10,      // 10% net to buyer
  CLOSING_COSTS_PERCENTAGE: 0.0125,   // 1.25% closing costs
  HARD_MONEY_RATE: 0.03,     // 3% financing fee
  REHAB_RATE: 0.0,              // 0% rehab fee
  
  // Agent commissions
  SELLER_AGENT_COMMISSION: 0.025,      // 3% seller agent commission
  BUYER_AGENT_COMMISSION: 0.025,       // 3% buyer agent commission
  
  // COCR15 price calculation limits
  MINIMUM_COCR15_PRICE: 10000,                    // $10,000 minimum
  MAX_COCR15_PRICE_MULTIPLIER: 50,                // Maximum price as multiple of NOI
  CONSERVATIVE_COCR15_PRICE_MULTIPLIER: 20,       // Conservative price limit
  
  // Algorithm parameters (duplicated for business logic context)

  
  // Calculation parameters
  MAX_ITERATIONS: 50,                // Maximum iterations for iterative calculations
  CALCULATION_TOLERANCE: 0.001,      // Tolerance for convergence
  ADJUSTMENT_FACTOR: 0.5,            // Adjustment factor for iterations


  
  // URL constants - safe for both Node.js and browser
  EXPORT_URL_BASE: getEnvVar(
    "EXPORT_URL_BASE",
    "https://app.archerjessop.com/property-dashboard/import"
  ),
  EXCLUDED_EXPORT_VALUES: ["Loading...", "Not found", "", null, undefined],
  DASHBOARD_URL_BASE: getEnvVar(
    "DASHBOARD_URL_BASE",
    "https://app.archerjessop.com/property-dashboard/"
  ),
  
};

// Convenience exports for commonly used values
export const {
  ASSIGNMENT_FEE_PERCENTAGE,
  NET_TO_BUYER_PERCENTAGE,
  CLOSING_COSTS_PERCENTAGE,
  HARD_MONEY_RATE,
  SELLER_AGENT_COMMISSION,
  BUYER_AGENT_COMMISSION,
  MINIMUM_COCR15_PRICE,
  MAX_COCR15_PRICE_MULTIPLIER,
  CONSERVATIVE_COCR15_PRICE_MULTIPLIER,
  REHAB_RATE,
} = BUSINESS_CONSTANTS;

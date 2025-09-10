/**
 * Property type specific constants
 */

export const PROPERTY_TYPE_CONSTANTS = {
  // Short-term rental (STR) calculations
  STR: {
    ESTIMATED_GROSS_RATE: 0.10,     // 10% of price
    NOI_PERCENTAGE: 0.55,           // 55% of gross income
    DEFAULT_CAP_RATE: 0.05,         // 5% default cap rate
  },
  
  // Assisted living calculations
  ASSISTED_LIVING: {
    INCOME_PER_BEDROOM_MONTHLY: 1500,  // $1,500 per bedroom per month
    DEFAULT_BEDROOM_COUNT: 10,         // Default assumption
    DEFAULT_CAP_RATE: 0.05,            // 5% default cap rate
  },
  
  // Multifamily calculations
  MULTIFAMILY: {
    DEFAULT_CAP_RATE: 0.05,            // 5% default cap rate
  },
};

// Property type enum for consistency
export const PROPERTY_TYPES = {
  MULTIFAMILY: 'multifamily',
  STR: 'str',
  ASSISTED_LIVING: 'assisted',
};

// Convenience exports
export const {
  STR,
  ASSISTED_LIVING,
  MULTIFAMILY
} = PROPERTY_TYPE_CONSTANTS;

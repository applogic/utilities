/**
 * @archerjessop/utilities
 * Shared utilities for ArcherJessop property analysis tools
 */

// Financial calculations
export { 
  calculatePMT, 
  calculateCOCR30, 
  calculateCashFlowYield,
  calculatePriceForCOCR,
  calculateCOCRAtPercent,
  calculateNOIByType,
  calculateAssignmentFee,
  calculateNetToBuyer
 } from "./financial/calculations.js";

// Financial formatters
export { formatCurrency, formatPriceValue, formatPercentage } from "./financial/formatters.js";

// Data extractors
export { extractPhoneNumber, extractBedrooms } from "./data/extractors.js";

// Date utilities
export { calculateDOM } from "./date/utilities.js";

// Configuration constants
export * from './config/financial.js';
export * from './config/property-types.js';
export * from './config/business.js';

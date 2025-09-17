/**
 * @archerjessop/utilities
 * Shared utilities for ArcherJessop property analysis tools
 */

// Financial calculations
export { 
  calculateAppreciatedValue,
  calculateAssignmentFee,
  calculateBalloonBalance,
  calculateCashFlow,
  calculateCashFlowYield,
  calculateCashOutAfterRefi,
  calculateCOCR30, 
  calculateCOCRAtPercent,
  calculateDiscountFromPrice,
  calculateDscrPayment,
  calculateNetToBuyer,
  calculateNOIByType,
  calculatePMT, 
  calculatePriceForCOCR,
  calculatePriceFromDiscount,
  calculateSfPayment,
} from "./financial/calculations.js";

// Financial formatters
export { formatCurrency, formatPriceValue, formatPercentage } from "./financial/formatters.js";

// Data extractors
export { extractPhoneNumber, extractBedrooms } from "./data/extractors.js";

// Date utilities
export { calculateDOM } from "./date/utilities.js";

// Formatting utilities
export { 
  calculateCursorPosition,
  extractNumericValue,
  filterNumericInput,
  formatInputDisplay,
  formatLiveInput,
  formatLiveNumber,
  parseNumericInput
} from "./formatting/financial-formatting.js";

// Text formatting utilities
export { normalizeWhitespace } from "./formatting/text.js";

// Configuration constants
export * from './config/financial.js';
export * from './config/property-types.js';
export * from './config/business.js';

export const STYLES_PATH = './dist/styles/base.css';

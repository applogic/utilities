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
  calculateCashOfferPrice,
  calculateCashOutAfterRefi,
  calculateCOCR30, 
  calculateCOCRAtPercent,
  calculateDiscountFromPrice,
  calculateNetToBuyer,
  calculateNOIByType,
  calculatePMT,
  calculatePriceForCOCR,
  calculatePriceFromDiscount,
  calculateSTRNOI,
  equityPercentFromDebt,
  resolveListingFinancials,
  safePercentage,
} from "./financial/calculations.js";

// Equity Carry scoring engine (pure; scores scraped listings into deal pools)
export { EQUITY_CARRY_TIERS, calculateEquityCarryScore } from "./financial/equity-carry.js";

// Agnostic debt service (pure IO; Node + browser)
export { fetchDebt } from "./services/debt.js";

// Financial formatters
export { formatCurrency, formatPriceValue, formatPercentage } from "./financial/formatters.js";

// Export logic (pure export-object creation)
export {
  calculateOriginalPrice,
  convertCapRateToDecimal,
  createExportObjectCore,
  formatDownPaymentPercent,
  mapPropertyType,
} from "./export/export-logic.js";

// Date utilities
export { calculateDOM, formatDate } from "./date/utilities.js";

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
export * from "./config/financial.js";
export * from "./config/property-types.js";
export * from "./config/business.js";

export const STYLES_PATH = "./dist/styles/base.css";

// LOI Lookup service and config
export { lookupLOI } from "./services/loi-lookup.js";
export { LOI_LOOKUP_CONFIG, MATCH_TYPES, LOI_SENT_STATUS } from "./config/loi-lookup.js";

// Environment utilities
export { 
  getEnvVar, 
  isNodeEnvironment, 
  isBrowserEnvironment 
} from "./environment/utilities.js";
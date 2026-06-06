/**
 * @archerjessop/utilities/browser
 * Browser-only shared code for the property analyzers (Chrome content scripts).
 * Depends on the DOM and @floating-ui/dom; never import this from Node code.
 */

/**
 * The listing contract scraped by each analyzer's per-platform extractData().
 * Every field is a string; missing values default to the literal "Not found".
 *
 * @typedef {Object} Listing
 * @property {string} name        Property address / title (default "Not found")
 * @property {string} price       Asking price as displayed, e.g. "$849,999" (default "Not found")
 * @property {string} capRate     Cap rate as displayed, e.g. "6.5%" or "7%*" (default "Not found")
 * @property {string} contact     Broker / contact name (default "Not found")
 * @property {string} phone       Contact phone number (default "Not found")
 * @property {string} listingDate Date listed as displayed (default "Not found")
 */

/**
 * A declarative "click to reveal" step for an adapter's config.reveals. The engine runs these
 * (runReveals) before scrape() so gated data (broker phone/email, OM access) is in the DOM.
 *
 * @typedef {Object} Reveal
 * @property {string} [name]    Label for logging only.
 * @property {string} trigger   CSS selector for the element to click (comma lists allowed).
 * @property {string} [waitFor] CSS selector the click reveals; also the idempotency guard
 *                              (present => already revealed, skip the click).
 * @property {number} [timeout] ms to wait for waitFor (or a fixed delay when waitFor is absent).
 */

// Data extractors (DOM)
export { extractBedrooms, extractPhoneNumber } from "./data/extractors.js";

// Tooltip calculations
export {
  calculateCashFlowTooltip,
  calculateDownPaymentTooltip,
  parseCashFlowData,
  parseFinancialData,
} from "./financial/tooltip-calculations.js";

// Tooltip content generators
export {
  generateCapRateTooltipHTML,
  generateCashFlowTooltipHTML,
  generateDownPaymentTooltipHTML,
  generatePriceTooltipHTML,
} from "./financial/tooltip-content-generators.js";

// Click handlers
export {
  setupCapRateClickHandler,
  setupDiscountButtonHandler,
  setupDownPaymentClickHandler,
  setupPriceClickHandler,
} from "./ui/click-handlers.js";

// Tooltip configuration
export { CLICKABLE_TOOLTIPS, TOOLTIP_ENABLED_METRICS } from "./ui/tooltip-config.js";

// Tooltip manager
export {
  attachTooltip,
  hasTooltip,
  isTooltipVisible,
  removeAllTooltips,
  removeTooltip,
  updateTooltipContent,
} from "./ui/tooltip-manager.js";

// Widget builders
export { createNavigationGuard } from "./widget/createNavigationGuard.js";
export { createPanel } from "./widget/createPanel.js";
export { runReveals } from "./widget/runReveals.js";

// Analyzer engine — a site becomes a thin adapter; the engine owns everything else.
export { createAnalyzer } from "./widget/createAnalyzer.js";
export { createAnalyzerState } from "./widget/createAnalyzerState.js";
export { calculateFinancials } from "./financial/calculateFinancials.js";

// Agnostic services (pure IO; the engine orchestrates caching / loading / stale-drop)
export { fetchDebt } from "../services/debt.js";
export { fetchStrRevenue } from "./services/str-revenue.js";

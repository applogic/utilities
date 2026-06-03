// Per-analyzer state factory. Replaces each repo's global-state.js singleton with an
// isolated ctx ({ state, updateState, resetForNavigation }) the engine threads through its
// pipeline. Two analyzers (or two test cases) get independent state — no shared module
// singleton to bleed between them.
//
// The initial values and the resetForNavigation enumeration are lifted verbatim from
// zillow-analyzer/state/global-state.js (the green copy). resetForNavigation clears the
// per-listing memoized values that the SPA stale-state bug (H1) hinges on, and PRESERVES the
// session-sticky user choices (property type, interest-rate tier, the down/DSCR/seller-FI
// percentages) across a navigation.

import { FINANCIAL_CONSTANTS } from "../../config/financial.js";
import { PROPERTY_TYPES } from "../../config/property-types.js";

export function createAnalyzerState({ defaultPropertyType = PROPERTY_TYPES.MULTIFAMILY } = {}) {
  const state = {
    // Financial percentages (session-sticky — preserved across navigation)
    currentDownPaymentPercent: FINANCIAL_CONSTANTS.SELLER_FI_DOWN_PAYMENT * 100,
    currentDSCRPercent: FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE * 100,
    currentSellerFiPercent: FINANCIAL_CONSTANTS.SELLER_FI_CARRY * 100,

    // Price state
    currentPriceDiscount: 0,
    originalPrice: null,
    priceWasDefaulted: false,

    // Property and cap rate state. currentEstimatedCapRate is a WHOLE-NUMBER percent (the
    // calc divides it by 100, and parsed page caps like "6%*" land as 6) — so the default
    // estimate is DEFAULT_CAP_RATE * 100 = 5, NOT the decimal 0.05. Storing the decimal here
    // was the latent no-cap bug (NOI computed at 0.05%); the engine's cap path matches this.
    currentPropertyType: defaultPropertyType,
    isUsingEstimatedCapRate: false,
    currentEstimatedCapRate: FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE * 100,
    originalEstimatedCapRate: FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE * 100,
    originalCapRate: null,
    originalMultifamilyCapRate: null,
    capRateAlreadyDetermined: false,

    // Cache state
    baseNOI: null,
    cachedSTRData: null,
    cachedStrValue: null,
    cachedLoiData: {},
    cachedEquity: null,

    // UI state
    phoneButtonClicked: false,
    equityLoadingStartTime: null,
    equitySource: "estimated",

    // Property details
    currentInterestRateType: "dscr_residential",
    numberOfUnits: 4,
  };

  const updateState = (updates) => {
    Object.assign(state, updates);
  };

  // Full enumerated reset for SPA navigation between listings (H1, CRITICAL).
  // Without clearing the memoized per-listing values, listing B silently shows listing A's
  // numbers (baseNOI/originalPrice/cap-rate are guarded by `if (!state.x)`, so stale
  // A-values survive). Session-sticky user choices are intentionally preserved.
  const resetForNavigation = () => {
    Object.assign(state, {
      baseNOI: null,
      cachedEquity: null,
      cachedLoiData: {},
      cachedSTRData: null,
      cachedStrValue: null,
      capRateAlreadyDetermined: false,
      currentEstimatedCapRate: FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE * 100,
      currentPriceDiscount: 0,
      isUsingEstimatedCapRate: false,
      numberOfUnits: 4,
      originalCapRate: null,
      originalEstimatedCapRate: FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE * 100,
      originalMultifamilyCapRate: null,
      originalPrice: null,
      phoneButtonClicked: false,
      priceWasDefaulted: false,
    });
  };

  return { state, updateState, resetForNavigation };
}

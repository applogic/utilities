// The one shared financial orchestrator for every property analyzer.
//
// Hoisted BYTE-IDENTICAL from zillow-analyzer's dom-utils.js calculateFinancials (the
// green, proven copy). The ONLY change is state threading: the per-repo `state` /
// `updateState` module singletons become an injected `ctx` ({ state, updateState }) so
// this lives in @archerjessop/utilities and is shared by both analyzers. The math,
// branches, side effects (window.lastFinancialCalculation), and return shape are unchanged
// — equivalence is proven when Zillow imports this and its suite stays green (T6).

import {
  calculateAssignmentFee,
  calculateCOCRAtPercent,
  calculateNetToBuyer,
  calculateNOIByType,
  calculatePMT,
  calculatePriceForCOCR,
} from "../../financial/calculations.js";
import { formatCurrency, formatPercentage, formatPriceValue } from "../../financial/formatters.js";
import { FINANCIAL_CONSTANTS } from "../../config/financial.js";

export async function calculateFinancials(ctx, priceText, capRateText, propertyType, _address) {
  const { state, updateState } = ctx;
  try {
    // Parse asking price - but use original price for NOI calculation
    const priceMatch = priceText.match(/[\d,]+/);
    if (!priceMatch) return null;

    const askingPrice = parseFloat(priceMatch[0].replace(/,/g, ""));

    // Display guard (H2): a zero/non-finite price would push NOI->0 and COCR->NaN/Infinity.
    // Refuse to underwrite it; callers paint "N/A" instead.
    if (!Number.isFinite(askingPrice) || askingPrice <= 0) return null;

    // Get original price for NOI calculation
    const originalPriceMatch = state.originalPrice?.match(/[\d,]+/);
    const originalPriceValue = originalPriceMatch ? parseFloat(originalPriceMatch[0].replace(/,/g, "")) : askingPrice;

    const capRateMatch = capRateText.match(/[\d.]+/);
    if (!capRateMatch) return null;

    const capRate = parseFloat(capRateMatch[0]) / 100;

    let noi;

    // Calculate NOI based on ORIGINAL price and cap rate, not discounted price
    if (propertyType === "str" && state.cachedSTRData) {
      noi = state.cachedSTRData;
    } else {
      if (!state.baseNOI) {
        // Assisted-living NOI is bedrooms x income x 12. The bedroom count comes from the
        // footer beds field (numberOfUnits) — the units input is relabeled "beds" when
        // assisted is selected and pre-filled from any count detected on the page. Because it
        // is always visible and editable, the assumed count is never a hidden fabrication
        // (cf. the utilities extractBedrooms() silent default of 10 that H5 guarded against).
        let bedroomCount = null;
        if (propertyType === "assisted") {
          bedroomCount = state.numberOfUnits;
        }

        // Calculate baseNOI from original price
        let calculatedNOI;
        if (state.isUsingEstimatedCapRate) {
          const origCapRate = state.currentEstimatedCapRate / 100;
          calculatedNOI = calculateNOIByType(originalPriceValue, origCapRate, propertyType, {
            bedroomCount,
            strApiResult: state.cachedStrValue
          });
        } else {
          calculatedNOI = calculateNOIByType(originalPriceValue, capRate, propertyType, {
            bedroomCount,
            strApiResult: state.cachedStrValue
          });
        }
        updateState({ baseNOI: calculatedNOI });
      }

      noi = state.baseNOI; // Always use the original NOI calculation
    }

    const monthlyNOI = noi / 12;

    // Use discounted price for payment calculations
    const down = askingPrice * (state.currentDownPaymentPercent / 100);
    const dscrLoanAmount = askingPrice * (state.currentDSCRPercent / 100);
    const sellerFiAmount = askingPrice * (state.currentSellerFiPercent / 100);

    const assignment = calculateAssignmentFee(askingPrice);
    const netToBuyer = calculateNetToBuyer(askingPrice);

    const tier = FINANCIAL_CONSTANTS.INTEREST_RATE_TIERS[state.currentInterestRateType || "dscr_residential"];
    const dscr = calculatePMT(dscrLoanAmount, tier.rate, tier.amortization);
    const sfPayment = calculatePMT(sellerFiAmount, FINANCIAL_CONSTANTS.SELLER_FI_INTEREST_RATE, FINANCIAL_CONSTANTS.SELLER_FI_AMORTIZATION);

    const cashFlow = monthlyNOI - (dscr + sfPayment);

    const cocr30 = calculateCOCRAtPercent(askingPrice, noi, 30, {
      dscrLtvPercent: state.currentDSCRPercent,
      dscrRate: tier.rate,
      dscrTerm: tier.amortization,
      sellerFiPercent: state.currentSellerFiPercent
    });

    const priceForCOCR15 = calculatePriceForCOCR(noi, 0.15, {
      downPercent: FINANCIAL_CONSTANTS.DEFAULT_DOWN_PAYMENT * 100,
      dscrLtvPercent: FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE * 100,
      dscrRate: tier.rate,
      dscrTerm: tier.amortization
    });

    // Store for export
    window.lastFinancialCalculation = {
      rawCashFlow: cashFlow,
      rawPrice: askingPrice,
      rawNOI: noi
    };

    return {
      noi: formatCurrency(noi),
      down: formatCurrency(down),
      netToBuyer: formatCurrency(netToBuyer),
      sellerFi: formatCurrency(sellerFiAmount),
      cocr30: formatPercentage(cocr30),
      priceForCOCR15: formatPriceValue(priceForCOCR15),
      dscr: formatCurrency(dscr, true),
      sfPayment: formatCurrency(sfPayment, true),
      cashFlow: formatCurrency(cashFlow, true),
      assignment: formatCurrency(assignment),
      rawCashFlow: cashFlow,
      rawDown: down,
      rawPrice: askingPrice,
      rawNOI: noi,
    };
  } catch (error) {
    console.error("Error calculating financials:", error);
    return null;
  }
}

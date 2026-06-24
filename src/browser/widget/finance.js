// Finance unit (orchestration): applies cap-rate provenance to ctx, applies the scrape-derived
// state, and recomputes the financial metrics. The pure rules live in financial/capRate.js; this
// module is the thin state/DOM glue around them. Extracted verbatim from createAnalyzer (T12).

import { computeManualOverrideNOI, resolveCapRateProvenance } from "../financial/capRate.js";
import { calculateFinancials } from "../financial/calculateFinancials.js";
import { syncInterestRateForUnits } from "./interestRateSync.js";
import { FINANCIAL_CONSTANTS } from "../../config/financial.js";
import { normalizeWhitespace } from "../../formatting/text.js";

// The Listing fields every scraper must return as strings (default "Not found"). A missing or
// non-string field means the scraper broke; the engine refuses to render/export rather than
// letting `undefined` flow into the NOI/COCR math and silently paint wrong numbers (fail-loud).
const LISTING_CONTRACT_FIELDS = ["name", "price", "capRate", "contact", "phone", "listingDate"];

export function isValidListingShape(data) {
  if (!data || typeof data !== "object") return false;
  return LISTING_CONTRACT_FIELDS.every((field) => typeof data[field] === "string");
}

export function createFinance({ ctx, adapter, render }) {
  const { state, updateState } = ctx;

  // Resolve the cap-rate provenance from the scraped string and write the cap state the
  // financial calc + discount handlers read. The default (DEFAULT_CAP_RATE * 100 = 5,
  // whole-number percent) fixes the latent no-cap bug where the decimal 0.05 was stored
  // and then divided by 100, computing NOI at 0.05%.
  function applyCapRate(listing) {
    const { isDefault, estimated, num, displayCap } = resolveCapRateProvenance(
      listing.capRate,
      FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE * 100
    );
    listing.capRate = displayCap;

    if (isDefault) {
      if (!state.originalCapRate) updateState({ originalCapRate: displayCap });
      if (!state.originalMultifamilyCapRate) updateState({ originalMultifamilyCapRate: `${num}%` });
      updateState({
        currentEstimatedCapRate: num,
        isUsingEstimatedCapRate: true,
        originalEstimatedCapRate: num,
      });
      return;
    }

    updateState({ isUsingEstimatedCapRate: estimated });
    if (estimated && num !== null) updateState({ currentEstimatedCapRate: num });
    if (!state.originalCapRate) updateState({ originalCapRate: displayCap });
    if (!state.originalMultifamilyCapRate && num !== null) {
      updateState({ originalMultifamilyCapRate: `${num}%` });
    }
  }

  // Scrape the page and apply the universal scrape-derived state (was extractData's side
  // effects). Returns the resolved listing (capRate normalized to a display string) or null
  // when the scrape is malformed.
  function scrapeAndApply() {
    const listing = adapter.scrape();
    if (!isValidListingShape(listing)) return null;

    // Normalize whitespace on every contract string field centrally, so adapters stay pure
    // scrapers and no consumer (panel or export) ever sees the interior newlines/tabs that
    // site markup splits text across (e.g. a broker name on two lines). "Not found" is
    // unchanged. This is the single enforcement point for the data contract's "normalize text".
    for (const field of LISTING_CONTRACT_FIELDS) {
      listing[field] = normalizeWhitespace(listing[field]);
    }

    const priceWasDefaulted = listing.priceWasDefaulted ?? (listing.price === "Not found");
    updateState({ priceWasDefaulted });

    if (!priceWasDefaulted && !state.originalPrice) {
      updateState({ originalPrice: listing.originalPrice ?? listing.price });
    }

    applyCapRate(listing);
    return listing;
  }

  function handlePropertyTypeChange() {
    const dropdown = document.getElementById("ln-property-type");
    if (!dropdown) return;
    const newType = dropdown.value;
    updateState({ currentPropertyType: newType });
    if (newType !== "str") updateState({ cachedSTRData: null });
    updateState({ baseNOI: null });
    syncInterestRateForUnits(state, updateState);
    return newType;
  }

  async function recalculateFinancials() {
    const priceElement = document.getElementById("prop-price");
    const addressElement = document.getElementById("prop-name");
    if (!priceElement) return;

    const priceText = render.getCurrentPrice() || priceElement.textContent;
    const address = addressElement?.textContent || "";
    let capRateText;
    if (state.isUsingEstimatedCapRate) {
      capRateText = `${state.currentEstimatedCapRate}%*`;
    } else {
      // Use the scraped reported cap (authoritative), not the painted cap cell — the cell shows
      // the active cap (NOI/price), which is "N/A" when price is missing and would break the
      // recompute when a price is later entered manually.
      const capElement = document.getElementById("prop-cap");
      capRateText = state.originalCapRate || (capElement ? capElement.textContent : "8%");
    }

    if (state.currentPropertyType === "str") updateState({ cachedSTRData: null });

    // Manual cap override: clicking the cap rate sets NOI = original price x cap for EVERY type
    // (analyst intent), so the active cap moves with the click even for STR/assisted whose NOI
    // is otherwise the type estimate / bedroom value. Pre-seed baseNOI so calculateFinancials
    // uses it instead of recomputing from the type model.
    if (state.capManuallySet) {
      const noi = computeManualOverrideNOI(state.originalPrice || priceText, state.currentEstimatedCapRate);
      if (noi != null) updateState({ baseNOI: noi });
    }

    const financials = await calculateFinancials(ctx, priceText, capRateText, state.currentPropertyType, address);
    render.applyFinancials(financials);
    render.updateActiveCapDisplay();
    render.updateEquityDisplay();
  }

  return { applyCapRate, handlePropertyTypeChange, recalculateFinancials, scrapeAndApply };
}

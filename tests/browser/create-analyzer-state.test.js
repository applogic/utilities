import { describe, expect, test } from "vitest";
import { createAnalyzerState } from "../../src/browser/widget/createAnalyzerState.js";
import { FINANCIAL_CONSTANTS } from "../../src/config/financial.js";

// createAnalyzerState replaces the per-repo global-state singleton. The two properties that
// MUST hold: (1) instances are isolated — the whole reason to drop the singleton is so two
// analyzers never bleed into each other; (2) resetForNavigation clears exactly the memoized
// per-listing values and preserves the session-sticky user choices — get this wrong and the
// SPA stale-state bug (listing B showing A's NOI) comes back, or the user's down-payment
// choice resets on every navigation.

describe("createAnalyzerState — isolation", () => {
  test("two instances do not share state", () => {
    // WHY: a shared singleton is exactly the bug the factory exists to kill. Mutating one
    // ctx must never be visible in another.
    const a = createAnalyzerState();
    const b = createAnalyzerState();
    a.updateState({ baseNOI: 12345 });
    expect(a.state.baseNOI).toBe(12345);
    expect(b.state.baseNOI).toBeNull();
  });

  test("defaultPropertyType override sets the initial type, default is multifamily", () => {
    expect(createAnalyzerState().state.currentPropertyType).toBe("multifamily");
    expect(createAnalyzerState({ defaultPropertyType: "str" }).state.currentPropertyType).toBe("str");
  });
});

describe("createAnalyzerState — resetForNavigation", () => {
  test("clears the memoized per-listing values (the H1 stale-state seam)", () => {
    // WHY each field: these are the values guarded by `if (!state.x)` in extractData /
    // calculateFinancials; if any survives a navigation, listing B renders with listing A's
    // value. baseNOI is the headline one (A's NOI on B's page).
    const ctx = createAnalyzerState();
    ctx.updateState({
      baseNOI: 80000,
      cachedEquity: "75%",
      cachedStrValue: { value: 1, type: "noi" },
      isUsingEstimatedCapRate: true,
      numberOfUnits: 22,
      originalPrice: "$1,000,000",
      priceWasDefaulted: true,
    });
    ctx.resetForNavigation();
    expect(ctx.state.baseNOI).toBeNull();
    expect(ctx.state.cachedEquity).toBeNull();
    expect(ctx.state.cachedStrValue).toBeNull();
    expect(ctx.state.isUsingEstimatedCapRate).toBe(false);
    expect(ctx.state.numberOfUnits).toBe(4);
    expect(ctx.state.originalPrice).toBeNull();
    expect(ctx.state.priceWasDefaulted).toBe(false);
    // Whole-number percent (5), not the decimal 0.05 — this is the no-cap-bug fix.
    expect(ctx.state.currentEstimatedCapRate).toBe(FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE * 100);
  });

  test("preserves session-sticky user choices across navigation", () => {
    // WHY: the user's loan tier, property type, and financing split are deliberate choices
    // that should outlive a listing change. Resetting them would be a UX regression — the
    // user re-picks their terms on every property.
    const ctx = createAnalyzerState({ defaultPropertyType: "str" });
    ctx.updateState({
      currentDownPaymentPercent: 50,
      currentDSCRPercent: 60,
      currentInterestRateType: "dscr_commercial",
      currentPropertyType: "assisted",
      currentSellerFiPercent: 50,
    });
    ctx.resetForNavigation();
    expect(ctx.state.currentDownPaymentPercent).toBe(50);
    expect(ctx.state.currentDSCRPercent).toBe(60);
    expect(ctx.state.currentInterestRateType).toBe("dscr_commercial");
    expect(ctx.state.currentPropertyType).toBe("assisted");
    expect(ctx.state.currentSellerFiPercent).toBe(50);
  });
});

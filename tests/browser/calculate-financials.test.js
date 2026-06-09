// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { calculateFinancials } from "../../src/browser/financial/calculateFinancials.js";

// Equivalence proof for the byte-identical hoist of calculateFinancials out of
// zillow-analyzer/dom-utils.js into @archerjessop/utilities. The ONLY change made during
// the hoist was threading the per-repo `state`/`updateState` singletons through an injected
// `ctx`. These tests pin the NOI the function computes for each property type to the numbers
// recorded in the Assignment (820 Island Dr, $1,299,000, reported cap 4.86%) — if the hoist
// silently altered a branch, the per-type NOI would move and these would fail.
//
// WHY pin rawNOI specifically: NOI is the input every downstream metric (cash flow, COCR,
// assignment) is derived from, and it is the value the v6 model decision froze ("no NOI math
// change on any type"). A hoist that drifts the NOI is the exact regression the engine
// migration must not introduce.

function makeCtx(overrides = {}) {
  const state = {
    baseNOI: null,
    cachedSTRData: null,
    cachedStrValue: null,
    currentDSCRPercent: 70,
    currentDownPaymentPercent: 60,
    currentEstimatedCapRate: 5,
    currentInterestRateType: "dscr_residential",
    currentSellerFiPercent: 40,
    isUsingEstimatedCapRate: false,
    numberOfUnits: 4,
    originalPrice: null,
    ...overrides,
  };
  return { state, updateState: (u) => Object.assign(state, u) };
}

const PRICE = "$1,299,000";
const REPORTED_CAP = "4.86%";

describe("calculateFinancials hoist — per-type NOI is byte-identical to the Assignment", () => {
  beforeEach(() => {
    delete window.lastFinancialCalculation;
  });

  test("multifamily: NOI = price x reported cap (63,131.4)", async () => {
    // WHY 1299000 * 0.0486: multifamily is the one type where the reported cap drives NOI,
    // so this must remain price*cap exactly. Memory/Assignment records $63,131.
    const ctx = makeCtx();
    const result = await calculateFinancials(ctx, PRICE, REPORTED_CAP, "multifamily", "820 Island Dr");
    expect(result.rawNOI).toBeCloseTo(63131.4, 4);
    // baseNOI memoization must have been written through the injected ctx, not a stale
    // singleton — the value stored equals the value returned, proving the threading.
    expect(ctx.state.baseNOI).toBe(result.rawNOI);
  });

  test("STR: ignores reported cap, uses the 5.5% price estimate (71,445)", async () => {
    // WHY 1299000 * 0.055: STR NOI is the price-based estimate (gross 10% x 55% NOI = 5.5%)
    // until the 3rd-party revenue backend ships; the reported 4.86% cap must NOT leak in.
    const ctx = makeCtx();
    const result = await calculateFinancials(ctx, PRICE, REPORTED_CAP, "str", "820 Island Dr");
    expect(result.rawNOI).toBeCloseTo(71445, 4);
  });

  test("STR: a manual gross (cachedStrValue) drives NOI = gross x 55%, not the price estimate", async () => {
    // WHY: clicking the NOI cell to type Awning's gross stores cachedStrValue {value, type:"gross"} —
    // the SAME measured seam the dormant str-revenue backend would fill. NOI must become
    // gross x NOI_PERCENTAGE (0.55), independent of price/cap, and memoize into baseNOI. This is
    // the manual-override path the Awning workflow depends on; if it regressed to the price
    // estimate, the analyst's typed Awning number would be silently ignored.
    const ctx = makeCtx({ cachedStrValue: { value: 120000, type: "gross" } });
    const result = await calculateFinancials(ctx, PRICE, REPORTED_CAP, "str", "820 Island Dr");
    expect(result.rawNOI).toBeCloseTo(120000 * 0.55, 4);
    expect(result.rawNOI).toBeCloseTo(66000, 4);
    expect(ctx.state.baseNOI).toBe(result.rawNOI);
  });

  test("assisted: NOI = bedrooms x $1,500 x 12 (7 beds -> 126,000)", async () => {
    // WHY 7*1500*12: assisted NOI is bedroom-driven (numberOfUnits doubles as the bed count),
    // independent of price or cap. The Assignment's assisted figure is $126,000 at 7 beds.
    const ctx = makeCtx({ numberOfUnits: 7 });
    const result = await calculateFinancials(ctx, PRICE, REPORTED_CAP, "assisted", "820 Island Dr");
    expect(result.rawNOI).toBe(7 * 1500 * 12);
    expect(result.rawNOI).toBe(126000);
  });

  test("zero/non-finite price is refused (display guard H2) -> null", async () => {
    // WHY: a $0 price would drive NOI->0 and COCR->NaN/Infinity; the guard returns null so the
    // panel paints N/A instead of garbage. This is the price-defaulted display safety.
    const ctx = makeCtx();
    expect(await calculateFinancials(ctx, "$0", REPORTED_CAP, "multifamily", "x")).toBeNull();
    expect(await calculateFinancials(ctx, "no digits", REPORTED_CAP, "multifamily", "x")).toBeNull();
  });

  test("baseNOI memoization short-circuits recompute (stale-state seam)", async () => {
    // WHY: calculateFinancials only computes NOI when state.baseNOI is falsy; a pre-set baseNOI
    // must be reused verbatim. This is the exact memoization that resetForNavigation must clear
    // between SPA listings — pinning it here documents the seam the engine's nav reset protects.
    const ctx = makeCtx({ baseNOI: 99999 });
    const result = await calculateFinancials(ctx, PRICE, REPORTED_CAP, "multifamily", "x");
    expect(result.rawNOI).toBe(99999);
  });
});

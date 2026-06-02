import { describe, expect, test } from "vitest";
import { calculateDownPaymentTooltip } from "../../src/browser/financial/tooltip-calculations.js";

// These tests exist to protect the state-injection refactor: calculateDownPaymentTooltip
// used to read the interest-rate tier off the per-repo global-state singleton, and now
// takes it as an injected `interestRateType` parameter. If the parameter were ignored,
// the function would silently fall back to one fixed tier and the COCR shown in the
// tooltip would no longer track the user's selected loan type.
describe("calculateDownPaymentTooltip — injected interestRateType", () => {
  const price = 1000000;
  const noi = 80000;
  const downPercent = 30;
  const dscrPercent = 70;
  const sellerFiPercent = 0;

  test("a different interest-rate tier produces a different COCR", () => {
    // WHY: dscr_residential is 8% and dscr_commercial is 10%; a higher loan rate
    // means a higher payment and therefore a lower COCR. Identical output for the
    // two tiers would prove the injected param is being thrown away.
    const residential = calculateDownPaymentTooltip(
      price, noi, downPercent, dscrPercent, sellerFiPercent, "dscr_residential"
    );
    const commercial = calculateDownPaymentTooltip(
      price, noi, downPercent, dscrPercent, sellerFiPercent, "dscr_commercial"
    );
    expect(residential).not.toBe(commercial);
  });

  test("defaults to dscr_residential when interestRateType is omitted", () => {
    // WHY: callers that never selected a loan type must get the same result as the
    // explicit residential tier — the documented default behavior.
    const omitted = calculateDownPaymentTooltip(price, noi, downPercent, dscrPercent, sellerFiPercent);
    const explicit = calculateDownPaymentTooltip(
      price, noi, downPercent, dscrPercent, sellerFiPercent, "dscr_residential"
    );
    expect(omitted).toBe(explicit);
  });
});

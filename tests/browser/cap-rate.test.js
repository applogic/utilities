import { describe, expect, test } from "vitest";
import {
  computeActiveCapDisplay,
  computeManualOverrideNOI,
  parsePriceNumber,
  parseReportedCap,
  resolveCapRateProvenance,
} from "../../src/browser/financial/capRate.js";

// These are the finance business rules T12 isolated out of the engine's DOM-coupled closures.
// WHY unit-test them directly: each holds a subtle rule (the no-cap default fix, the "*"-marker
// provenance, active cap = NOI/price, the manual override) that used to be reachable only
// through a full jsdom render — a change to the math couldn't fail a focused test.

describe("resolveCapRateProvenance", () => {
  test("a real reported cap is not estimated and is passed through verbatim", () => {
    // WHY: "6.5%" with no "*" is a genuine listed cap — it must drive NOI as a scraped value.
    expect(resolveCapRateProvenance("6.5%", 5)).toEqual({
      displayCap: "6.5%",
      estimated: false,
      isDefault: false,
      num: 6.5,
    });
  });

  test("a \"*\"-marked cap is an estimate (whole-number percent)", () => {
    expect(resolveCapRateProvenance("6%*", 5)).toEqual({
      displayCap: "6%*",
      estimated: true,
      isDefault: false,
      num: 6,
    });
  });

  test("\"Not found\" applies the default estimate as a whole-number percent (the no-cap bug fix)", () => {
    // WHY this is the fix: the default must be 5 (whole-number percent) so the calc divides it
    // to 5%, not the old decimal 0.05 that computed NOI at 0.05%.
    expect(resolveCapRateProvenance("Not found", 5)).toEqual({
      displayCap: "5%*",
      estimated: true,
      isDefault: true,
      num: 5,
    });
  });
});

describe("computeActiveCapDisplay", () => {
  test("active cap = NOI / price, one decimal", () => {
    // 820 Island Dr STR: NOI 71,445 / price 1,299,000 = 5.5%; MF: 84,435 / 1,299,000 = 6.5%.
    expect(computeActiveCapDisplay(71445, 1299000)).toBe("5.5%");
    expect(computeActiveCapDisplay(84435, 1299000)).toBe("6.5%");
  });

  test("a missing NOI or non-positive price yields N/A, never a bogus 0% / Infinity", () => {
    expect(computeActiveCapDisplay(null, 1299000)).toBe("N/A");
    expect(computeActiveCapDisplay(50000, 0)).toBe("N/A");
  });
});

describe("parseReportedCap", () => {
  test("only a real (non-estimated) scraped cap surfaces on hover", () => {
    expect(parseReportedCap("4.86%", false)).toBe(4.86);
    expect(parseReportedCap("4.86%", true)).toBeNull();
    expect(parseReportedCap("Not found", false)).toBeNull();
    expect(parseReportedCap(null, false)).toBeNull();
  });
});

describe("parsePriceNumber", () => {
  test("strips currency formatting; null when there is no number", () => {
    expect(parsePriceNumber("$1,299,000")).toBe(1299000);
    expect(parsePriceNumber("")).toBeNull();
    expect(parsePriceNumber("No price")).toBeNull();
  });
});

describe("computeManualOverrideNOI", () => {
  test("NOI = original price x cap; null when the price is unreadable / non-positive", () => {
    // Clicking an estimated cap to 6% on the 820 Island Dr listing: 1,299,000 x 0.06 = 77,940.
    expect(computeManualOverrideNOI("$1,299,000", 6)).toBe(77940);
    expect(computeManualOverrideNOI("", 6)).toBeNull();
    expect(computeManualOverrideNOI("$0", 6)).toBeNull();
  });
});

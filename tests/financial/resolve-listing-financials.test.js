import { describe, expect, test } from "vitest";
import { resolveListingFinancials } from "../../src/financial/calculations.js";
import { PROPERTY_TYPES } from "../../src/config/property-types.js";

// resolveListingFinancials is the single source of truth for the NOI<->cap-rate model,
// consumed by BOTH the extension engine and the dashboard. NOI is computed per-type
// (unchanged from calculateNOIByType); the ACTIVE (displayed) cap rate is always NOI/price;
// the REPORTED cap rate is carried as provenance and drives NOI only for multifamily.
// Numbers seeded from the real Assignment listing: 820 Island Dr, $1,299,000, reported cap 4.86%.
const PRICE = 1299000;
const REPORTED = 0.0486; // 4.86% scraped from the listing

describe("resolveListingFinancials", () => {
  test("INVARIANT: active cap rate always equals NOI / price, every type", () => {
    // WHY: the whole point is that the displayed cap and the NOI can never disagree again.
    for (const propertyType of [PROPERTY_TYPES.MULTIFAMILY, PROPERTY_TYPES.STR, PROPERTY_TYPES.ASSISTED_LIVING]) {
      const r = resolveListingFinancials({ price: PRICE, propertyType, reportedCapRate: REPORTED, bedroomCount: 7 });
      expect(r.activeCapRate * PRICE).toBeCloseTo(r.noi, 4);
    }
  });

  test("multifamily: the reported cap DRIVES the NOI (cap is the model input)", () => {
    const r = resolveListingFinancials({ price: PRICE, propertyType: PROPERTY_TYPES.MULTIFAMILY, reportedCapRate: REPORTED });
    expect(r.noi).toBeCloseTo(63131.4, 1); // price x 4.86%
    expect(r.activeCapRate).toBeCloseTo(REPORTED, 6);
    expect(r.noiSource).toBe("cap");
    expect(r.reportedCapRate).toBe(REPORTED);
  });

  test("STR: honors the 5.5% estimate, IGNORES the reported cap for NOI (kept only as provenance)", () => {
    // WHY: user decision — STR keeps the estimate until the 3rd-party NOI feed. A published cap
    // must NOT change STR NOI, but it is still surfaced (reportedCapRate) for the hover tooltip.
    const r = resolveListingFinancials({ price: PRICE, propertyType: PROPERTY_TYPES.STR, reportedCapRate: REPORTED });
    expect(r.noi).toBeCloseTo(71445, 0); // price x 5.5% estimate, NOT price x 4.86%
    expect(r.activeCapRate).toBeCloseTo(0.055, 4); // displayed cap = NOI/price = 5.5%, not 4.86%
    expect(r.activeCapRate).not.toBeCloseTo(REPORTED, 4);
    expect(r.noiSource).toBe("estimate");
    expect(r.reportedCapRate).toBe(REPORTED); // provenance preserved for hover
  });

  test("STR: a measured 3rd-party NOI overrides the estimate (the future feed)", () => {
    // WHY: when the str-revenue backend ships, its measured NOI is authoritative over the estimate.
    const r = resolveListingFinancials({
      price: PRICE,
      propertyType: PROPERTY_TYPES.STR,
      reportedCapRate: REPORTED,
      strApiResult: { value: 90000, type: "noi" },
    });
    expect(r.noi).toBe(90000);
    expect(r.activeCapRate).toBeCloseTo(90000 / PRICE, 6);
    expect(r.noiSource).toBe("measured");
  });

  test("assisted: bedroom NOI wins; reported cap is provenance only", () => {
    // WHY: user decision — bedroom-derived NOI is authoritative for assisted; the listed cap (4.86%)
    // diverges (implies ~9.7%) and is shown on hover, not used for NOI.
    const r = resolveListingFinancials({ price: PRICE, propertyType: PROPERTY_TYPES.ASSISTED_LIVING, reportedCapRate: REPORTED, bedroomCount: 7 });
    expect(r.noi).toBe(126000); // 7 beds x $1,500 x 12
    expect(r.activeCapRate).toBeCloseTo(126000 / PRICE, 6); // ~9.70%, not 4.86%
    expect(r.noiSource).toBe("bedrooms");
    expect(r.reportedCapRate).toBe(REPORTED);
  });

  test("confirmed NOI (analyst override) beats every per-type model", () => {
    // WHY: tier-0 — once an analyst confirms the actual NOI on the dashboard, it is authoritative
    // and the active cap recomputes from it.
    const r = resolveListingFinancials({ price: PRICE, propertyType: PROPERTY_TYPES.STR, reportedCapRate: REPORTED, confirmedNOI: 80000 });
    expect(r.noi).toBe(80000);
    expect(r.activeCapRate).toBeCloseTo(80000 / PRICE, 6);
    expect(r.noiSource).toBe("confirmed");
  });

  test("no reported cap: reportedCapRate is null (UI shows N/A); multifamily falls back to the estimate", () => {
    // WHY: a listing with no published cap must not fabricate a reported value on hover, and
    // multifamily still needs SOME cap to compute NOI — the estimated default.
    const r = resolveListingFinancials({ price: PRICE, propertyType: PROPERTY_TYPES.MULTIFAMILY, reportedCapRate: null, estimatedCapRate: 0.05 });
    expect(r.reportedCapRate).toBeNull();
    expect(r.noi).toBeCloseTo(PRICE * 0.05, 1);
    expect(r.noiSource).toBe("estimate");
  });

  test("guards: zero/invalid price yields null active cap, never NaN/Infinity", () => {
    const r = resolveListingFinancials({ price: 0, propertyType: PROPERTY_TYPES.MULTIFAMILY, reportedCapRate: REPORTED });
    expect(r.activeCapRate).toBeNull();
    expect(Number.isFinite(r.noi)).toBe(true);
  });
});

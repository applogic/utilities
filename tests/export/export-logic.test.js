import { describe, expect, test } from "vitest";
import { createExportObjectCore } from "../../src/export/export-logic.js";

const baseListing = {
  capRate: "7%",
  contact: "Jane Broker",
  listingDate: "2026-01-15",
  name: "123 Main St",
  phone: "555-123-4567",
  price: "$1,000,000",
};

describe("createExportObjectCore", () => {
  test("refuses to export (returns null) when the price was defaulted", () => {
    // WHY: a defaulted price is a fabricated number. If it were exported it would flow
    // into the dashboard's NOI math and silently store garbage; refusing is the only
    // safe outcome. This guard is the reason the unified source is Zillow's version.
    const result = createExportObjectCore(baseListing, { priceWasDefaulted: true });
    expect(result).toBeNull();
  });

  test("maps the on-screen property type to the dashboard DB enum", () => {
    // WHY: the dashboard stores "mfr", not "multifamily". Mapping client-side keeps the
    // export URL carrying the real enum instead of depending on a server-side conversion.
    expect(createExportObjectCore(baseListing, { currentPropertyType: "multifamily" }).propertyType).toBe("mfr");
    expect(createExportObjectCore(baseListing, { currentPropertyType: "str" }).propertyType).toBe("str");
    expect(createExportObjectCore(baseListing, { currentPropertyType: "made_up" }).propertyType).toBe("mfr");
  });

  test("converts a percentage cap rate string to a decimal", () => {
    // WHY: the contract is decimals on the wire (7% -> 0.07); shipping 7 would be a 100x error.
    const result = createExportObjectCore(baseListing, {});
    expect(result.capRate).toBe(0.07);
  });

  test("reverses an applied discount to recover the original asking price", () => {
    // WHY: the panel shows the discounted price, but the dashboard wants the true ask.
    // At 15% off, a displayed $850,000 must export as the original $1,000,000.
    const result = createExportObjectCore(
      { ...baseListing, price: "$850,000" },
      { currentPriceDiscount: 15 }
    );
    expect(result.price).toBe(1000000);
    expect(result.priceDiscountPercent).toBe(0.15);
  });

  test("emits keys in alphabetized order", () => {
    // WHY: the export contract specifies alphabetized keys; ordering is part of the
    // stable URL shape consumers depend on.
    const keys = Object.keys(createExportObjectCore(baseListing, {}));
    expect(keys).toEqual([...keys].sort());
  });
});

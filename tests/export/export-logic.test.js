import { describe, expect, test } from "vitest";
import { createExportObjectCore, mapPropertyType } from "../../src/export/export-logic.js";

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

  test("derives equityPercent from scraped debt vs the export price", () => {
    // WHY: equity is no longer fetched as a %; it is (price - debt)/price. At $1,000,000 with
    // $450,000 owing, equity is 0.55. The dashboard recomputes against asking/offered downstream.
    const result = createExportObjectCore(baseListing, { estimatedMortgageBalance: 450000, equitySource: "scraped" });
    expect(result.equityPercent).toBe(0.55);
    expect(result.equitySource).toBe("scraped");
    expect(result.estimatedMortgageBalance).toBe(450000);
  });

  test("carries the recorded liens as a JSON string", () => {
    // WHY: the dashboard stores currentMortgages in scraped_mortgages (JSONB). Loan type matters
    // for deal analysis, so the lien detail must survive the export hop.
    const mortgages = [{ amount: 450000, position: "First", loanType: "Conventional", lenderName: "Logix Fcu" }];
    const result = createExportObjectCore(baseListing, { estimatedMortgageBalance: 450000, currentMortgages: mortgages });
    expect(JSON.parse(result.currentMortgages)).toEqual(mortgages);
  });

  test("no debt figure means 100% equity (estimated) and no debt fields", () => {
    // WHY: the "estimated = 100%" rule when the debt service returns no number.
    const result = createExportObjectCore(baseListing, { estimatedMortgageBalance: null, equitySource: "estimated" });
    expect(result.equityPercent).toBe(1);
    expect(result.equitySource).toBe("estimated");
    expect("estimatedMortgageBalance" in result).toBe(false);
    expect("currentMortgages" in result).toBe(false);
  });

  test("clamps underwater equity to 0 for the dashboard's equity_percent CHECK", () => {
    // WHY: debt > price would compute negative equity, violating equity_percent >= 0. The export
    // clamps to [0,1]; the live panel still shows the real (negative) figure.
    const result = createExportObjectCore(baseListing, { estimatedMortgageBalance: 1500000 });
    expect(result.equityPercent).toBe(0);
  });

  test("carries the computed NOI as an additive field (rounded); capRate stays the reported value", () => {
    // WHY T2: the dashboard stores the computed NOI and derives the active cap from it, while
    // capRate keeps the REPORTED rate (7% -> 0.07). NOI is exported as a rounded integer.
    const result = createExportObjectCore(baseListing, { noi: 84435.6 });
    expect(result.noi).toBe(84436);
    expect(result.capRate).toBe(0.07);
  });

  test("omits noi when none was computed (additive/nullable, never 0)", () => {
    // WHY: a missing or non-positive NOI must not ship as 0/garbage into the dashboard column.
    expect(createExportObjectCore(baseListing, {}).noi).toBeUndefined();
    expect(createExportObjectCore(baseListing, { noi: 0 }).noi).toBeUndefined();
    expect(createExportObjectCore(baseListing, { noi: null }).noi).toBeUndefined();
  });

  test("emits keys in alphabetized order", () => {
    // WHY: the export contract specifies alphabetized keys; ordering is part of the
    // stable URL shape consumers depend on.
    const keys = Object.keys(createExportObjectCore(baseListing, {}));
    expect(keys).toEqual([...keys].sort());
  });
});

describe("mapPropertyType", () => {
  // WHY this is exported: property-dashboard kept a byte-identical third copy of this table
  // (validation/property.js). Exporting it lets the dashboard import the single source of truth,
  // so the on-screen-type -> DB-enum mapping can never silently drift between the two.
  test("maps multifamily to the DB enum mfr and passes the rest through", () => {
    expect(mapPropertyType("multifamily")).toBe("mfr");
    expect(mapPropertyType("str")).toBe("str");
    expect(mapPropertyType("assisted")).toBe("assisted");
    expect(mapPropertyType("business")).toBe("business");
    expect(mapPropertyType("mixed_use")).toBe("mixed_use");
    expect(mapPropertyType("rv_park")).toBe("rv_park");
  });

  test("defaults unknown or missing types to mfr", () => {
    // WHY: the dashboard's NOT-NULL property_type column needs a safe default; an unknown
    // type must land as multifamily (mfr), never undefined.
    expect(mapPropertyType("made_up")).toBe("mfr");
    expect(mapPropertyType(undefined)).toBe("mfr");
    expect(mapPropertyType("")).toBe("mfr");
  });
});

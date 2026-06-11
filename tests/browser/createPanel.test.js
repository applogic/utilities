// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPanel } from "../../src/browser/widget/createPanel.js";

// createPanel loads its stylesheets asynchronously and only builds the footer once they
// resolve (or after a 100ms fallback). jsdom never fires link.onload, so we pass no
// stylesheets and advance fake timers to let the fallback path build the panel.
function buildPanel(overrides = {}) {
  const callbacks = {
    onExportClick: vi.fn(),
    onInterestRateTypeChange: vi.fn(),
    onPropertyTypeChange: vi.fn(),
    state: {},
    updateState: vi.fn(),
    ...overrides.callbacks,
  };
  createPanel({ callbacks, cssUrls: [], defaultPropertyType: overrides.defaultPropertyType || "multifamily" });
  vi.advanceTimersByTime(100);
  return callbacks;
}

describe("createPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders the footer with the full set of metric elements", () => {
    buildPanel();
    expect(document.getElementById("ln-footer")).not.toBeNull();
    // WHY: click-handlers.js and content.js look these elements up by exact id; a renamed
    // or dropped id silently breaks the panel after extraction.
    for (const id of ["prop-name", "prop-price", "prop-cap", "prop-noi", "ln-export-btn", "ln-units-input", "ln-property-type", "ln-interest-rate-type"]) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });

  test("pre-selects the injected default property type", () => {
    // WHY: LoopNet defaults to multifamily, Zillow to STR. This per-platform default was
    // the ONLY semantic difference between the two copies and must survive the merge.
    buildPanel({ defaultPropertyType: "str" });
    expect(document.getElementById("ln-property-type").value).toBe("str");

    document.body.innerHTML = "";
    document.head.innerHTML = "";
    buildPanel({ defaultPropertyType: "multifamily" });
    expect(document.getElementById("ln-property-type").value).toBe("multifamily");
  });

  test("export button click invokes the onExportClick callback (R3 wiring)", () => {
    // WHY: this replaced a dead `export-click` CustomEvent dispatch; the button must now
    // notify the caller through the injected callback instead.
    const callbacks = buildPanel();
    document.getElementById("ln-export-btn").click();
    expect(callbacks.onExportClick).toHaveBeenCalledTimes(1);
  });

  test("property-type change invokes onPropertyTypeChange with the new value (R3 wiring)", () => {
    const callbacks = buildPanel();
    const dropdown = document.getElementById("ln-property-type");
    dropdown.value = "assisted";
    dropdown.dispatchEvent(new Event("change"));
    expect(callbacks.onPropertyTypeChange).toHaveBeenCalledWith("assisted");
  });

  test("interest-rate change updates state and invokes the callback (R3 wiring)", () => {
    // WHY: the original handler both wrote currentInterestRateType to state AND dispatched
    // an event; both side effects must be preserved through the callback conversion.
    const callbacks = buildPanel();
    const dropdown = document.getElementById("ln-interest-rate-type");
    dropdown.value = "commercial";
    dropdown.dispatchEvent(new Event("change"));
    expect(callbacks.updateState).toHaveBeenCalledWith({ currentInterestRateType: "commercial" });
    expect(callbacks.onInterestRateTypeChange).toHaveBeenCalledWith("commercial");
  });

  test("MFR with more than 4 units auto-switches the loan tier to dscr_commercial", () => {
    // WHY: a multifamily property of 5+ units is commercial financing (DSCR Com, 10%), not
    // residential. Losing this would silently misprice every large multifamily deal at 8%.
    const callbacks = buildPanel({ callbacks: { state: { currentPropertyType: "multifamily" } } });
    const units = document.getElementById("ln-units-input");
    units.value = "5";
    units.dispatchEvent(new Event("change"));

    expect(callbacks.updateState).toHaveBeenCalledWith({ numberOfUnits: 5 });
    expect(document.getElementById("ln-interest-rate-type").value).toBe("dscr_commercial");
    expect(callbacks.onInterestRateTypeChange).toHaveBeenCalledWith("dscr_commercial");
  });

  test("MFR dropping to 4 or fewer units reverts the loan tier to dscr_residential", () => {
    // WHY: the switch is reversible — editing units back below 5 must restore the residential
    // tier, otherwise a corrected unit count keeps the deal mispriced at the commercial rate.
    const callbacks = buildPanel({ callbacks: { state: { currentPropertyType: "multifamily" } } });
    document.getElementById("ln-interest-rate-type").value = "dscr_commercial";
    const units = document.getElementById("ln-units-input");
    units.value = "4";
    units.dispatchEvent(new Event("change"));

    expect(document.getElementById("ln-interest-rate-type").value).toBe("dscr_residential");
    expect(callbacks.onInterestRateTypeChange).toHaveBeenCalledWith("dscr_residential");
  });

  test("non-MFR property is never force-switched by unit count", () => {
    // WHY: the 5+ unit rule is multifamily-specific. Commercial / mixed-use / RV listings keep
    // their own tier; a large unit count must not hijack their interest-rate selection.
    const callbacks = buildPanel({ callbacks: { state: { currentPropertyType: "business" } } });
    const units = document.getElementById("ln-units-input");
    units.value = "12";
    units.dispatchEvent(new Event("change"));

    expect(document.getElementById("ln-interest-rate-type").value).toBe("dscr_residential");
    expect(callbacks.onInterestRateTypeChange).not.toHaveBeenCalled();
  });

  test("optional event callbacks may be omitted without throwing", () => {
    // WHY: today export-click is dead in both analyzers and property-type-change is dead in
    // LoopNet. A caller that omits those callbacks must behave like the old no-listener
    // dispatch — silently do nothing, never crash.
    createPanel({ callbacks: { state: {}, updateState: vi.fn() }, cssUrls: [], defaultPropertyType: "multifamily" });
    vi.advanceTimersByTime(100);
    expect(() => document.getElementById("ln-export-btn").click()).not.toThrow();
    const dropdown = document.getElementById("ln-property-type");
    dropdown.value = "business";
    expect(() => dropdown.dispatchEvent(new Event("change"))).not.toThrow();
  });
});

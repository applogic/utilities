// @vitest-environment jsdom
//
// R-EQUIV — the engine's done-bar, executable. The whole point of the shared engine is "one
// brain, two scrapers": if the SAME property is listed on two platforms, both analyzers must
// produce an IDENTICAL financial export. This test feeds one canonical property (820 Island Dr:
// multifamily, $1,299,000, reported cap 4.86%) through two adapters that differ ONLY in their
// platform identity — matches(), getListingId(), config.cssFiles, and SPA vs MPA mode — and
// asserts the exports are byte-equal (excluding `url`, which is legitimately the source page).
//
// What this guards: that platform-shaped concerns (which site, how it's identified, how nav
// works) NEVER leak into the financial output. Only the listing facts may move the numbers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAnalyzer } from "../../src/browser/widget/createAnalyzer.js";
import { removeAllTooltips } from "../../src/browser/ui/tooltip-manager.js";

// The LOI lookup is the one live network call in the pipeline; stub it so the run is
// deterministic (any resolved value keeps the pipeline moving without a backend).
vi.mock("../../src/services/loi-lookup.js", () => ({
  lookupLOI: vi.fn(async () => ({ matchType: undefined, data: {} })),
}));

// One canonical property. capRate is overridable to exercise both provenance branches
// (a real reported cap vs none -> the 5% engine estimate).
function canonicalListing(overrides = {}) {
  return {
    bedroomCount: null,
    capRate: "4.86%",
    contact: "Jane Broker",
    listingDate: "2018-11-02",
    name: "820 Island Dr, Alameda, CA 94502",
    phone: "(510) 502-2288",
    price: "$1,299,000",
    priceWasDefaulted: false,
    unitCount: 2,
    ...overrides,
  };
}

// Two adapters for the SAME property, differing only in platform identity. defaultPropertyType
// is held equal (multifamily) on purpose: property type is a financial INPUT, so "same inputs"
// means the same type listed on both sites. The point is that the OTHER differences below
// (id scheme, css, SPA mode) must not change a single exported number.
function zillowLikeAdapter(listing) {
  return {
    config: { cssFiles: ["z.css"], defaultPropertyType: "multifamily", spa: "auto" },
    getListingId: () => "14261320_zpid",
    matches: () => true,
    scrape: () => ({ ...listing }),
  };
}

function loopnetLikeAdapter(listing) {
  return {
    config: { cssFiles: ["l-base.css", "l-components.css"], defaultPropertyType: "multifamily", spa: false },
    getListingId: () => "/Listing/820-Island-Dr-Alameda-CA/14261320/",
    matches: () => true,
    scrape: () => ({ ...listing }),
  };
}

// Run one adapter all the way through the engine (panel render + financial recompute + equity)
// and return the export object, with the source `url` stripped. Tears the panel down after so
// the next adapter renders into a clean DOM (the panel uses fixed ids like #ln-footer).
async function exportThroughEngine(adapter) {
  const analyzer = createAnalyzer(adapter);
  analyzer.runPipeline();
  await vi.runAllTimersAsync();
  const exp = await analyzer.createExportObject();
  document.getElementById("ln-footer")?.remove();
  removeAllTooltips();
  if (exp) delete exp.url;
  return exp;
}

describe("R-EQUIV — same property through two adapters yields an identical export", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.chrome = { runtime: { getURL: (p) => `chrome-extension://mock/${p}` } };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("ln-footer")?.remove();
    document.body.innerHTML = "";
  });

  test("a real reported cap (4.86%) exports identically from either platform", async () => {
    const listing = canonicalListing();
    const fromZillow = await exportThroughEngine(zillowLikeAdapter(listing));
    const fromLoopnet = await exportThroughEngine(loopnetLikeAdapter(listing));

    // Sanity: a real export was produced and carries the real reported cap + computed NOI.
    expect(fromZillow).not.toBeNull();
    expect(fromZillow.capRate).toBe(0.0486);
    expect(fromZillow.capRateSource).toBe("scraped");
    expect(fromZillow.noi).toBe(63131); // 1,299,000 x 4.86% (the Assignment multifamily NOI)

    // The done-bar: every financial field is identical regardless of which platform scraped it.
    expect(fromLoopnet).toEqual(fromZillow);
  });

  test("no reported cap -> both platforms apply the same 5% estimate and export identically", async () => {
    const listing = canonicalListing({ capRate: "Not found" });
    const fromZillow = await exportThroughEngine(zillowLikeAdapter(listing));
    const fromLoopnet = await exportThroughEngine(loopnetLikeAdapter(listing));

    // The no-cap path: both resolve to the 5% whole-number estimate (the no-cap bug fix), not a
    // platform-specific default, so the estimated cap + its NOI match.
    expect(fromZillow.capRateSource).toBe("estimated");
    expect(fromZillow.capRate).toBe(0.05);
    expect(fromLoopnet).toEqual(fromZillow);
  });
});

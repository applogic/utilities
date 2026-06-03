// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAnalyzer } from "../../src/browser/widget/createAnalyzer.js";

// The LOI lookup is the one live network call in the pipeline; stub it so the render test is
// deterministic (the engine maps its matchType to a lead-status string — any resolved value
// keeps the pipeline moving without a backend).
vi.mock("../../src/services/loi-lookup.js", () => ({
  lookupLOI: vi.fn(async () => ({ matchType: undefined, data: {} })),
}));

// A complete, well-formed Listing — the adapter contract the engine consumes. Tests override
// fields (capRate / priceWasDefaulted) to exercise the engine's cap-rate and guard paths.
function makeListing(overrides = {}) {
  return {
    bedroomCount: null,
    capRate: "6.5%",
    contact: "Jane Broker",
    listingDate: "2026-05-01",
    name: "820 Island Dr",
    phone: "555-1234",
    price: "$1,299,000",
    unitCount: 4,
    ...overrides,
  };
}

function makeAdapter(overrides = {}) {
  const listing = overrides.listing ?? makeListing();
  return {
    config: { cssFiles: [], defaultPropertyType: "multifamily" },
    getListingId: () => "820-island-dr",
    matches: () => true,
    scrape: () => listing,
    ...overrides,
  };
}

describe("createAnalyzer — construction validation", () => {
  // WHY fail loud at construction: a missing adapter method is a wiring mistake that should
  // blow up immediately, not surface as a confusing failure deep in the async pipeline.
  test("throws when the adapter is missing or not an object", () => {
    expect(() => createAnalyzer(null)).toThrow(TypeError);
    expect(() => createAnalyzer("nope")).toThrow(TypeError);
  });

  test("throws when a required adapter method is absent", () => {
    expect(() => createAnalyzer({ getListingId: () => "x", scrape: () => ({}) })).toThrow(/matches/);
    expect(() => createAnalyzer({ matches: () => true, scrape: () => ({}) })).toThrow(/getListingId/);
    expect(() => createAnalyzer({ matches: () => true, getListingId: () => "x" })).toThrow(/scrape/);
  });

  test("a valid adapter yields an isolated ctx per analyzer", () => {
    // WHY: each analyzer must own its state — the whole reason the engine drops the singleton.
    const a = createAnalyzer(makeAdapter());
    const b = createAnalyzer(makeAdapter());
    a.ctx.updateState({ baseNOI: 1 });
    expect(a.ctx.state.baseNOI).toBe(1);
    expect(b.ctx.state.baseNOI).toBeNull();
  });
});

describe("createAnalyzer — scrape + cap-rate application via export", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    // ensureEquityLoaded -> fetchEquity hits global.fetch; resolve it fast and deterministically.
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));
  });

  test("a real reported cap exports as scraped (not estimated)", async () => {
    // WHY: "6.5%" is a real listed cap, so capRateSource must be "scraped" and the decimal
    // cap 0.065 carried through. This proves applyCapRate routes a real cap correctly.
    const analyzer = createAnalyzer(makeAdapter({ listing: makeListing({ capRate: "6.5%" }) }));
    const exp = await analyzer.createExportObject();
    expect(exp).not.toBeNull();
    expect(exp.capRateSource).toBe("scraped");
    expect(exp.capRate).toBe(0.065);
    expect(exp.address).toBe("820 Island Dr");
  });

  test("no cap found -> default estimate of 5% (the no-cap bug fix), exported as estimated", async () => {
    // WHY: this is the fix. "Not found" -> the engine applies a 5% whole-number estimate
    // (NOT the old decimal 0.05 that computed 0.05%). The export must carry capRate 0.05
    // (5% as a decimal) and capRateSource "estimated".
    const analyzer = createAnalyzer(makeAdapter({ listing: makeListing({ capRate: "Not found" }) }));
    const exp = await analyzer.createExportObject();
    expect(exp).not.toBeNull();
    expect(exp.capRateSource).toBe("estimated");
    expect(exp.capRate).toBe(0.05);
    // The whole-number percent landed in ctx, so the calc divides it to 5% not 0.05%.
    expect(analyzer.ctx.state.currentEstimatedCapRate).toBe(5);
  });

  test("a defaulted price refuses the export (H2 guard) -> null", async () => {
    // WHY: a fabricated/missing price would underwrite garbage in the dashboard; the engine
    // refuses the whole export rather than exporting a guessed number.
    const analyzer = createAnalyzer(makeAdapter({ listing: makeListing({ priceWasDefaulted: true }) }));
    expect(await analyzer.createExportObject()).toBeNull();
    expect(analyzer.ctx.state.priceWasDefaulted).toBe(true);
  });

  test("a malformed scrape (missing a contract field) refuses the export -> null", async () => {
    // WHY fail-loud: an undefined field means the scraper broke; better to refuse than to let
    // `undefined` flow into the export and the NOI math.
    const bad = makeListing();
    delete bad.phone;
    const analyzer = createAnalyzer(makeAdapter({ listing: bad }));
    expect(await analyzer.createExportObject()).toBeNull();
  });
});

describe("createAnalyzer — full pipeline render (jsdom)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("ln-footer")?.remove();
  });

  test("runPipeline builds the panel and renders a real NOI for a multifamily listing", async () => {
    // WHY end-to-end: this is the engine doing its whole job — build the shared panel, scrape,
    // resolve the cap, compute financials, and paint the metrics. A populated #prop-noi (not
    // "Loading..."/"N/A") proves the pipeline wired calculateFinancials to the panel correctly.
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 55 }) }));

    const analyzer = createAnalyzer(makeAdapter({ listing: makeListing({ capRate: "6.5%" }) }));
    analyzer.runPipeline();
    // Advance through createPanel's 100ms fallback, the observer-driven update, and the
    // 2s equity min-loading — runAllTimersAsync flushes microtasks between timers too.
    await vi.runAllTimersAsync();

    expect(document.getElementById("ln-footer")).not.toBeNull();
    const noi = document.getElementById("prop-noi").textContent;
    expect(noi).not.toBe("Loading...");
    expect(noi).not.toBe("N/A");
    // MF NOI = price x cap = 1,299,000 x 0.065 = 84,435 -> formatted currency starts with "$".
    expect(noi.startsWith("$")).toBe(true);
    expect(document.getElementById("prop-cap").textContent).toBe("6.5%");
    expect(document.getElementById("prop-equity").textContent).toBe("55%");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAnalyzer } from "../../src/browser/widget/createAnalyzer.js";
import { removeAllTooltips } from "../../src/browser/ui/tooltip-manager.js";

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
    // ensureDebtLoaded -> fetchDebt hits global.fetch; resolve it fast and deterministically.
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ address: "820 Island Dr", currentMortgages: [], estimatedMortgageBalance: 400000 }),
    }));
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
    // The /debt service returns the outstanding balance; equity is DERIVED as (price - debt)/price.
    // price 1,299,000 with debt 584,550 => equity exactly 0.55 (55%).
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ address: "820 Island Dr", currentMortgages: [], estimatedMortgageBalance: 584550 }),
    }));

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

describe("createAnalyzer — cap display: active rate + reported-on-hover (T8)", () => {
  // The cap tooltip content is rendered into a .floating-tooltip div (innerHTML). Find the one
  // for the cap metric by its "Reported cap rate" heading.
  function capTooltipText() {
    const tip = [...document.querySelectorAll(".floating-tooltip")].find((t) =>
      t.textContent.includes("Reported cap rate")
    );
    return tip ? tip.textContent : "";
  }

  async function render(adapter) {
    const analyzer = createAnalyzer(adapter);
    analyzer.runPipeline();
    await vi.runAllTimersAsync();
    return analyzer;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    removeAllTooltips();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    removeAllTooltips();
    document.getElementById("ln-footer")?.remove();
  });

  test("multifamily with a real cap: active cap = reported cap, shown on hover", async () => {
    // WHY: for MF the cap IS the NOI input, so active (NOI/price) equals the reported cap — but
    // the reported value must still surface on hover (not "N/A").
    await render(makeAdapter({ listing: makeListing({ capRate: "6.5%" }) }));
    expect(document.getElementById("prop-cap").textContent).toBe("6.5%");
    expect(capTooltipText()).toContain("6.5%");
    expect(capTooltipText()).not.toContain("N/A");
  });

  test("STR with a published cap: panel shows active cap (5.5% estimate), reported cap on hover", async () => {
    // WHY this is the T8 fix: STR NOI is the 5.5% estimate, NOT price x reported cap. So the
    // active cap (NOI/price = 5.5%) differs from the reported cap (4.86%). The panel shows the
    // active rate; the reported rate is provenance on hover. (820 Island Dr: STR NOI 71,445.)
    await render(
      makeAdapter({
        config: { cssFiles: [], defaultPropertyType: "str" },
        listing: makeListing({ capRate: "4.86%" }),
      })
    );
    expect(document.getElementById("prop-cap").textContent).toBe("5.5%");
    expect(capTooltipText()).toContain("4.86%");
  });

  test("no reported cap anywhere: hover shows N/A (plus the click-to-cycle hint)", async () => {
    // WHY: a "Not found" cap means there is no reported value — the hover must say N/A rather
    // than echo the engine's 5% estimate as if the listing reported it.
    await render(makeAdapter({ listing: makeListing({ capRate: "Not found" }) }));
    expect(document.getElementById("prop-cap").textContent).toBe("5.0%");
    expect(capTooltipText()).toContain("N/A");
    expect(capTooltipText()).toContain("Click the cap rate");
  });

  test("clicking an estimated cap overrides NOI so the active cap rises 1% (STR)", async () => {
    // WHY: clicking the cap is a manual NOI override for EVERY type. STR NOI normally ignores the
    // cap (5.5% estimate -> active 5.5%); without the override the click would do nothing. With
    // it, NOI = price x cap (5% -> 6%): 1,299,000 x 0.06 = 77,940 -> active 6.0%. This is the
    // behavior the user asked for.
    const analyzer = await render(
      makeAdapter({
        config: { cssFiles: [], defaultPropertyType: "str" },
        listing: makeListing({ capRate: "Not found" }),
      })
    );
    expect(document.getElementById("prop-cap").textContent).toBe("5.5%");

    document.getElementById("prop-cap").click();
    await vi.runAllTimersAsync();

    expect(analyzer.ctx.state.capManuallySet).toBe(true);
    expect(document.getElementById("prop-cap").textContent).toBe("6.0%");
  });

  test("export carries the computed NOI (baseNOI) while capRate stays the reported value (T2)", async () => {
    // WHY T2: the export ships the computed NOI as an additive field; the reported cap rate is
    // unchanged. MF $1,299,000 @ 6.5% -> NOI 84,435; capRate 0.065 (scraped/reported).
    const analyzer = await render(makeAdapter({ listing: makeListing({ capRate: "6.5%" }) }));
    const exp = await analyzer.createExportObject();
    expect(exp.noi).toBe(84435);
    expect(exp.capRate).toBe(0.065);
    expect(exp.capRateSource).toBe("scraped");
  });
});

describe("createAnalyzer — click-to-reveal before scrape (config.reveals)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("ln-footer")?.remove();
    document.getElementById("reveal-call")?.remove();
  });

  test("the engine reveals gated data, then scrape() reads it into the panel", async () => {
    // WHY: this is the whole reveal contract end-to-end. A site gates the broker phone behind a
    // Call button; the platform declares a reveal; the engine must click it BEFORE scrape so the
    // pure scraper reads the now-present phone. If reveal ran after scrape, phone would be "Not found".
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));

    // The gated trigger lives in the page (outside the panel). Clicking it reveals a tel: link.
    const call = document.createElement("button");
    call.id = "reveal-call";
    call.className = "show-phone";
    call.textContent = "Call";
    call.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = "tel:5105022288";
      a.id = "revealed-tel";
      document.body.appendChild(a);
    });
    document.body.appendChild(call);

    // A DOM-reading scraper: phone comes from the revealed tel: link (or "Not found").
    const scrape = () => {
      const tel = document.getElementById("revealed-tel");
      return {
        bedroomCount: null,
        capRate: "6.5%",
        contact: "Jane Broker",
        listingDate: "2026-05-01",
        name: "820 Island Dr",
        phone: tel ? tel.getAttribute("href").replace("tel:", "") : "Not found",
        price: "$1,299,000",
        unitCount: 4,
      };
    };

    const analyzer = createAnalyzer({
      config: {
        cssFiles: [],
        defaultPropertyType: "multifamily",
        reveals: [{ name: "phone", trigger: ".show-phone", waitFor: "#revealed-tel", timeout: 1500 }],
      },
      getListingId: () => "820-island-dr",
      matches: () => true,
      scrape,
    });
    analyzer.runPipeline();
    await vi.runAllTimersAsync();

    expect(document.getElementById("revealed-tel")).not.toBeNull();
    expect(document.getElementById("prop-phone").textContent).toBe("5105022288");
  });
});

describe("createAnalyzer — progressive fill for late client-rendered fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("ln-footer")?.remove();
    document.getElementById("agent-attr")?.remove();
    document.getElementById("listed-row")?.remove();
  });

  test("agent/phone/listing-date that render after first paint fill in on a later poll", async () => {
    // WHY: Zillow client-renders the listing-agent attribution and price-history row a beat after
    // load, so the pipeline's single initial scrape reads "Not found" for contact/phone/date. The
    // engine must keep re-reading those display fields and fill them in when they arrive — without
    // re-running financials or network calls. Proven here: "Not found" at first paint, real values
    // after the late DOM appears and one poll tick fires.
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));

    // A DOM-reading scraper: agent/phone come from a late attribution block; date from a late row.
    const scrape = () => {
      const agent = document.getElementById("agent-attr");
      const row = document.getElementById("listed-row");
      const spans = agent ? agent.querySelectorAll("span") : [];
      return {
        bedroomCount: null,
        capRate: "6.5%",
        contact: agent ? spans[0].textContent : "Not found",
        listingDate: row ? "6/5/2026" : "Not found",
        name: "820 Island Dr",
        phone: agent ? spans[1].textContent : "Not found",
        price: "$1,299,000",
        unitCount: 4,
      };
    };

    const analyzer = createAnalyzer({
      config: { cssFiles: [], defaultPropertyType: "multifamily" },
      getListingId: () => "820-island-dr",
      matches: () => true,
      scrape,
    });
    analyzer.runPipeline();

    // Panel built + initial render done; the late sections are NOT in the DOM yet.
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById("prop-contact").textContent).toBe("Not found");
    expect(document.getElementById("prop-phone").textContent).toBe("Not found");
    expect(document.getElementById("prop-dom").textContent).toBe("Not found");

    // The site client-renders the agent attribution + price-history row a beat later.
    const agent = document.createElement("p");
    agent.id = "agent-attr";
    agent.innerHTML = `<span>Rich Ramsey</span><span>615-347-9799</span>`;
    document.body.appendChild(agent);
    const row = document.createElement("tr");
    row.id = "listed-row";
    document.body.appendChild(row);

    // One poll interval picks them up.
    await vi.advanceTimersByTimeAsync(400);
    expect(document.getElementById("prop-contact").textContent).toBe("Rich Ramsey");
    expect(document.getElementById("prop-phone").textContent).toBe("615-347-9799");
    expect(document.getElementById("prop-dom").textContent).not.toBe("Not found");
    expect(document.getElementById("prop-dom").textContent).toContain("2026");
  });

  test("the late-field poll abandons when the page navigated to another listing", async () => {
    // WHY nav-safety: on an SPA the user can leave listing A before its agent block renders. A
    // stale poll must NOT write A's agent onto B's panel — the guard stops it. Mirrors the same
    // isStale() drop the async services use between awaits.
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));

    let currentId = "listing-A";
    const scrape = () => {
      const agent = document.getElementById("agent-attr");
      return {
        bedroomCount: null,
        capRate: "6.5%",
        contact: agent ? "Rich Ramsey" : "Not found",
        listingDate: "Not found",
        name: "820 Island Dr",
        phone: agent ? "615-347-9799" : "Not found",
        price: "$1,299,000",
        unitCount: 4,
      };
    };

    const analyzer = createAnalyzer({
      config: { cssFiles: [], defaultPropertyType: "multifamily" },
      getListingId: () => currentId,
      matches: () => true,
      scrape,
    });
    analyzer.runPipeline();
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById("prop-contact").textContent).toBe("Not found");

    // Navigate away, THEN listing A's agent block finally renders.
    currentId = "listing-B";
    const agent = document.createElement("p");
    agent.id = "agent-attr";
    document.body.appendChild(agent);
    await vi.advanceTimersByTimeAsync(400);

    expect(document.getElementById("prop-contact").textContent).toBe("Not found");
  });
});

describe("createAnalyzer — waits for a scrapeable price (SPA overlay)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("ln-footer")?.remove();
    document.getElementById("late-price")?.remove();
  });

  test("holds the render until the price paints, then computes a real NOI (no N/A flash)", async () => {
    // WHY: on a Zillow search->listing SPA navigation there is no server render — the price is
    // client-painted a beat after the pipeline fires. An eager scrape would read no price and paint
    // N/A everywhere with no recovery (the late-field poll only refreshes contact/phone/date). The
    // engine must hold the main render until the price is scrapeable, then compute real numbers.
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));

    // Price is absent until the overlay paints #late-price; until then the listing reports no price.
    const scrape = () => {
      const painted = !!document.getElementById("late-price");
      return {
        bedroomCount: null,
        capRate: "6.5%",
        contact: "Jane Broker",
        listingDate: "2026-05-01",
        name: "820 Island Dr",
        phone: "555-1234",
        price: painted ? "$1,299,000" : "Not found",
        priceWasDefaulted: !painted,
        unitCount: 4,
      };
    };

    const analyzer = createAnalyzer({
      config: { cssFiles: [], defaultPropertyType: "multifamily" },
      getListingId: () => "820-island-dr",
      matches: () => true,
      scrape,
    });
    analyzer.runPipeline();

    // Panel built, but the price has NOT painted yet — the render must not have committed.
    await vi.advanceTimersByTimeAsync(400);
    expect(document.getElementById("prop-noi").textContent).toBe("Loading...");

    // The overlay paints the price a beat later; the data-ready poll/observer picks it up.
    const painted = document.createElement("div");
    painted.id = "late-price";
    document.body.appendChild(painted);
    await vi.runAllTimersAsync();

    const noi = document.getElementById("prop-noi").textContent;
    expect(noi).not.toBe("N/A");
    expect(noi).not.toBe("Loading...");
    // MF NOI = 1,299,000 x 0.065 = 84,435 -> formatted currency.
    expect(noi.startsWith("$")).toBe(true);
  });
});

describe("createAnalyzer — engine normalizes Listing string fields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.getElementById("ln-footer")?.remove();
  });

  test("interior whitespace in scraped fields is collapsed for both panel and export", async () => {
    // WHY: site markup splits text across lines ("Kyle\n\n  Chuah"); the engine is the single
    // enforcement point for "normalize text" so adapters stay pure scrapers and no consumer ever
    // sees the raw whitespace. This asserts it once, centrally — every adapter inherits it.
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));

    const messyListing = makeListing({
      contact: "Kyle\n\n                 Chuah",
      name: "820 Island Dr,\n  Alameda, CA 94502",
    });
    const analyzer = createAnalyzer(makeAdapter({ listing: messyListing }));
    analyzer.runPipeline();
    await vi.runAllTimersAsync();

    expect(document.getElementById("prop-name").textContent).toBe("820 Island Dr, Alameda, CA 94502");
    expect(document.getElementById("prop-contact").textContent).toBe("Kyle Chuah");

    const exp = await analyzer.createExportObject();
    expect(exp.address).toBe("820 Island Dr, Alameda, CA 94502");
    expect(exp.contact).toBe("Kyle Chuah");
  });

  test("a 'Not found' field is left untouched (not mangled by normalization)", async () => {
    // WHY: normalizeWhitespace is a no-op on the "Not found" sentinel and on a clean string, so
    // centralizing it changes nothing for the common case — only collapses genuine messy text.
    vi.useFakeTimers();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 60 }) }));
    const analyzer = createAnalyzer(makeAdapter({ listing: makeListing({ contact: "Not found" }) }));
    analyzer.runPipeline();
    await vi.runAllTimersAsync();
    expect(document.getElementById("prop-contact").textContent).toBe("Not found");
  });
});

import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchEquity } from "../../src/browser/services/equity.js";
import { fetchStrRevenue } from "../../src/browser/services/str-revenue.js";

// These services were split out of the per-repo equity-service / str-revenue-service classes,
// which had welded the network call to per-repo state, the panel DOM, and a navigation guard.
// The split's whole point: the fetcher is agnostic — call it, get data, the caller decides
// what to do. These tests pin that purity: a fetcher must touch nothing but the network and
// must hand back a value (or null) the caller can act on. If a fetcher started caching or
// reaching into the DOM again, that's the regression these guard against.

describe("fetchEquity — agnostic equity IO", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(impl) {
    global.fetch = vi.fn(impl);
  }

  test("normalizes a numeric equity to a percent string", async () => {
    // WHY: the API may return a bare number; the panel renders a "<n>%" string, so the
    // fetcher normalizes. Callers should never have to second-guess the shape.
    mockFetch(async () => ({ ok: true, json: async () => ({ equity: 75 }) }));
    expect(await fetchEquity("123 Main St")).toBe("75%");
  });

  test("normalizes a unit-less string equity, preserves one that already has %", async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ equity: "80" }) }));
    expect(await fetchEquity("x")).toBe("80%");
    mockFetch(async () => ({ ok: true, json: async () => ({ equity: "90%" }) }));
    expect(await fetchEquity("x")).toBe("90%");
  });

  test("returns null when the response carries no usable equity", async () => {
    // WHY null not throw: a valid response that simply lacks equity is the caller's
    // 'use the fallback' signal, distinct from a transport failure.
    mockFetch(async () => ({ ok: true, json: async () => ({}) }));
    expect(await fetchEquity("x")).toBeNull();
  });

  test("throws on a non-OK HTTP status (caller folds this into its fallback)", async () => {
    mockFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(fetchEquity("x")).rejects.toThrow(/500/);
  });

  test("encodes the address into the query string", async () => {
    // WHY: addresses contain spaces/commas; an unencoded URL would corrupt the lookup.
    const spy = vi.fn(async () => ({ ok: true, json: async () => ({ equity: 50 }) }));
    mockFetch(spy);
    await fetchEquity("820 Island Dr, FL");
    expect(spy.mock.calls[0][0]).toContain(encodeURIComponent("820 Island Dr, FL"));
  });
});

describe("fetchStrRevenue — agnostic STR IO", () => {
  test("returns null until the backend ships (estimate path stays active)", async () => {
    // WHY: the str-revenue endpoint is not built; the fetcher returns null so the engine
    // falls back to the 5.5% estimate. This is the dormant-but-wired seam.
    expect(await fetchStrRevenue("anything")).toBeNull();
  });
});

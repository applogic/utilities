import { describe, expect, test } from "vitest";
import { fetchStrRevenue } from "../../src/browser/services/str-revenue.js";

// These services were split out of the per-repo service classes, which had welded the network
// call to per-repo state, the panel DOM, and a navigation guard. The split's whole point: the
// fetcher is agnostic — call it, get data, the caller decides what to do. (Equity is no longer
// fetched as a %; the debt service drives it now — see tests/services/debt.test.js.)

describe("fetchStrRevenue — agnostic STR IO", () => {
  test("returns null until the backend ships (estimate path stays active)", async () => {
    // WHY: the str-revenue endpoint is not built; the fetcher returns null so the engine
    // falls back to the 5.5% estimate. This is the dormant-but-wired seam.
    expect(await fetchStrRevenue("anything")).toBeNull();
  });
});

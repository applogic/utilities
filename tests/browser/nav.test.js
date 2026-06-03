// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { createNav } from "../../src/browser/widget/nav.js";

// The nav unit owns the on/off-listing decision. Isolating it lets us test the off-listing path
// (footer teardown) directly — previously only reachable by driving a full SPA navigation.

function makeCtx() {
  return { resetForNavigation: vi.fn() };
}

afterEach(() => {
  document.getElementById("ln-footer")?.remove();
  vi.restoreAllMocks();
});

describe("createNav.handleNavigation", () => {
  test("off a listing: removes the footer and does not re-run the pipeline", () => {
    // WHY: navigating away from a listing must tear the panel down, not rebuild it onto a
    // non-listing page (and must not reset state for a render that won't happen).
    document.body.innerHTML = `<div id="ln-footer">panel</div>`;
    const ctx = makeCtx();
    const runPipeline = vi.fn();
    const nav = createNav({
      adapter: { getListingId: () => "a", matches: () => false, scrape: () => ({}) },
      config: {},
      ctx,
      runPipeline,
    });

    nav.handleNavigation();

    expect(document.getElementById("ln-footer")).toBeNull();
    expect(runPipeline).not.toHaveBeenCalled();
    expect(ctx.resetForNavigation).not.toHaveBeenCalled();
  });

  test("onto a new listing: resets state then re-runs the pipeline", () => {
    // WHY: a fresh listing must start from a clean reset (no stale memoized NOI/price bleeding
    // from the previous listing) before the pipeline repaints.
    const ctx = makeCtx();
    const runPipeline = vi.fn();
    const nav = createNav({
      adapter: { getListingId: () => "b", matches: () => true, scrape: () => ({}) },
      config: {},
      ctx,
      runPipeline,
    });

    nav.handleNavigation();

    expect(ctx.resetForNavigation).toHaveBeenCalledTimes(1);
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });
});

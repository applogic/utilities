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

describe("createNav.setupSpaWatcher — URL poll fallback", () => {
  // Save/restore the History methods setupSpaWatcher patches so the wrapper does not leak.
  let originalPushState;
  let originalReplaceState;

  afterEach(() => {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    vi.useRealTimers();
  });

  test("a navigation that bypasses the patched History methods is still caught by the poll", () => {
    // WHY: Next.js (Zillow) navigates by calling a private reference to history.pushState it
    // captured before our content script patched it, so the patched methods never fire and the
    // panel would stay on the old listing until a full reload. The URL poll catches the listing-id
    // change regardless of how it was triggered — here the id flips with NO pushState/popstate.
    vi.useFakeTimers();
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    let id = "listing-1";
    const ctx = makeCtx();
    const runPipeline = vi.fn();
    const nav = createNav({
      adapter: { getListingId: () => id, matches: () => true, scrape: () => ({}) },
      config: {},
      ctx,
      runPipeline,
    });
    nav.setupSpaWatcher();

    // Framework navigates without touching the patched History API.
    id = "listing-2";
    vi.advanceTimersByTime(400);

    expect(ctx.resetForNavigation).toHaveBeenCalledTimes(1);
    expect(runPipeline).toHaveBeenCalledTimes(1);

    // A subsequent poll with no further change must not re-fire (idempotent on a stable URL).
    vi.advanceTimersByTime(400);
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });
});

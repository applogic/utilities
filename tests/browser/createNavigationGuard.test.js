import { describe, expect, test } from "vitest";
import { createNavigationGuard } from "../../src/browser/widget/createNavigationGuard.js";

describe("createNavigationGuard", () => {
  test("throws when getCurrentId is not a function", () => {
    // WHY: a guard built around a non-callable identity would silently never
    // detect navigation, reintroducing the exact stale-response bug it exists to stop.
    expect(() => createNavigationGuard(null)).toThrow(TypeError);
    expect(() => createNavigationGuard("zpid")).toThrow(TypeError);
  });

  test("isStale() is false before capture() is ever called", () => {
    // WHY: a response that arrives before any request was guarded must not be
    // dropped — there is no captured identity to compare against.
    const guard = createNavigationGuard(() => "A");
    expect(guard.isStale()).toBe(false);
  });

  test("returns not stale while the identity is unchanged (SPA, same listing)", () => {
    const id = "zpid-A";
    const guard = createNavigationGuard(() => id);
    expect(guard.capture()).toBe("zpid-A");
    expect(guard.isStale()).toBe(false);
  });

  test("returns stale once the identity changes after capture (SPA navigation)", () => {
    // WHY: this is the whole point — the user navigated A->B mid-request, so A's
    // late response must be dropped instead of caching onto B.
    let id = "zpid-A";
    const guard = createNavigationGuard(() => id);
    guard.capture();
    id = "zpid-B";
    expect(guard.isStale()).toBe(true);
  });

  test("MPA target with a stable identity is never stale", () => {
    // WHY: LoopNet does a full page reload per listing, so the identity is fixed
    // for the page's life; the shared async services must behave exactly as before.
    const guard = createNavigationGuard(() => "stable");
    guard.capture();
    expect(guard.isStale()).toBe(false);
  });
});

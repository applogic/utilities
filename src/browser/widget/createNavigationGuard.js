/**
 * Navigation guard for in-flight async work on SPA platforms.
 *
 * On a single-page-app target (e.g. Zillow) the user can navigate from listing A
 * to listing B before a slow request (equity, STR revenue) resolves. Without a
 * guard, A's late response gets cached onto B and the panel silently shows the
 * wrong numbers. Capture an identity at request start; drop the response if the
 * current identity no longer matches.
 *
 * Multi-page-app targets (e.g. LoopNet, full reload) pass a getCurrentId whose
 * value is stable for the page's life — isStale() is then always false, so the
 * shared async services behave exactly as before with no per-platform branching.
 *
 * @param {() => (string|number|null|undefined)} getCurrentId - returns the
 *   current listing identity (e.g. the zpid parsed from the URL)
 * @returns {{ capture: () => (string|number|null|undefined), isStale: () => boolean }}
 */
export function createNavigationGuard(getCurrentId) {
  if (typeof getCurrentId !== "function") {
    throw new TypeError("createNavigationGuard requires a getCurrentId function");
  }

  let capturedId;
  let captured = false;

  return {
    /**
     * Snapshot the current identity. Call this at the start of an async request.
     * @returns the captured identity
     */
    capture() {
      capturedId = getCurrentId();
      captured = true;
      return capturedId;
    },

    /**
     * True if the current identity differs from the captured one (the user
     * navigated away). Returns false if capture() was never called.
     * @returns {boolean}
     */
    isStale() {
      if (!captured) return false;
      return getCurrentId() !== capturedId;
    }
  };
}

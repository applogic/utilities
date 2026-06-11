// Nav unit: the always-on History-API SPA watcher + the on/off-listing navigation handler and
// the start() entry point. On a full-reload site getListingId is stable so the patched History
// methods simply never fire a navigation. Extracted verbatim from createAnalyzer (T12).

// Fallback poll for the SPA URL. Frameworks like Next.js (Zillow) navigate by calling a private
// reference to history.pushState they captured before our content script patched it, so the
// patched methods below never fire — the panel would stay on the old listing until a full reload.
// Polling location.href catches the change regardless of how it was triggered; the check is a
// cheap string compare gated on the listing id, so a no-op when nothing navigated.
const SPA_URL_POLL_INTERVAL = 400;

export function createNav({ adapter, config, ctx, runPipeline }) {
  const { resetForNavigation } = ctx;
  const listingId = () => adapter.getListingId(window.location.href);

  function handleNavigation() {
    if (!adapter.matches(window.location.href)) {
      document.getElementById("ln-footer")?.remove();
      return;
    }
    resetForNavigation();
    runPipeline();
  }

  function setupSpaWatcher() {
    let currentId = listingId();
    const onUrlMaybeChanged = () => {
      const newId = listingId();
      if (newId === currentId) return;
      currentId = newId;
      handleNavigation();
    };

    // SPA platforms navigate via the History API (no event); patch both methods and listen
    // for back/forward. On a full-reload site these simply never fire.
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        onUrlMaybeChanged();
        return result;
      };
    }
    window.addEventListener("popstate", onUrlMaybeChanged);

    // Safety net for frameworks that bypass the patched History methods (see note above).
    setInterval(onUrlMaybeChanged, SPA_URL_POLL_INTERVAL);
  }

  function start() {
    if (adapter.matches(window.location.href)) runPipeline();
    if (config.spa !== false) setupSpaWatcher();
  }

  return { handleNavigation, setupSpaWatcher, start };
}

// Shared "click to reveal" runner. Some listing sites gate data (broker phone, email, OM
// access) behind a button the user must click. A platform declares these as DATA in its
// config.reveals; the engine awaits runReveals(config.reveals) BEFORE scrape() so the pure
// scraper reads the already-revealed DOM. The engine stays generic — it knows nothing about
// phones; the platform/config dictates how (which selectors) and when (which page).
//
// Each reveal: { name?, trigger, waitFor?, timeout? }
//   trigger  — CSS selector for the element to click (comma lists allowed)
//   waitFor  — CSS selector for the content the click reveals; also the idempotency check
//              (if it is already present, the trigger is NOT clicked again on a re-run)
//   timeout  — ms to wait for waitFor to appear before giving up (default 1500)
// When waitFor is omitted, the runner clicks then waits the full timeout (a fixed delay).

const DEFAULT_TIMEOUT = 1500;
const POLL_INTERVAL = 100;

// Resolve once `selector` is in the DOM, or after `timeout` ms — whichever comes first.
// Poll-count based (not Date.now) so it behaves under both real and faked timers.
function waitForSelector(selector, timeout) {
  return new Promise((resolve) => {
    let remaining = Math.max(0, Math.ceil(timeout / POLL_INTERVAL));
    const check = () => {
      if (document.querySelector(selector)) {
        resolve(true);
        return;
      }
      if (remaining-- <= 0) {
        resolve(false);
        return;
      }
      setTimeout(check, POLL_INTERVAL);
    };
    check();
  });
}

// Wait a fixed number of ms (used when a reveal has no waitFor selector).
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runReveals(reveals) {
  if (!Array.isArray(reveals) || reveals.length === 0) return;

  for (const reveal of reveals) {
    if (!reveal || typeof reveal.trigger !== "string") continue;
    const timeout = Number.isFinite(reveal.timeout) ? reveal.timeout : DEFAULT_TIMEOUT;

    // Idempotent: if the revealed content is already on the page, skip the click. Lets the
    // pipeline re-run (SPA) without re-triggering, and no-ops on pages that ship the data.
    if (reveal.waitFor && document.querySelector(reveal.waitFor)) continue;

    const triggerEl = document.querySelector(reveal.trigger);
    if (!triggerEl) continue;

    try {
      triggerEl.click();
    } catch (error) {
      console.error(`❌ Reveal "${reveal.name || reveal.trigger}" click failed:`, error);
      continue;
    }

    if (reveal.waitFor) {
      await waitForSelector(reveal.waitFor, timeout);
    } else {
      await delay(timeout);
    }
  }
}

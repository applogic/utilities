// Pipeline unit: the re-runnable footer pipeline — builds the shared panel, wires the clickable
// elements, runs the main async update (scrape -> financials -> lead status -> STR -> equity with
// the navigation guard between awaits), and drives the immediate/observer/load entry points.
// Extracted verbatim from createAnalyzer (T12).

import { createNavigationGuard } from "./createNavigationGuard.js";
import { createPanel } from "./createPanel.js";
import { runReveals } from "./runReveals.js";
import { syncInterestRateForUnits } from "./interestRateSync.js";
import {
  setupAwningLinkHandler,
  setupCapRateClickHandler,
  setupDiscountButtonHandler,
  setupDownPaymentClickHandler,
  setupNoiClickHandler,
  setupPriceClickHandler,
} from "../ui/click-handlers.js";
import { calculateFinancials } from "../financial/calculateFinancials.js";
import { calculateDOM } from "../../date/utilities.js";
import { normalizeWhitespace } from "../../formatting/text.js";

// Some sites (e.g. Zillow) client-render parts of a listing — the listing-agent attribution and
// the price-history table — a beat AFTER first paint, so the pipeline's single initial scrape
// reads "Not found" for the fields they carry (contact, phone, listing date). After the first
// render we poll the pure scrape() for just those display fields and fill them in as they arrive,
// until all are present or this budget elapses. Poll-count based (like runReveals' waitForSelector)
// so it stays bounded and predictable under heavy DOM churn.
const LATE_FIELD_TIMEOUT = 10000;
const LATE_FIELD_POLL_INTERVAL = 300;

// The main render waits for the page to expose a scrapeable PRICE before it commits — price is the
// field every financial metric derives from. On a full page load the server-rendered JSON-LD has it
// immediately; on an SPA overlay (Zillow search -> listing) it is client-painted a beat after the
// navigation fires, so an eager scrape would read no price and paint N/A everywhere with no recovery.
// If the price never becomes scrapeable (a genuinely price-less/off-market listing) the timeout lets
// the render proceed anyway, so the panel never hangs on "Loading..." — it shows the honest no-price state.
const DATA_READY_TIMEOUT = 8000;
const DATA_READY_POLL_INTERVAL = 300;

export function createPipeline({ adapter, config, ctx, exportOps, finance, render, resolveCssUrls, services }) {
  const { state, updateState } = ctx;
  const listingId = () => adapter.getListingId(window.location.href);

  function setupClickableElements(data) {
    const nameElement = document.getElementById("prop-name");
    if (nameElement && data.name && data.name !== "Not found") {
      nameElement.style.cursor = "pointer";
      nameElement.style.textDecoration = "underline";
      nameElement.onclick = () => {
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(data.name)}`;
        window.open(searchUrl, "_blank");
      };
    }

    // The shared click-handlers read callbacks.state / callbacks.updateState — the engine's
    // ctx is injected here (no global-state coupling).
    const callbacks = {
      getCurrentPrice: render.getCurrentPrice,
      recalculateFinancials: finance.recalculateFinancials,
      state,
      updatePercentageLabels: render.updatePercentageLabels,
      updatePriceLabel: render.updatePriceLabel,
      updateState,
    };

    const priceElement = document.getElementById("prop-price");
    setupPriceClickHandler(priceElement, priceElement?.closest(".metric")?.querySelector(".metric-label"), callbacks);

    const capElement = document.getElementById("prop-cap");
    setupCapRateClickHandler(capElement, capElement?.closest(".metric")?.querySelector(".metric-label"), callbacks);

    const downElement = document.getElementById("prop-down");
    setupDownPaymentClickHandler(downElement, downElement?.closest(".metric")?.querySelector(".metric-label"), callbacks);

    const noiElement = document.getElementById("prop-noi");
    setupNoiClickHandler(noiElement, noiElement?.closest(".metric")?.querySelector(".metric-label"), callbacks);
    setupAwningLinkHandler(document.getElementById("prop-noi-awning"));

    setupDiscountButtonHandler(document.getElementById("ln-discount-btn"), callbacks);
  }

  // Progressive fill for fields a site renders after first paint (see LATE_FIELD_* above).
  // Re-reads ONLY the scrape-derived display fields (contact, phone, listing date) via the pure
  // adapter.scrape() — never scrapeAndApply, so it touches no state and re-applies no cap rate —
  // and updates only those three elements; price/NOI/financials and all network calls are left
  // alone. Stops as soon as every field is present (so a server-rendered site like LoopNet, where
  // the first read already has them, never starts a poll), when the budget elapses, or when the
  // page navigated to another listing (guard). Whitespace is normalized here to match the
  // contract's single normalization point in finance.scrapeAndApply (e.g. a broker name that the
  // markup splits across lines).
  function watchLateFields(guard) {
    const isPresent = (value) => typeof value === "string" && value.trim() !== "" && value !== "Not found";

    const applyLateFields = () => {
      const data = adapter.scrape();
      if (!data) return false;
      const contact = normalizeWhitespace(data.contact);
      const phone = normalizeWhitespace(data.phone);
      const listingDate = normalizeWhitespace(data.listingDate);
      render.updateElement("prop-contact", contact);
      render.updateElement("prop-phone", phone);
      render.updateElement("prop-dom", calculateDOM(listingDate));
      return isPresent(contact) && isPresent(phone) && isPresent(listingDate);
    };

    if (applyLateFields()) return;

    // A reveal's trigger (e.g. LoopNet's "Call" button) can render AFTER the one-shot runReveals
    // in updateFooterData fired — the broker CTA paints a beat after price/title — so the gated
    // field (phone) is never clicked into the DOM and the scrape poll above finds nothing to fill.
    // Re-run the idempotent reveals alongside the poll: runReveals no-ops once its waitFor target
    // is present, so this clicks each trigger at most once. The overlap guard prevents a second
    // click during the window between the first click and the revealed content appearing.
    let revealing = false;
    const retryReveals = () => {
      if (revealing || !config.reveals?.length) return;
      revealing = true;
      runReveals(config.reveals).finally(() => {
        revealing = false;
      });
    };

    let remaining = Math.ceil(LATE_FIELD_TIMEOUT / LATE_FIELD_POLL_INTERVAL);
    const tick = () => {
      if (guard.isStale()) return;
      retryReveals();
      if (applyLateFields() || remaining-- <= 0) return;
      setTimeout(tick, LATE_FIELD_POLL_INTERVAL);
    };
    setTimeout(tick, LATE_FIELD_POLL_INTERVAL);
  }

  async function updateFooterData() {
    // The listing this run is for. On an SPA the page can navigate mid-flight; after each
    // await we drop out if the identity changed, so a stale run never writes onto another
    // listing's panel. On a full-reload site getListingId is stable, so isStale() is always
    // false and this is a no-op.
    const guard = createNavigationGuard(listingId);
    guard.capture();

    // Click-to-reveal any data gated behind a button (broker phone/email, OM access) so the
    // pure scrape() below reads it. Platform-declared (config.reveals); a no-op when absent.
    if (config.reveals?.length) {
      await runReveals(config.reveals);
      if (guard.isStale()) return;
    }

    const data = finance.scrapeAndApply();
    if (!data) {
      console.error("❌ Malformed listing data — missing a contract field, refusing to render");
      render.updateElement("prop-name", "Data error — see console");
      return;
    }

    const unitCount = data.unitCount ?? 4;
    updateState({ numberOfUnits: unitCount });
    const unitsInput = document.getElementById("ln-units-input");
    if (unitsInput) unitsInput.value = unitCount;

    syncInterestRateForUnits(state, updateState, unitCount);

    render.updateElement("prop-name", data.name);
    // Display guard (H2): a defaulted price shows "No price"; the metrics fall through to N/A.
    render.updateElement("prop-price", state.priceWasDefaulted ? "No price" : data.price);
    render.updateElement("prop-contact", data.contact);
    render.updateElement("prop-phone", data.phone);
    render.updateElement("prop-dom", calculateDOM(data.listingDate));

    render.updatePriceLabel();
    render.updateCapRateLabel();
    render.syncUnitsFieldForType(state.currentPropertyType, data.bedroomCount);
    setupClickableElements(data);

    // Fields some sites render after first paint (agent contact/phone, listing date) start as
    // "Not found" above; fill them in progressively as they arrive without blocking what follows.
    watchLateFields(guard);

    const calculationCapRate = state.isUsingEstimatedCapRate ? `${state.currentEstimatedCapRate}%` : data.capRate;
    const financials = await calculateFinancials(ctx, data.price, calculationCapRate, state.currentPropertyType, data.name);
    if (guard.isStale()) return;
    render.applyFinancials(financials);
    render.updateActiveCapDisplay();

    const loiData = await services.loadLeadStatus(data.name);
    if (guard.isStale()) return;
    render.updateElement("prop-lead-status", loiData.leadStatus);
    render.updateLeadStatusTooltip(loiData);

    // STR revenue seam: the footer already shows the 5.5%-of-price estimate. If the backend
    // returns real data, recompute the STR NOI with it. Dormant until that backend ships.
    const strResult = await services.loadStrValue(data.name, guard);
    if (guard.isStale()) return;
    if (strResult && state.currentPropertyType === "str") {
      updateState({ baseNOI: null });
      await finance.recalculateFinancials();
      if (guard.isStale()) return;
    }

    await services.loadDebt(data.name, guard);
    if (guard.isStale()) return;
    // Recompute (not just repaint equity) so the equity-aware red state picks up the newly
    // loaded debt; recalculateFinancials calls updateEquityDisplay internally.
    await finance.recalculateFinancials();
  }

  // One running pipeline at a time. Re-runnable so the SPA watcher can rebuild per listing;
  // the observer is tracked so a re-run detaches the previous one.
  let footerUpdated = false;
  let pipelineObserver = null;

  function runPipeline() {
    footerUpdated = false;
    if (pipelineObserver) {
      pipelineObserver.disconnect();
      pipelineObserver = null;
    }

    createPanel({
      callbacks: {
        onExportClick: exportOps.handleExportClick,
        onInterestRateTypeChange: () => finance.recalculateFinancials(),
        onPropertyTypeChange: () => {
          finance.handlePropertyTypeChange();
          render.updateCapRateLabel();
          const listing = adapter.scrape();
          render.syncUnitsFieldForType(state.currentPropertyType, listing?.bedroomCount);
          finance.recalculateFinancials();
        },
        state,
        updateState,
      },
      cssUrls: resolveCssUrls(config.cssFiles),
      defaultPropertyType: config.defaultPropertyType,
    });

    const runUpdateOnce = async () => {
      if (footerUpdated) return;
      footerUpdated = true;
      await updateFooterData();
    };

    const stopObserver = () => {
      if (pipelineObserver) {
        pipelineObserver.disconnect();
        pipelineObserver = null;
      }
    };

    // The panel's own elements are built (createPanel's async append finished).
    const panelReady = () => {
      const nameEl = document.getElementById("prop-name");
      const priceEl = document.getElementById("prop-price");
      return !!(nameEl && priceEl && nameEl.textContent.trim() && priceEl.textContent.trim());
    };

    // The page exposes a real, scrapeable price (see DATA_READY_* above). Pure read — no state writes.
    const priceReady = () => {
      const listing = adapter.scrape();
      return !!listing && listing.price !== "Not found" && !listing.priceWasDefaulted;
    };

    // Run the main update once the panel is built AND the price is scrapeable. `force` (the timeout
    // path) commits even without a price so a price-less listing renders its honest no-price state.
    const tryImmediateUpdate = (force = false) => {
      if (!panelReady()) return false;
      if (!force && !priceReady()) return false;
      runUpdateOnce();
      return true;
    };

    if (tryImmediateUpdate()) return;

    pipelineObserver = new MutationObserver(() => {
      if (tryImmediateUpdate()) stopObserver();
    });
    pipelineObserver.observe(document.body, { childList: true, subtree: true });

    // Bounded fallback for SPA overlays (already readyState "complete", so the load event never
    // fires) and for listings whose price never paints: poll until the price is scrapeable, then
    // force the render at the timeout so the panel never hangs on "Loading...".
    let waited = 0;
    const fallbackPoll = () => {
      if (footerUpdated) return;
      if (tryImmediateUpdate(waited >= DATA_READY_TIMEOUT)) {
        stopObserver();
        return;
      }
      waited += DATA_READY_POLL_INTERVAL;
      setTimeout(fallbackPoll, DATA_READY_POLL_INTERVAL);
    };
    setTimeout(fallbackPoll, DATA_READY_POLL_INTERVAL);
  }

  return { runPipeline, updateFooterData };
}

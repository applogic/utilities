// Pipeline unit: the re-runnable footer pipeline — builds the shared panel, wires the clickable
// elements, runs the main async update (scrape -> financials -> lead status -> STR -> equity with
// the navigation guard between awaits), and drives the immediate/observer/load entry points.
// Extracted verbatim from createAnalyzer (T12).

import { createNavigationGuard } from "./createNavigationGuard.js";
import { createPanel } from "./createPanel.js";
import { runReveals } from "./runReveals.js";
import {
  setupCapRateClickHandler,
  setupDiscountButtonHandler,
  setupDownPaymentClickHandler,
  setupPriceClickHandler,
} from "../ui/click-handlers.js";
import { calculateFinancials } from "../financial/calculateFinancials.js";
import { calculateDOM } from "../../date/utilities.js";

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

    setupDiscountButtonHandler(document.getElementById("ln-discount-btn"), callbacks);
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

    if (unitCount > 11) {
      const irDropdown = document.getElementById("ln-interest-rate-type");
      if (irDropdown && irDropdown.value !== "dscr_commercial") {
        irDropdown.value = "dscr_commercial";
        updateState({ currentInterestRateType: "dscr_commercial" });
      }
    }

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
    render.updateEquityDisplay();
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

    const tryImmediateUpdate = () => {
      const nameEl = document.getElementById("prop-name");
      const priceEl = document.getElementById("prop-price");
      if (nameEl && priceEl && nameEl.textContent.trim() && priceEl.textContent.trim()) {
        runUpdateOnce();
        return true;
      }
      return false;
    };

    if (tryImmediateUpdate()) return;

    pipelineObserver = new MutationObserver((mutations, obs) => {
      if (tryImmediateUpdate()) {
        obs.disconnect();
        pipelineObserver = null;
      }
    });
    pipelineObserver.observe(document.body, { childList: true, subtree: true });

    // Safety fallback before the page has loaded; SPA navigations fire after load, so the
    // observer (not load) drives those.
    if (document.readyState !== "complete") {
      window.addEventListener("load", () => {
        setTimeout(() => {
          if (!footerUpdated) {
            runUpdateOnce();
            if (pipelineObserver) {
              pipelineObserver.disconnect();
              pipelineObserver = null;
            }
          }
        }, 5000);
      });
    }
  }

  return { runPipeline, updateFooterData };
}

// The common analyzer engine. A site becomes a thin adapter; this owns everything else:
// the panel, the re-runnable pipeline, the always-on History-API SPA watcher + navigation
// guard, the property-type / cap-rate logic, the export, and the orchestration around the
// agnostic services (caching, the loading indicator, the stale-drop, the fallbacks).
//
// Generalized from zillow-analyzer/content.js (the green SPA copy). The per-repo `state` /
// `updateState` / `resetForNavigation` singletons become an injected ctx (createAnalyzerState);
// extractData / isPropertyPage / getZpidFromUrl become the adapter; the equity / STR / LOI
// fetches become agnostic service calls the engine orchestrates.
//
/* global chrome */
// adapter = {
//   matches(url): boolean,            // is this a listing page (was isPropertyPage)
//   getListingId(url): string|null,   // listing identity for the SPA watcher (was zpid)
//   scrape(): Listing,                // the Listing contract (see browser/index.js)
//   config: { defaultPropertyType, cssFiles, spa? },
// }

import { calculateFinancials } from "../financial/calculateFinancials.js";
import { createAnalyzerState } from "./createAnalyzerState.js";
import { createNavigationGuard } from "./createNavigationGuard.js";
import { createPanel } from "./createPanel.js";
import { fetchEquity } from "../services/equity.js";
import { fetchStrRevenue } from "../services/str-revenue.js";
import {
  setupCapRateClickHandler,
  setupDiscountButtonHandler,
  setupDownPaymentClickHandler,
  setupPriceClickHandler,
} from "../ui/click-handlers.js";
import {
  generateCashFlowTooltipHTML,
  generateDownPaymentTooltipHTML,
} from "../financial/tooltip-content-generators.js";
import { parseCashFlowData, parseFinancialData } from "../financial/tooltip-calculations.js";
import { attachTooltip, hasTooltip, updateTooltipContent } from "../ui/tooltip-manager.js";
import { createExportObjectCore } from "../../export/export-logic.js";
import { calculateDOM } from "../../date/utilities.js";
import { BUSINESS_CONSTANTS } from "../../config/business.js";
import { FINANCIAL_CONSTANTS } from "../../config/financial.js";
import { lookupLOI } from "../../services/loi-lookup.js";
import { LOI_SENT_STATUS, MATCH_TYPES } from "../../config/loi-lookup.js";

// The Listing fields every scraper must return as strings (default "Not found"). A missing or
// non-string field means the scraper broke; the engine refuses to render/export rather than
// letting `undefined` flow into the NOI/COCR math and silently paint wrong numbers (fail-loud).
const LISTING_CONTRACT_FIELDS = ["name", "price", "capRate", "contact", "phone", "listingDate"];

function isValidListingShape(data) {
  if (!data || typeof data !== "object") return false;
  return LISTING_CONTRACT_FIELDS.every((field) => typeof data[field] === "string");
}

const FINANCIAL_ELEMENT_IDS = [
  "prop-noi", "prop-down", "prop-net", "prop-seller-fi", "prop-cocr-30",
  "prop-cocr-15", "prop-assignment", "prop-dscr", "prop-sf", "prop-cashflow",
];

export function createAnalyzer(adapter) {
  // Construction-validation: fail loud at wiring time, not deep in the pipeline.
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("createAnalyzer(adapter): adapter must be an object");
  }
  for (const fn of ["matches", "getListingId", "scrape"]) {
    if (typeof adapter[fn] !== "function") {
      throw new TypeError(`createAnalyzer(adapter): adapter.${fn} must be a function`);
    }
  }
  const config = adapter.config || {};

  const ctx = createAnalyzerState({ defaultPropertyType: config.defaultPropertyType });
  const { state, updateState, resetForNavigation } = ctx;

  const listingId = () => adapter.getListingId(window.location.href);

  // ---- price helpers ----------------------------------------------------------------

  function getCurrentPrice() {
    if (state.originalPrice && state.currentPriceDiscount > 0) {
      const numericPrice = parseFloat(state.originalPrice.replace(/[$,]/g, ""));
      const discountedPrice = numericPrice * (1 - state.currentPriceDiscount / 100);
      return `$${Math.round(discountedPrice).toLocaleString()}`;
    }
    return state.originalPrice;
  }

  function updatePriceLabel() {
    const priceLabelElement = document.querySelector("#prop-price")?.closest(".metric")?.querySelector(".metric-label");
    if (priceLabelElement) {
      priceLabelElement.textContent = state.currentPriceDiscount > 0 ? `Price (${state.currentPriceDiscount}%)` : "Price";
    }
  }

  function updatePercentageLabels() {
    const downLabelElement = document.querySelector("#prop-down")?.closest(".metric")?.querySelector(".metric-label");
    if (downLabelElement) downLabelElement.textContent = `Down (${state.currentDownPaymentPercent}%)`;

    const sellerFiLabelElement = document.querySelector("#prop-seller-fi")?.closest(".metric")?.querySelector(".metric-label");
    if (sellerFiLabelElement) sellerFiLabelElement.textContent = `Seller FI (${state.currentSellerFiPercent}%)`;

    const dscrLabelElement = document.querySelector("#prop-dscr")?.closest(".metric")?.querySelector(".metric-label");
    if (dscrLabelElement) dscrLabelElement.textContent = `DSCR (${state.currentDSCRPercent}%)`;
  }

  function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  // ---- property type + cap rate (engine-owned) --------------------------------------

  function handlePropertyTypeChange() {
    const dropdown = document.getElementById("ln-property-type");
    if (!dropdown) return;
    const newType = dropdown.value;
    updateState({ currentPropertyType: newType });
    if (newType !== "str") updateState({ cachedSTRData: null });
    updateState({ baseNOI: null });
    return newType;
  }

  function updateCapRateLabel() {
    const capLabelElement = document.querySelector("#prop-cap")?.closest(".metric")?.querySelector(".metric-label");
    if (!capLabelElement) return;
    switch (state.currentPropertyType) {
      case "str": capLabelElement.textContent = "Cap Rate (STR)"; break;
      case "assisted": capLabelElement.textContent = "Cap Rate (Assisted)"; break;
      default: capLabelElement.textContent = "Cap Rate"; break;
    }
  }

  // The panel shows the ACTIVE cap rate = NOI / current price (discount-aware via
  // getCurrentPrice), so the displayed cap is always internally consistent with the NOI metric
  // — including STR/assisted, where NOI is the type estimate/bedroom value and the listed cap
  // never drove it. The REPORTED cap (the scraped value, only when it was a real non-estimated
  // cap) is shown on hover; "N/A" when none was reported. When the cap is an estimate the
  // tooltip also keeps the click-to-cycle hint (clicking the cap is a manual NOI override).
  function updateActiveCapDisplay() {
    const capElement = document.getElementById("prop-cap");
    if (!capElement) return;

    const priceText = getCurrentPrice() || document.getElementById("prop-price")?.textContent || "";
    const priceMatch = priceText.match(/[\d,]+/);
    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, "")) : null;

    if (Number.isFinite(state.baseNOI) && Number.isFinite(price) && price > 0) {
      capElement.textContent = `${((state.baseNOI / price) * 100).toFixed(1)}%`;
    } else {
      capElement.textContent = "N/A";
    }

    let reported = null;
    if (!state.isUsingEstimatedCapRate && state.originalCapRate) {
      const m = state.originalCapRate.match(/[\d.]+/);
      if (m) reported = parseFloat(m[0]);
    }
    const reportedLine = `<strong>Reported cap rate:</strong> ${reported != null ? `${reported}%` : "N/A"}`;
    const cycleHint = state.isUsingEstimatedCapRate
      ? "<hr><em>Click the cap rate to increase by 1%; click the label to reset</em>"
      : "";
    const tooltipContent = `${reportedLine}${cycleHint}`;

    const metric = capElement.closest(".metric");
    if (metric) {
      const label = metric.querySelector(".metric-label");
      if (!hasTooltip(metric)) {
        attachTooltip(metric, tooltipContent);
        if (label) label.classList.add("has-tooltip");
      } else {
        updateTooltipContent(metric, tooltipContent);
      }
    }
  }

  function syncUnitsFieldForType(propertyType, bedroomCount) {
    const label = document.querySelector(".units-inline-label");
    if (label) label.textContent = propertyType === "assisted" ? "beds" : "units";
    if (propertyType === "assisted" && bedroomCount != null) {
      const input = document.getElementById("ln-units-input");
      if (input) input.value = String(bedroomCount);
      updateState({ numberOfUnits: bedroomCount });
    }
  }

  // Resolve the cap-rate provenance from the scraped string and write the cap state the
  // financial calc + discount handlers read. Uses the existing "*" marker convention:
  // "6.5%" => real (not estimated); "6%*" => page estimate (whole-number percent); "Not
  // found" => engine applies the default estimate. The default is DEFAULT_CAP_RATE * 100 = 5
  // (whole-number percent) — fixing the latent no-cap bug where the decimal 0.05 was stored
  // and then divided by 100, computing NOI at 0.05%.
  function applyCapRate(listing) {
    const cap = listing.capRate;

    if (cap === "Not found") {
      const pct = FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE * 100;
      listing.capRate = `${pct}%*`;
      if (!state.originalCapRate) updateState({ originalCapRate: listing.capRate });
      if (!state.originalMultifamilyCapRate) updateState({ originalMultifamilyCapRate: `${pct}%` });
      updateState({
        currentEstimatedCapRate: pct,
        isUsingEstimatedCapRate: true,
        originalEstimatedCapRate: pct,
      });
      return;
    }

    const estimated = cap.includes("*");
    const match = cap.match(/[\d.]+/);
    const num = match ? parseFloat(match[0]) : null;

    updateState({ isUsingEstimatedCapRate: estimated });
    if (estimated && num !== null) updateState({ currentEstimatedCapRate: num });
    if (!state.originalCapRate) updateState({ originalCapRate: cap });
    if (!state.originalMultifamilyCapRate && num !== null) {
      updateState({ originalMultifamilyCapRate: `${num}%` });
    }
  }

  // Scrape the page and apply the universal scrape-derived state (was extractData's side
  // effects). Returns the resolved listing (capRate normalized to a display string) or null
  // when the scrape is malformed.
  function scrapeAndApply() {
    const listing = adapter.scrape();
    if (!isValidListingShape(listing)) return null;

    const priceWasDefaulted = listing.priceWasDefaulted ?? (listing.price === "Not found");
    updateState({ priceWasDefaulted });

    if (!priceWasDefaulted && !state.originalPrice) {
      updateState({ originalPrice: listing.originalPrice ?? listing.price });
    }

    applyCapRate(listing);
    return listing;
  }

  // ---- tooltips ---------------------------------------------------------------------

  function updateLeadStatusTooltip(loiData) {
    const leadElement = document.getElementById("prop-lead-status");
    if (!leadElement) return;
    let tooltipContent = "No LOI data returned";
    if (loiData) {
      tooltipContent = `
      <strong>Contact:</strong> ${loiData.contactName}  <br>
      ${loiData.opportunityAddress}
    `;
    }
    const metric = leadElement.closest(".metric");
    if (metric) {
      if (!hasTooltip(metric)) {
        attachTooltip(metric, tooltipContent);
        const label = metric.querySelector(".metric-label");
        if (label) label.classList.add("has-tooltip");
      } else {
        updateTooltipContent(metric, tooltipContent);
      }
    }
  }

  function updateDownHoverTooltip() {
    const downElement = document.getElementById("prop-down");
    const priceElement = document.getElementById("prop-price");
    const noiElement = document.getElementById("prop-noi");
    if (!downElement || !priceElement || !noiElement) return;

    const financialData = parseFinancialData(priceElement.textContent, noiElement.textContent);
    if (financialData) {
      const tooltipContent = generateDownPaymentTooltipHTML(
        financialData.price,
        financialData.noi,
        state.currentDownPaymentPercent,
        state.currentDSCRPercent,
        state.currentSellerFiPercent
      );
      const metric = downElement.closest(".metric");
      if (metric) {
        if (!hasTooltip(metric)) attachTooltip(metric, tooltipContent);
        else updateTooltipContent(metric, tooltipContent);
      }
    }
  }

  function updateCashFlowHoverTooltip() {
    const cashFlowElement = document.getElementById("prop-cashflow");
    const priceElement = document.getElementById("prop-price");
    if (!cashFlowElement || !priceElement) return;

    const cashFlowData = parseCashFlowData(priceElement.textContent, cashFlowElement.textContent);
    if (cashFlowData) {
      const tooltipContent = generateCashFlowTooltipHTML(cashFlowData.price, cashFlowData.monthlyCashFlow);
      const metric = cashFlowElement.closest(".metric");
      if (metric) {
        const label = metric.querySelector(".metric-label");
        if (label) label.classList.add("has-tooltip");
        if (!hasTooltip(metric)) attachTooltip(metric, tooltipContent);
        else updateTooltipContent(metric, tooltipContent);
      }
    }
  }

  function applyFinancials(financials) {
    let isCashFlowNegative = false;
    if (financials) {
      const elements = {
        "prop-noi": financials.noi,
        "prop-down": financials.down,
        "prop-net": financials.netToBuyer,
        "prop-seller-fi": financials.sellerFi,
        "prop-cocr-30": financials.cocr30,
        "prop-cocr-15": financials.priceForCOCR15,
        "prop-assignment": financials.assignment,
        "prop-dscr": financials.dscr,
        "prop-sf": financials.sfPayment,
        "prop-cashflow": financials.cashFlow,
      };
      isCashFlowNegative = financials.rawCashFlow < 0;
      for (const [id, value] of Object.entries(elements)) updateElement(id, value);
      setTimeout(() => {
        updateDownHoverTooltip();
        updateCashFlowHoverTooltip();
      }, 100);
    } else {
      FINANCIAL_ELEMENT_IDS.forEach((id) => updateElement(id, "N/A"));
    }

    updatePercentageLabels();
    const footer = document.getElementById("ln-footer");
    if (footer) footer.classList.toggle("negative", isCashFlowNegative);
  }

  async function recalculateFinancials() {
    const priceElement = document.getElementById("prop-price");
    const addressElement = document.getElementById("prop-name");
    if (!priceElement) return;

    const priceText = getCurrentPrice() || priceElement.textContent;
    const address = addressElement?.textContent || "";
    let capRateText;
    if (state.isUsingEstimatedCapRate) {
      capRateText = `${state.currentEstimatedCapRate}%*`;
    } else {
      const capElement = document.getElementById("prop-cap");
      capRateText = capElement ? capElement.textContent : "8%";
    }

    if (state.currentPropertyType === "str") updateState({ cachedSTRData: null });

    // Manual cap override: clicking the cap rate sets NOI = original price x cap for EVERY type
    // (analyst intent), so the active cap moves with the click even for STR/assisted whose NOI
    // is otherwise the type estimate / bedroom value. Pre-seed baseNOI so calculateFinancials
    // uses it instead of recomputing from the type model.
    if (state.capManuallySet) {
      const opText = state.originalPrice || priceText;
      const opMatch = opText.match(/[\d,]+/);
      if (opMatch) {
        const op = parseFloat(opMatch[0].replace(/,/g, ""));
        if (Number.isFinite(op) && op > 0) {
          updateState({ baseNOI: op * (state.currentEstimatedCapRate / 100) });
        }
      }
    }

    const financials = await calculateFinancials(ctx, priceText, capRateText, state.currentPropertyType, address);
    applyFinancials(financials);
    updateActiveCapDisplay();
  }

  // ---- agnostic service orchestration (engine-owned) --------------------------------

  // Caching + match-type mapping for the LOI lead status (was fetchLeadStatus). lookupLOI is
  // the agnostic call; the engine owns the cache (ctx.state.cachedLoiData) and the mapping.
  async function loadLeadStatus(address) {
    if (!state.cachedLoiData) updateState({ cachedLoiData: {} });
    if (state.cachedLoiData.leadStatus) {
      return {
        leadStatus: state.cachedLoiData.leadStatus,
        contactName: state.cachedLoiData.contactName,
        opportunityAddress: state.cachedLoiData.opportunityAddress,
      };
    }
    try {
      const result = await lookupLOI(address);
      let leadStatus = "New Lead";
      const data = result?.data || {};
      switch (result?.matchType) {
        case MATCH_TYPES.NO_RESPONSE:
          data.contactName = "LOI lookup failed";
          data.opportunityAddress = "to supply a response";
          break;
        case MATCH_TYPES.NO_MATCH:
          data.contactName = "LOI lookup replied with";
          data.opportunityAddress = "no match found";
          break;
        case MATCH_TYPES.EXACT:
        case MATCH_TYPES.FUZZY:
          leadStatus = LOI_SENT_STATUS;
          break;
        default:
          data.contactName = "LOI lookup failed";
          data.opportunityAddress = "unknown match type";
          break;
      }
      const loiData = {
        leadStatus,
        contactName: data.contactName || "No contact available",
        opportunityAddress: data.opportunityAddress || "(Unknown)",
      };
      updateState({ cachedLoiData: loiData });
      return loiData;
    } catch (error) {
      console.error("💥 Error fetching lead status:", error);
      return {
        leadStatus: "New Lead*",
        contactName: "No contact available",
        opportunityAddress: "Error fetching address",
      };
    }
  }

  // Equity orchestration (was equity-service.fetchEquity): cache-first, panel loading
  // indicator, 2s minimum loading, stale-drop via the pipeline guard, provenance + fallback.
  async function loadEquity(address, guard) {
    if (state.cachedEquity) return state.cachedEquity;

    updateState({ equityLoadingStartTime: Date.now() });
    const equityElement = document.getElementById("prop-equity");
    if (equityElement) {
      equityElement.classList.add("loading");
      equityElement.textContent = "";
    }

    let value = null;
    try {
      value = await fetchEquity(address);
    } catch (error) {
      console.error("Error fetching equity:", error);
      value = null;
    }

    const elapsed = Date.now() - state.equityLoadingStartTime;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 2000 - elapsed)));

    if (guard.isStale()) return null;
    if (equityElement) equityElement.classList.remove("loading");

    if (value != null) {
      updateState({ equitySource: "scraped", cachedEquity: value });
      return value;
    }
    updateState({ cachedEquity: "100%*" });
    return state.cachedEquity;
  }

  // STR-revenue orchestration (was str-revenue-service.fetchStrValue): cache-first, NOI
  // loading indicator, stale-drop, payload validation. Returns null until the backend ships.
  async function loadStrValue(address, guard) {
    if (state.cachedStrValue) return state.cachedStrValue;

    const noiElement = document.getElementById("prop-noi");
    if (noiElement) noiElement.classList.add("loading");

    try {
      const data = await fetchStrRevenue(address);
      if (guard.isStale()) return null;
      if (data && Number.isFinite(data.value) && (data.type === "noi" || data.type === "gross")) {
        updateState({ cachedStrValue: data });
        return data;
      }
      return null;
    } catch (error) {
      console.error("Error fetching STR revenue:", error);
      return null;
    } finally {
      if (!guard.isStale() && noiElement) noiElement.classList.remove("loading");
    }
  }

  // ---- export -----------------------------------------------------------------------

  async function ensureEquityLoaded(address) {
    if (state.cachedEquity) return state.cachedEquity;
    try {
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve("100%"), 3000));
      const equityPromise = fetchEquity(address).then((v) => v ?? "100%").catch(() => "100%");
      return await Promise.race([equityPromise, timeoutPromise]);
    } catch (error) {
      console.error("❌ Error ensuring equity loaded:", error);
      return "100%";
    }
  }

  async function createExportObject() {
    // Re-scrape so priceWasDefaulted reflects the page right now (never trust a stale flag).
    const data = scrapeAndApply();
    if (!data) {
      console.error("❌ Malformed listing data — refusing to export");
      return null;
    }

    const addressForEquity = data.name && data.name !== "Property Details" ? data.name : "";
    const cachedEquity = await ensureEquityLoaded(addressForEquity);

    return createExportObjectCore(data, {
      cachedEquity,
      currentDownPaymentPercent: state.currentDownPaymentPercent,
      currentInterestRateType: state.currentInterestRateType,
      currentPriceDiscount: state.currentPriceDiscount,
      currentPropertyType: state.currentPropertyType,
      equitySource: state.equitySource,
      isUsingEstimatedCapRate: state.isUsingEstimatedCapRate,
      numberOfUnits: state.numberOfUnits,
      priceWasDefaulted: state.priceWasDefaulted,
      windowLocation: window.location.href,
    });
  }

  async function createExportUrl() {
    try {
      const exportData = await createExportObject();
      if (!exportData) return null;
      const params = new URLSearchParams();
      Object.entries(exportData).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== "Loading..." && value !== "Not found") {
          params.append(key, value);
        }
      });
      return `${BUSINESS_CONSTANTS.EXPORT_URL_BASE}?${params.toString()}`;
    } catch (error) {
      console.error("❌ Error creating export URL:", error);
      return null;
    }
  }

  async function handleExportClick() {
    try {
      const exportBtn = document.getElementById("ln-export-btn");

      if (state.priceWasDefaulted) {
        console.warn("⚠️ Export blocked: no real price found for this listing");
        if (exportBtn) {
          const originalText = exportBtn.textContent;
          exportBtn.textContent = "No price — can't export";
          exportBtn.disabled = true;
          setTimeout(() => {
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
          }, 2000);
        }
        return;
      }

      if (exportBtn) {
        const originalText = exportBtn.textContent;
        exportBtn.textContent = "Loading...";
        exportBtn.disabled = true;
        setTimeout(() => {
          exportBtn.textContent = originalText;
          exportBtn.disabled = false;
        }, 2000);
      }

      const exportUrl = await createExportUrl();
      if (exportUrl) {
        window.open(exportUrl, "_blank");
      } else {
        console.error("❌ Failed to create export URL");
        alert("Error creating export URL. Check console for details.");
      }
    } catch (error) {
      console.error("❌ Error in handleExportClick:", error);
      alert(`Export failed: ${error.message}`);
    }
  }

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
      getCurrentPrice,
      recalculateFinancials,
      state,
      updatePercentageLabels,
      updatePriceLabel,
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

  // ---- main pipeline ----------------------------------------------------------------

  async function updateFooterData() {
    // The listing this run is for. On an SPA the page can navigate mid-flight; after each
    // await we drop out if the identity changed, so a stale run never writes onto another
    // listing's panel. On a full-reload site getListingId is stable, so isStale() is always
    // false and this is a no-op.
    const guard = createNavigationGuard(listingId);
    guard.capture();

    const data = scrapeAndApply();
    if (!data) {
      console.error("❌ Malformed listing data — missing a contract field, refusing to render");
      updateElement("prop-name", "Data error — see console");
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

    updateElement("prop-name", data.name);
    // Display guard (H2): a defaulted price shows "No price"; the metrics fall through to N/A.
    updateElement("prop-price", state.priceWasDefaulted ? "No price" : data.price);
    updateElement("prop-contact", data.contact);
    updateElement("prop-phone", data.phone);
    updateElement("prop-dom", calculateDOM(data.listingDate));

    updatePriceLabel();
    updateCapRateLabel();
    syncUnitsFieldForType(state.currentPropertyType, data.bedroomCount);
    setupClickableElements(data);

    const calculationCapRate = state.isUsingEstimatedCapRate ? `${state.currentEstimatedCapRate}%` : data.capRate;
    const financials = await calculateFinancials(ctx, data.price, calculationCapRate, state.currentPropertyType, data.name);
    if (guard.isStale()) return;
    applyFinancials(financials);
    updateActiveCapDisplay();

    const loiData = await loadLeadStatus(data.name);
    if (guard.isStale()) return;
    updateElement("prop-lead-status", loiData.leadStatus);
    updateLeadStatusTooltip(loiData);

    // STR revenue seam: the footer already shows the 5.5%-of-price estimate. If the backend
    // returns real data, recompute the STR NOI with it. Dormant until that backend ships.
    const strResult = await loadStrValue(data.name, guard);
    if (guard.isStale()) return;
    if (strResult && state.currentPropertyType === "str") {
      updateState({ baseNOI: null });
      await recalculateFinancials();
      if (guard.isStale()) return;
    }

    const equity = await loadEquity(data.name, guard);
    if (guard.isStale()) return;
    updateElement("prop-equity", equity);
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
        onExportClick: handleExportClick,
        onInterestRateTypeChange: () => recalculateFinancials(),
        onPropertyTypeChange: () => {
          handlePropertyTypeChange();
          updateCapRateLabel();
          const listing = adapter.scrape();
          syncUnitsFieldForType(state.currentPropertyType, listing?.bedroomCount);
          recalculateFinancials();
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
  }

  function start() {
    if (adapter.matches(window.location.href)) runPipeline();
    if (config.spa !== false) setupSpaWatcher();
  }

  return { ctx, createExportObject, handleNavigation, runPipeline, start };
}

// chrome.runtime.getURL resolves extension-relative CSS paths at runtime; guard it so the
// engine is loadable under jsdom / Node (tests) where `chrome` is absent.
function resolveCssUrls(cssFiles = []) {
  const hasChrome = typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function";
  return cssFiles.map((f) => (hasChrome ? chrome.runtime.getURL(f) : f));
}

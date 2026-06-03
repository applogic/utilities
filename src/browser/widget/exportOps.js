// Export unit: builds the export object (re-scraping for a fresh priceWasDefaulted flag),
// turns it into the dashboard import URL, and wires the export-button click (the defaulted-price
// refusal + the transient button states). Extracted verbatim from createAnalyzer (T12).

import { createExportObjectCore } from "../../export/export-logic.js";
import { BUSINESS_CONSTANTS } from "../../config/business.js";

export function createExportOps({ ctx, scrapeAndApply, ensureEquityLoaded }) {
  const { state } = ctx;

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
      noi: state.baseNOI,
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

  return { createExportObject, createExportUrl, handleExportClick };
}

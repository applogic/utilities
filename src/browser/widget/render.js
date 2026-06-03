// Render unit: the panel's DOM-painting helpers — price/label updates, the financial-metric
// paint, the active-cap display, and the hover tooltips. Everything here reads ctx.state and
// writes the DOM; the finance math it needs comes from the pure capRate helpers. Extracted
// verbatim from createAnalyzer's render closures (T12 decompose).

import { attachTooltip, hasTooltip, updateTooltipContent } from "../ui/tooltip-manager.js";
import {
  generateCashFlowTooltipHTML,
  generateDownPaymentTooltipHTML,
} from "../financial/tooltip-content-generators.js";
import { parseCashFlowData, parseFinancialData } from "../financial/tooltip-calculations.js";
import { computeActiveCapDisplay, parsePriceNumber, parseReportedCap } from "../financial/capRate.js";

const FINANCIAL_ELEMENT_IDS = [
  "prop-noi", "prop-down", "prop-net", "prop-seller-fi", "prop-cocr-30",
  "prop-cocr-15", "prop-assignment", "prop-dscr", "prop-sf", "prop-cashflow",
];

export function createRender({ ctx }) {
  const { state, updateState } = ctx;

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
    const price = parsePriceNumber(priceText);
    capElement.textContent = computeActiveCapDisplay(state.baseNOI, price);

    const reported = parseReportedCap(state.originalCapRate, state.isUsingEstimatedCapRate);
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

  return {
    applyFinancials,
    getCurrentPrice,
    syncUnitsFieldForType,
    updateActiveCapDisplay,
    updateCapRateLabel,
    updateElement,
    updateLeadStatusTooltip,
    updatePercentageLabels,
    updatePriceLabel,
  };
}

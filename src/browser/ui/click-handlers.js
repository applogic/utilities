import { attachTooltip, removeTooltip, updateTooltipContent } from './tooltip-manager.js';
import { generatePriceTooltipHTML, generateCapRateTooltipHTML, generateDownPaymentTooltipHTML } from '../financial/tooltip-content-generators.js';
import { FINANCIAL_CONSTANTS } from '../../config/financial.js';

// State is injected via the `callbacks` object (callbacks.state / callbacks.updateState)
// so this shared module has no dependency on any per-platform global-state singleton.

function updateDiscountButtonText(state) {
  const btn = document.getElementById("ln-discount-btn");
  if (!btn) return;
  btn.textContent = state.currentPriceDiscount > 0 ? "Reset to Asking" : "85% of Asking";
}

export function setupDiscountButtonHandler(buttonElement, callbacks) {
  if (!buttonElement) return;

  if (buttonElement.dataset.handlerAttached === 'true') return;
  buttonElement.dataset.handlerAttached = 'true';

  const { state, updateState } = callbacks;

  buttonElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (state.currentPriceDiscount > 0) {
      updateState({ currentPriceDiscount: 0 });
    } else {
      updateState({ currentPriceDiscount: 15 });
    }

    const priceElement = document.getElementById("prop-price");
    if (priceElement) {
      priceElement.textContent = callbacks.getCurrentPrice();
    }
    callbacks.updatePriceLabel();
    callbacks.recalculateFinancials();
    updateDiscountButtonText(state);
  });
}

export function setupPriceClickHandler(priceElement, priceLabelElement, callbacks) {
  if (!priceElement || !priceLabelElement) return;

  // Prevent duplicate attachment
  if (priceElement.dataset.handlerAttached === 'true') return;
  priceElement.dataset.handlerAttached = 'true';

  const { state, updateState } = callbacks;
  const metric = priceElement.closest('.metric');

  // Manual price entry — only when the page exposed no usable price (priceWasDefaulted or a
  // non-numeric display like "No price"). Committing a positive number sets it as the listing
  // price and re-flows everything, clearing the all-N/A state a missing price causes. When a
  // real price exists, the click keeps cycling the discount (below).
  function commitPrice(raw) {
    const match = String(raw).match(/[\d,.]+/);
    const value = match ? parseFloat(match[0].replace(/,/g, "")) : NaN;
    if (Number.isFinite(value) && value > 0) {
      const formatted = `$${Math.round(value).toLocaleString()}`;
      updateState({ baseNOI: null, currentPriceDiscount: 0, originalPrice: formatted, priceWasDefaulted: false });
      priceElement.textContent = formatted;
    }
    callbacks.updatePriceLabel();
    callbacks.recalculateFinancials();
    updateDiscountButtonText(state);
  }

  function openPriceInput() {
    if (priceElement.querySelector("input")) return;
    const input = document.createElement("input");
    input.type = "text";
    input.value = "";
    input.placeholder = "price $";
    input.className = "price-input";
    input.style.width = "110px";
    priceElement.textContent = "";
    priceElement.appendChild(input);
    input.focus();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const value = input.value;
      input.remove();
      if (save) commitPrice(value);
      else callbacks.recalculateFinancials();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  priceElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (priceElement.querySelector("input")) return;

    const priceMissing = state.priceWasDefaulted || !/\d/.test(priceElement.textContent || "");
    if (priceMissing) {
      openPriceInput();
      return;
    }

    let newDiscount = Math.floor(state.currentPriceDiscount / 10) * 10 + 10;
    if (newDiscount > 50) {
      newDiscount = 0;
    }

    updateState({ currentPriceDiscount: newDiscount });

    const newPrice = callbacks.getCurrentPrice();
    priceElement.textContent = newPrice;
    callbacks.updatePriceLabel();
    callbacks.recalculateFinancials();
    updateDiscountButtonText(state);

    if (metric) {
      const tooltipContent = generatePriceTooltipHTML(state.currentPriceDiscount);
      updateTooltipContent(metric, tooltipContent);
    }
  });

  priceLabelElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    updateState({ currentPriceDiscount: 0 });

    const resetPrice = state.originalPrice;
    priceElement.textContent = resetPrice;
    callbacks.updatePriceLabel();
    callbacks.recalculateFinancials();
    updateDiscountButtonText(state);

    if (metric) {
      const tooltipContent = generatePriceTooltipHTML(state.currentPriceDiscount);
      updateTooltipContent(metric, tooltipContent);
    }
  });

  if (metric) {
    const tooltipContent = generatePriceTooltipHTML(state.currentPriceDiscount);
    attachTooltip(metric, tooltipContent);
    priceLabelElement.classList.add('has-tooltip');
  }

  priceElement.style.cursor = "pointer";
  priceLabelElement.style.cursor = "pointer";
}

// Manual cap-rate entry on the cap cell — available for EVERY listing (reported, estimated, or
// none). Clicking the cap value swaps in an inline input; committing a positive number routes
// through the engine's capManuallySet override (NOI = original price x cap for every type), so
// any change re-flows all calculations. baseNOI is cleared so the override recomputes, and
// isUsingEstimatedCapRate is set so the calc reads the typed value from state rather than the
// DOM. Clicking the label resets to the page's reported cap when there was one, else to the
// 5% estimate.
export function setupCapRateClickHandler(capElement, capLabelElement, callbacks) {
  if (!capElement || !capLabelElement) return;

  // Prevent duplicate attachment
  if (capElement.dataset.handlerAttached === 'true') return;
  capElement.dataset.handlerAttached = 'true';

  const { state, updateState } = callbacks;
  const metric = capElement.closest('.metric');

  function commit(raw) {
    const match = String(raw).match(/[\d.]+/);
    const value = match ? parseFloat(match[0]) : NaN;
    if (Number.isFinite(value) && value > 0) {
      updateState({
        baseNOI: null,
        capManuallySet: true,
        currentEstimatedCapRate: value,
        isUsingEstimatedCapRate: true,
      });
    }
    callbacks.recalculateFinancials();
    if (metric) {
      const tooltipContent = generateCapRateTooltipHTML(state.isUsingEstimatedCapRate);
      if (tooltipContent) updateTooltipContent(metric, tooltipContent);
    }
  }

  capElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (capElement.querySelector("input")) return;

    const match = (capElement.textContent || "").match(/[\d.]+/);
    const input = document.createElement("input");
    input.type = "text";
    input.value = match ? match[0] : "";
    input.placeholder = "cap %";
    input.className = "cap-input";
    input.style.width = "56px";
    capElement.textContent = "";
    capElement.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const value = input.value;
      // Remove the input before recalc so updateActiveCapDisplay can repaint the cap cell
      // (prop-cap is painted only there, never by applyFinancials).
      input.remove();
      if (save) commit(value);
      else callbacks.recalculateFinancials();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  });

  capLabelElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    const reportedMatch = state.originalCapRate && !state.originalCapRate.includes("*")
      ? state.originalCapRate.match(/[\d.]+/)
      : null;

    if (reportedMatch) {
      // Restore the page's reported cap: write it to the cell so the non-estimated calc path
      // (which reads the cap cell) recomputes against it, not the prior override.
      capElement.textContent = `${parseFloat(reportedMatch[0])}%`;
      updateState({ baseNOI: null, capManuallySet: false, isUsingEstimatedCapRate: false });
    } else {
      const originalCapRate = state.originalEstimatedCapRate || FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE * 100;
      updateState({
        baseNOI: null,
        capManuallySet: false,
        currentEstimatedCapRate: originalCapRate,
        isUsingEstimatedCapRate: true,
      });
    }
    callbacks.recalculateFinancials();

    if (metric) {
      const tooltipContent = generateCapRateTooltipHTML(state.isUsingEstimatedCapRate);
      if (tooltipContent) {
        updateTooltipContent(metric, tooltipContent);
      }
    }
  });

  if (metric) {
    const tooltipContent = generateCapRateTooltipHTML(state.isUsingEstimatedCapRate);
    if (tooltipContent) {
      attachTooltip(metric, tooltipContent);
      capLabelElement.classList.add('has-tooltip');
    }
  }

  capElement.style.cursor = "pointer";
  capLabelElement.style.cursor = "pointer";
}

// Manual STR-gross entry on the NOI cell (STR mode only). Clicking the NOI value swaps in an
// inline input; committing a positive number stores it as the measured STR gross
// (cachedStrValue {value, type:"gross"}) — the SAME seam the dormant str-revenue backend would
// fill — so calculateFinancials applies NOI = gross x NOI_PERCENTAGE. baseNOI is cleared so the
// type model recomputes, and capManuallySet is cleared so a prior cap-click override does not
// clobber the gross. Clicking the NOI label resets to the 5.5%-of-price estimate.
export function setupNoiClickHandler(noiElement, noiLabelElement, callbacks) {
  if (!noiElement || !noiLabelElement) return;

  if (noiElement.dataset.handlerAttached === "true") return;
  noiElement.dataset.handlerAttached = "true";

  const { state, updateState } = callbacks;

  function commit(raw) {
    const match = String(raw).match(/[\d,.]+/);
    const value = match ? parseFloat(match[0].replace(/,/g, "")) : NaN;
    if (Number.isFinite(value) && value > 0) {
      updateState({ cachedStrValue: { value, type: "gross" }, baseNOI: null, capManuallySet: false });
    }
    callbacks.recalculateFinancials();
  }

  noiElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (state.currentPropertyType !== "str") return;
    if (noiElement.querySelector("input")) return;

    const current = state.cachedStrValue && Number.isFinite(state.cachedStrValue.value)
      ? String(state.cachedStrValue.value)
      : "";
    const input = document.createElement("input");
    input.type = "text";
    input.value = current;
    input.placeholder = "Awning gross $/yr";
    input.className = "noi-input";
    input.style.width = "92px";
    noiElement.textContent = "";
    noiElement.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) commit(input.value);
      else callbacks.recalculateFinancials();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  });

  noiLabelElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (state.currentPropertyType !== "str") return;
    updateState({ cachedStrValue: null, baseNOI: null });
    callbacks.recalculateFinancials();
  });

  noiElement.style.cursor = "pointer";
  noiLabelElement.style.cursor = "pointer";
}

// The "↗ Awning" affordance next to NOI: copy the current address to the clipboard and open
// Awning's public calculator in a new tab, so the analyst pastes the address, reads the gross
// revenue, and types it back into the NOI cell (setupNoiClickHandler). Read the address from
// the live #prop-name so SPA navigation can't bind a stale value.
export function setupAwningLinkHandler(linkElement) {
  if (!linkElement) return;

  if (linkElement.dataset.handlerAttached === "true") return;
  linkElement.dataset.handlerAttached = "true";

  linkElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    const address = document.getElementById("prop-name")?.textContent?.trim() || "";
    if (address && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address).catch(() => {});
    }
    window.open("https://awning.com/airbnb-calculator", "_blank", "noopener");
  });
}

export function setupDownPaymentClickHandler(downElement, downLabelElement, callbacks) {
  if (!downElement || !downLabelElement) return;

  // Prevent duplicate attachment
  if (downElement.dataset.handlerAttached === 'true') return;
  downElement.dataset.handlerAttached = 'true';

  const { state, updateState } = callbacks;
  const metric = downElement.closest('.metric');

  downElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    let newDownPercent = state.currentDownPaymentPercent - 10;
    let newDSCRPercent = state.currentDSCRPercent - 10;
    let newSellerFiPercent = state.currentSellerFiPercent + 10;

    if (newDownPercent < 0) {
      newDownPercent = 60;
      newDSCRPercent = 70;
      newSellerFiPercent = 40;
    }

    updateState({
      currentDownPaymentPercent: newDownPercent,
      currentDSCRPercent: newDSCRPercent,
      currentSellerFiPercent: newSellerFiPercent
    });

    callbacks.updatePercentageLabels();
    callbacks.recalculateFinancials();

    setTimeout(() => {
      const priceElement = document.getElementById("prop-price");
      const noiElement = document.getElementById("prop-noi");

      if (priceElement && noiElement && metric) {
        const priceMatch = priceElement.textContent.match(/[\d,]+/);
        const noiMatch = noiElement.textContent.match(/[\d,.]+/);

        if (priceMatch && noiMatch) {
          const price = parseFloat(priceMatch[0].replace(/,/g, ""));
          let noi = parseFloat(noiMatch[0].replace(/,/g, ""));

          if (noiElement.textContent.includes("K")) noi *= 1000;
          if (noiElement.textContent.includes("M")) noi *= 1000000;

          removeTooltip(metric);
          setTimeout(() => {
            const tooltipContent = generateDownPaymentTooltipHTML(
              price,
              noi,
              state.currentDownPaymentPercent,
              state.currentDSCRPercent,
              state.currentSellerFiPercent,
              state.currentInterestRateType
            );
            updateTooltipContent(metric, tooltipContent);
          }, 50);
        }
      }
    }, 100);
  });

  downLabelElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    updateState({
      currentDownPaymentPercent: FINANCIAL_CONSTANTS.SELLER_FI_DOWN_PAYMENT * 100,
      currentDSCRPercent: FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE * 100,
      currentSellerFiPercent: FINANCIAL_CONSTANTS.SELLER_FI_CARRY * 100
    });

    callbacks.updatePercentageLabels();
    callbacks.recalculateFinancials();

    setTimeout(() => {
      const priceElement = document.getElementById("prop-price");
      const noiElement = document.getElementById("prop-noi");

      if (priceElement && noiElement && metric) {
        const priceMatch = priceElement.textContent.match(/[\d,]+/);
        const noiMatch = noiElement.textContent.match(/[\d,.]+/);

        if (priceMatch && noiMatch) {
          const price = parseFloat(priceMatch[0].replace(/,/g, ""));
          let noi = parseFloat(noiMatch[0].replace(/,/g, ""));

          if (noiElement.textContent.includes("K")) noi *= 1000;
          if (noiElement.textContent.includes("M")) noi *= 1000000;

          removeTooltip(metric);
          setTimeout(() => {
            const tooltipContent = generateDownPaymentTooltipHTML(
              price,
              noi,
              state.currentDownPaymentPercent,
              state.currentDSCRPercent,
              state.currentSellerFiPercent,
              state.currentInterestRateType
            );
            updateTooltipContent(metric, tooltipContent);
          }, 50);
        }
      }
    }, 100);
  });

  if (metric && downLabelElement) {
    downLabelElement.classList.add('has-tooltip');
  }

  downElement.style.cursor = "pointer";
  downLabelElement.style.cursor = "pointer";
}

// Clicking the red-reasons pill resets the stack to the 60% down tier (DSCR 70 / seller carry 40)
// — the highest down payment, the fastest way to cure an "Equity" red (down payment must cover the
// seller's existing debt). Matches the 60/70/40 wrap in the down-payment handler above.
export function setupEquityResetHandler(pillElement, callbacks) {
  if (!pillElement) return;
  if (pillElement.dataset.handlerAttached === "true") return;
  pillElement.dataset.handlerAttached = "true";

  const { updateState } = callbacks;

  pillElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    updateState({
      currentDSCRPercent: 70,
      currentDownPaymentPercent: 60,
      currentSellerFiPercent: 40,
    });

    callbacks.updatePercentageLabels();
    callbacks.recalculateFinancials();
  });

  pillElement.style.cursor = "pointer";
}

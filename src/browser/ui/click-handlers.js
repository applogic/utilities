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

  priceElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

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

export function setupCapRateClickHandler(capElement, capLabelElement, callbacks) {
  if (!capElement || !capLabelElement) return;

  const { state, updateState } = callbacks;
  if (!state.isUsingEstimatedCapRate) return;

  // Prevent duplicate attachment
  if (capElement.dataset.handlerAttached === 'true') return;
  capElement.dataset.handlerAttached = 'true';

  const metric = capElement.closest('.metric');

  capElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    let newCapRate = state.currentEstimatedCapRate + 1;
    if (newCapRate > 20) {
      newCapRate = 5;
    }

    updateState({ currentEstimatedCapRate: newCapRate, capManuallySet: true });

    capElement.textContent = `${newCapRate}%*`;
    callbacks.recalculateFinancials();

    if (metric) {
      const tooltipContent = generateCapRateTooltipHTML(state.isUsingEstimatedCapRate);
      if (tooltipContent) {
        updateTooltipContent(metric, tooltipContent);
      }
    }
  });

  capLabelElement.addEventListener("click", function(e) {
    e.preventDefault();
    e.stopPropagation();

    const originalCapRate = state.originalEstimatedCapRate || FINANCIAL_CONSTANTS.DEFAULT_CAP_RATE;
    updateState({ currentEstimatedCapRate: originalCapRate, capManuallySet: false, baseNOI: null });

    capElement.textContent = `${originalCapRate}%*`;
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

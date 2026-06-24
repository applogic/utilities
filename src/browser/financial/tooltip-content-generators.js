import { calculateDownPaymentTooltip, calculateCashFlowTooltip } from './tooltip-calculations.js';

export function generatePriceTooltipHTML(priceDiscount) {
  return `
    <strong>Click the price to decrease by 10%</strong><br>
    Current discount: ${priceDiscount}%
    <hr>
    <em>Click the label to reset</em>
  `;
}

export function generateCashFlowTooltipHTML(price, monthlyCashFlow) {
  const annualCashFlow = monthlyCashFlow * 12;
  const cashFlowYield = ((annualCashFlow / price) * 100).toFixed(1);

  return `
    <strong>Cash Flow Yield:</strong> ${cashFlowYield}%<br>
    <strong>Annual Cash Flow:</strong> $${annualCashFlow.toLocaleString()}
  `;
}

export function generateCapRateTooltipHTML(isUsingEstimatedCapRate) {
  if (!isUsingEstimatedCapRate) return null;

  return `
    <strong>Click the cap rate to enter a value</strong>
    <hr>
    <em>Click the label to reset</em>
  `;
}

export function generateDownPaymentTooltipHTML(price, noi, downPercent, dscrPercent, sellerFiPercent, interestRateType = "dscr_residential") {
  // Use existing calculation function
  const cocrText = calculateDownPaymentTooltip(price, noi, downPercent, dscrPercent, sellerFiPercent, interestRateType);

  return `
    <strong>Click the down payment to decrease by 10%</strong><br>
    ${cocrText}
    <hr>
    <em>Click the label to reset</em>
  `;
}

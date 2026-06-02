import { calculatePMT, calculateCashFlowYield } from '../../financial/calculations.js';
import { formatPercentage, formatCurrency } from '../../financial/formatters.js';
import { FINANCIAL_CONSTANTS } from '../../config/financial.js';

export function calculateDownPaymentTooltip(price, noi, downPercent, dscrPercent, sellerFiPercent, interestRateType = "dscr_residential") {
  try {
    const tier = FINANCIAL_CONSTANTS.INTEREST_RATE_TIERS[interestRateType || "dscr_residential"];
    const downDecimal = downPercent / 100;
    const cashInvested = price * downDecimal;

    const remainingPercent = 100 - downPercent;
    const dscrLoanPercent = Math.min(remainingPercent, 70);
    const actualSellerFiPercent = Math.max(0, remainingPercent - 70);

    const dscrLoanAmount = price * (dscrLoanPercent / 100);
    const sellerFiAmount = price * (actualSellerFiPercent / 100);

    const dscrPayment = calculatePMT(dscrLoanAmount, tier.rate, tier.amortization) * 12;
    const sellerFiPayment = sellerFiAmount > 0 ?
      calculatePMT(sellerFiAmount, FINANCIAL_CONSTANTS.SELLER_FI_INTEREST_RATE, FINANCIAL_CONSTANTS.SELLER_FI_AMORTIZATION) * 12 : 0;

    const annualCashFlow = noi - dscrPayment - sellerFiPayment;
    const cocr = (annualCashFlow / cashInvested) * 100;

    let financingType = actualSellerFiPercent > 0 ?
      `${dscrLoanPercent}% DSCR + ${actualSellerFiPercent}% Seller FI` :
      `${dscrLoanPercent}% DSCR only`;

    return `COCR at ${downPercent}% down (${financingType}): ${formatPercentage(cocr)}`;
  } catch (error) {
    return `Down payment at ${downPercent}%`;
  }
}

export function calculateCashFlowTooltip(price, monthlyCashFlow) {
  try {
    const annualCashFlow = formatCurrency(monthlyCashFlow * 12);
    const cashFlowYield = calculateCashFlowYield(monthlyCashFlow, price);
    return `Cash Flow Yield: ${cashFlowYield.toFixed(1)}% (${annualCashFlow}/yr)`;
  } catch (error) {
    return `Monthly cash flow: ${formatCurrency(monthlyCashFlow, true)} (${formatCurrency(monthlyCashFlow * 12)}/yr)`;
  }
}

export function parseFinancialData(priceText, noiText) {
  const priceMatch = priceText.match(/[\d,]+/);
  const noiMatch = noiText.match(/[\d,.]+/);

  if (priceMatch && noiMatch) {
    const price = parseFloat(priceMatch[0].replace(/,/g, ""));
    let noi = parseFloat(noiMatch[0].replace(/,/g, ""));

    if (noiText.includes("K")) {
      noi *= 1000;
    } else if (noiText.includes("M")) {
      noi *= 1000000;
    }

    return { price, noi };
  }

  return null;
}

export function parseCashFlowData(priceText, cashFlowText) {
  const priceMatch = priceText.match(/[\d,]+/);
  const cashFlowMatch = cashFlowText.match(/-?[\d,]+/);

  if (priceMatch && cashFlowMatch) {
    const price = parseFloat(priceMatch[0].replace(/,/g, ""));
    let monthlyCashFlow = parseFloat(cashFlowMatch[0].replace(/,/g, ""));

    if (cashFlowText.includes("-")) {
      monthlyCashFlow = -Math.abs(monthlyCashFlow);
    }

    return { price, monthlyCashFlow };
  }

  return null;
}

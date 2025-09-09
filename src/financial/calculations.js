// src/financial/calculations.js

/**
 * PMT function for loan payment calculation
 * @param {number} principal - Loan principal amount  
 * @param {number} annualRate - Annual interest rate (as decimal, e.g., 0.075 for 7.5%)
 * @param {number} years - Loan term in years
 * @returns {number} Monthly payment amount
 */
export function calculatePMT(principal, annualRate, years) {
  if (annualRate === 0) {
    return principal / (years * 12);
  }
  
  const monthlyRate = annualRate / 12;
  const numPayments = years * 12;
  const pmt = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
              (Math.pow(1 + monthlyRate, numPayments) - 1);
  return pmt;
}

export function calculateCOCR30(askingPrice, noi) {
  try {
    const cashInvested = askingPrice * 0.30; // 30% down payment
    const dscrLoanAmount = askingPrice * 0.70; // Fixed 70% DSCR loan
    const dscrPayment = calculatePMT(dscrLoanAmount, 0.075, 30) * 12; // Annual DSCR payment
    const annualCashFlow = noi - dscrPayment;
    const cocr = (annualCashFlow / cashInvested) * 100;
    
    return cocr;
  } catch (error) {
    return 0;
  }
}

export function calculateCashFlowYield(monthlyCashFlow, purchasePrice) {
  if (!purchasePrice || purchasePrice <= 0) return 0;
  const annualCashFlow = monthlyCashFlow * 12;
  return (annualCashFlow / purchasePrice) * 100;
}


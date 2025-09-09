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
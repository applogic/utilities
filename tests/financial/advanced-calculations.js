/**
 * Tests for advanced financial calculations
 */

import { describe, test, expect } from "vitest";
import { 
  calculateAppreciatedValue,
  calculateBalloonBalance,
  calculateCashFlowYield,
  calculateCashOutAfterRefi,
  calculateDiscountFromPrice,
  calculatePriceFromDiscount,
  safePercentage,
  calculateCOCR30,
  calculateCashFlow
} from "../../src/financial/calculations.js";

import { FINANCIAL_CONSTANTS } from "../../src/config/financial.js";


describe("Advanced Financial Calculations", () => {
  describe("calculateBalloonBalance", () => {
    test("should calculate balloon balance correctly", () => {
      // $500K loan, 7.5% rate, 30yr amortization, 7yr balloon
      const result = calculateBalloonBalance(500000, 0.075, 30, 7);
      
      // After 7 years of 30-year amortization payments, significant balance remains
      expect(result).toBeGreaterThan(400000);
      expect(result).toBeLessThan(500000);
    });

    test("should return 0 for balloon period >= amortization", () => {
      const result = calculateBalloonBalance(500000, 0.075, 30, 30);
      expect(result).toBe(0);
    });

    test("should use config default for balloon period", () => {
      const result1 = calculateBalloonBalance(500000, 0.075, 30);
      const result2 = calculateBalloonBalance(500000, 0.075, 30, FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS);
      
      expect(result1).toBe(result2);
    });

    test("should handle edge cases", () => {
      expect(calculateBalloonBalance(0, 0.075, 30, 7)).toBe(0);
      expect(calculateBalloonBalance(500000, -0.01, 30, 7)).toBe(0);
      expect(calculateBalloonBalance(500000, 0.075, 0, 7)).toBe(0);
      expect(calculateBalloonBalance(500000, 0.075, 30, 0)).toBe(0);
    });

    test("should handle zero interest rate", () => {
      // With 0% interest, balance decreases linearly
      const result = calculateBalloonBalance(500000, 0, 30, 15);
      const expectedBalance = 500000 * (30 - 15) / 30; // 15/30 = 50% paid down
      
      expect(result).toBeCloseTo(expectedBalance, 0);
    });

    test("should be mathematically consistent", () => {
      // Shorter balloon should have higher remaining balance
      const balance5yr = calculateBalloonBalance(500000, 0.075, 30, 5);
      const balance10yr = calculateBalloonBalance(500000, 0.075, 30, 10);
      
      expect(balance5yr).toBeGreaterThan(balance10yr);
    });
  });

  describe("calculateAppreciatedValue", () => {
    test("should calculate appreciation correctly", () => {
      const currentValue = 500000;
      const result = calculateAppreciatedValue(currentValue, 0.045, 7);
      
      // 4.5% for 7 years ≈ 36% total appreciation
      const expected = currentValue * Math.pow(1.045, 7);
      expect(result).toBeCloseTo(expected, 2);
    });

    test("should use config defaults", () => {
      const currentValue = 500000;
      const result1 = calculateAppreciatedValue(currentValue);
      const result2 = calculateAppreciatedValue(
        currentValue, 
        FINANCIAL_CONSTANTS.APPRECIATION_RATE, 
        FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS
      );
      
      expect(result1).toBe(result2);
    });

    test("should handle zero appreciation", () => {
      const currentValue = 500000;
      const result = calculateAppreciatedValue(currentValue, 0, 7);
      
      expect(result).toBe(currentValue);
    });

    test("should handle edge cases", () => {
      expect(calculateAppreciatedValue(0, 0.045, 7)).toBe(0);
      expect(calculateAppreciatedValue(500000, -0.01, 7)).toBe(500000);
      expect(calculateAppreciatedValue(500000, 0.045, 0)).toBe(500000);
    });

    test("should compound correctly over time", () => {
      const value = 500000;
      const rate = 0.05; // 5%
      
      const result1yr = calculateAppreciatedValue(value, rate, 1);
      const result2yr = calculateAppreciatedValue(value, rate, 2);
      
      expect(result1yr).toBeCloseTo(525000, 0); // 500k * 1.05
      expect(result2yr).toBeCloseTo(551250, 0); // 500k * 1.05^2
    });
  });

  describe("calculateCashOutAfterRefi", () => {
    test("should calculate positive cash out correctly", () => {
      const originalPrice = 500000;
      const dscrLoan = 350000; // 70%
      const sellerFi = 100000; // 20%, 10% down
      
      const result = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi);
      
      // After 7 years with 4.5% appreciation, should have positive cash out
      expect(result).toBeGreaterThan(0);
    });

    test("should handle case with only DSCR loan", () => {
      const originalPrice = 500000;
      const dscrLoan = 350000;
      const sellerFi = 0;
      
      const result = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi);
      
      expect(result).toBeGreaterThan(0);
    });

    test("should handle case with only seller financing", () => {
      const originalPrice = 500000;
      const dscrLoan = 0;
      const sellerFi = 300000;
      
      const result = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi);
      
      // With 0% seller financing, less principal paid down
      expect(typeof result).toBe('number');
    });

    test("should be higher with more appreciation", () => {
      const originalPrice = 500000;
      const dscrLoan = 350000;
      const sellerFi = 100000;
      
      const lowAppreciation = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi, {
        appreciationRate: 0.02 // 2%
      });
      
      const highAppreciation = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi, {
        appreciationRate: 0.08 // 8%
      });
      
      expect(highAppreciation).toBeGreaterThan(lowAppreciation);
    });

    test("should be higher with longer balloon period", () => {
      const originalPrice = 500000;
      const dscrLoan = 350000;
      const sellerFi = 100000;
      
      const shorter = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi, {
        balloonYears: 5
      });
      
      const longer = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi, {
        balloonYears: 10
      });
      
      expect(longer).toBeGreaterThan(shorter);
    });

    test("should handle edge cases", () => {
      expect(calculateCashOutAfterRefi(0, 0, 0)).toBe(0);
      
      const result = calculateCashOutAfterRefi(500000, 350000, 100000);
      expect(typeof result).toBe('number');
      expect(isFinite(result)).toBe(true);
    });
  });

  describe("Integration tests", () => {
    test("should work together for complete scenario", () => {
      const purchasePrice = 500000;
      const dscrLoanAmount = 350000;
      const sellerFiAmount = 100000;
      const balloonYears = 7;
      
      // Test individual components
      const appreciatedValue = calculateAppreciatedValue(purchasePrice, 0.045, balloonYears);
      expect(appreciatedValue).toBeGreaterThan(purchasePrice);
      
      const dscrBalance = calculateBalloonBalance(dscrLoanAmount, 0.075, 30, balloonYears);
      expect(dscrBalance).toBeGreaterThan(0);
      expect(dscrBalance).toBeLessThan(dscrLoanAmount);
      
      const sellerFiBalance = calculateBalloonBalance(sellerFiAmount, 0, 30, balloonYears);
      expect(sellerFiBalance).toBeGreaterThan(0);
      expect(sellerFiBalance).toBeLessThan(sellerFiAmount);
      
      // Test combined calculation
      const cashOut = calculateCashOutAfterRefi(purchasePrice, dscrLoanAmount, sellerFiAmount);
      expect(typeof cashOut).toBe('number');
      expect(isFinite(cashOut)).toBe(true);
    });
  });
});

describe("Advanced Financial Calculations", () => {
  describe("calculateBalloonBalance", () => {
    test("should calculate remaining balance after balloon period", () => {
      const loanAmount = 500000;
      const rate = 0.075;
      const amortization = 30;
      const balloonYears = 7;
      
      const result = calculateBalloonBalance(loanAmount, rate, amortization, balloonYears);
      
      // After 7 years of 30-year amortization at 7.5%
      expect(result).toBeCloseTo(444635, 0);
    });

    test("should handle zero interest rate", () => {
      const result = calculateBalloonBalance(100000, 0, 30, 5);
      
      // With 0% interest, balance reduces linearly
      const monthlyPrincipal = 100000 / (30 * 12);
      const paidOff = monthlyPrincipal * (5 * 12);
      
      expect(result).toBeCloseTo(100000 - paidOff, 0);
    });

    test("should handle balloon period equal to amortization", () => {
      const result = calculateBalloonBalance(100000, 0.06, 10, 10);
      expect(result).toBeCloseTo(0, 0); // Fully paid off
    });

    test("should handle balloon period longer than amortization", () => {
      const result = calculateBalloonBalance(100000, 0.06, 10, 15);
      expect(result).toBe(0); // Already paid off
    });

    test("should handle invalid inputs", () => {
      expect(calculateBalloonBalance(-100000, 0.06, 30, 7)).toBe(0);
      expect(calculateBalloonBalance(100000, -0.06, 30, 7)).toBe(0);
      expect(calculateBalloonBalance(100000, 0.06, 0, 7)).toBe(0);
    });
  });

  describe("calculateAppreciatedValue", () => {
    test("should calculate appreciation with default rate", () => {
      const currentValue = 500000;
      const result = calculateAppreciatedValue(currentValue);
      
      // Default 4.5% for 7 years
      const expected = 500000 * Math.pow(1.045, 7);
      expect(result).toBeCloseTo(expected, 0);
    });

    test("should handle custom appreciation rates and periods", () => {
      const currentValue = 500000;
      const result1yr = calculateAppreciatedValue(currentValue, 0.05, 1);
      const result2yr = calculateAppreciatedValue(currentValue, 0.05, 2);
      
      expect(result1yr).toBeCloseTo(525000, 0); // 500k * 1.05
      expect(result2yr).toBeCloseTo(551250, 0); // 500k * 1.05^2
    });

    test("should handle zero appreciation", () => {
      const result = calculateAppreciatedValue(500000, 0, 5);
      expect(result).toBe(500000);
    });

    test("should handle negative appreciation (depreciation)", () => {
      const result = calculateAppreciatedValue(500000, -0.02, 5);
      expect(result).toBeLessThan(500000);
    });

    test("should handle invalid inputs", () => {
      expect(calculateAppreciatedValue(0, 0.05, 5)).toBe(0);
      expect(calculateAppreciatedValue(-500000, 0.05, 5)).toBe(-500000);
      expect(calculateAppreciatedValue(500000, 0.05, -5)).toBe(500000);
    });
  });

  describe("calculateCashOutAfterRefi", () => {
    test("should calculate positive cash out correctly", () => {
      const originalPrice = 500000;
      const dscrLoan = 350000; // 70%
      const sellerFi = 100000; // 20%, 10% down
      
      const result = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi);
      
      // After 7 years with 4.5% appreciation, should have positive cash out
      expect(result).toBeGreaterThan(0);
    });

    test("should handle case with only DSCR loan", () => {
      const originalPrice = 500000;
      const dscrLoan = 350000;
      const sellerFi = 0;
      
      const result = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi);
      
      expect(result).toBeGreaterThan(0);
    });

    test("should handle negative cash out (cash in required)", () => {
      const originalPrice = 500000;
      const dscrLoan = 450000; // High leverage
      const sellerFi = 50000;
      
      const result = calculateCashOutAfterRefi(originalPrice, dscrLoan, sellerFi, {
        appreciationRate: 0.01 // Low appreciation
      });
      
      expect(typeof result).toBe("number");
    });
  });

  describe("calculateCashFlowYield", () => {
    test("should calculate annual yield from monthly cash flow", () => {
      const monthlyCashFlow = 1000;
      const downPayment = 100000;
      
      const result = calculateCashFlowYield(monthlyCashFlow, downPayment);
      
      // (1000 * 12) / 100000 = 0.12
      expect(result).toBe(0.12);
    });

    test("should handle zero down payment", () => {
      const result = calculateCashFlowYield(1000, 0);
      expect(result).toBe(0);
    });

    test("should handle negative cash flow", () => {
      const result = calculateCashFlowYield(-500, 100000);
      expect(result).toBe(-0.06);
    });

    test("should handle invalid inputs", () => {
      expect(calculateCashFlowYield(NaN, 100000)).toBe(0);
      expect(calculateCashFlowYield(1000, null)).toBe(0);
    });
  });

  describe("calculateCOCR30", () => {
    test("should calculate 30% down COCR correctly", () => {
      const askingPrice = 500000;
      const noi = 40000;
      
      const result = calculateCOCR30(askingPrice, noi);
      
      // Should calculate COCR with 30% down
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    test("should handle edge cases", () => {
      expect(calculateCOCR30(0, 40000)).toBe(0);
      expect(calculateCOCR30(500000, 0)).toBeCloseTo(0, 2);
      expect(calculateCOCR30(500000, -40000)).toBeLessThan(0);
    });
  });

  describe("Price Discount Calculations", () => {
    test("should calculate discount from price correctly", () => {
      const askingPrice = 1000000;
      
      expect(calculateDiscountFromPrice(askingPrice, 900000)).toBeCloseTo(0.10, 2);
      expect(calculateDiscountFromPrice(askingPrice, 800000)).toBeCloseTo(0.20, 2);
      expect(calculateDiscountFromPrice(askingPrice, 1000000)).toBe(0);
      expect(calculateDiscountFromPrice(askingPrice, 1100000)).toBeCloseTo(-0.10, 2);
    });

    test("should calculate price from discount correctly", () => {
      const askingPrice = 1000000;
      
      expect(calculatePriceFromDiscount(askingPrice, 0.10)).toBe(900000);
      expect(calculatePriceFromDiscount(askingPrice, 0.20)).toBe(800000);
      expect(calculatePriceFromDiscount(askingPrice, 0)).toBe(1000000);
      expect(calculatePriceFromDiscount(askingPrice, -0.10)).toBe(1100000);
    });

    test("should handle invalid asking prices", () => {
      expect(calculateDiscountFromPrice(0, 900000)).toBe(0);
      expect(calculateDiscountFromPrice(null, 900000)).toBe(0);
      expect(calculatePriceFromDiscount(0, 0.10)).toBe(0);
      expect(calculatePriceFromDiscount(-1000000, 0.10)).toBe(0);
    });
  });

  describe("safePercentage", () => {
    test("should convert decimals to percentages", () => {
      expect(safePercentage(0.075)).toBe(7.5);
      expect(safePercentage(0.25)).toBe(25);
      expect(safePercentage(1)).toBe(100);
    });

    test("should use fallback for invalid values", () => {
      expect(safePercentage(null)).toBe(100);
      expect(safePercentage(undefined)).toBe(100);
      expect(safePercentage(NaN)).toBe(100);
      expect(safePercentage(null, 50)).toBe(50);
    });

    test("should handle zero correctly", () => {
      expect(safePercentage(0)).toBe(0);
    });
  });

  describe("Payment Calculations", () => {

    test("calculateCashFlow should subtract payments from NOI", () => {
      const monthlyNOI = 5000;
      const dscrPayment = 2500;
      const sfPayment = 500;
      
      const result = calculateCashFlow(monthlyNOI, dscrPayment, sfPayment);
      
      expect(result).toBe(2000);
    });

    test("calculateCashFlow should handle negative cash flow", () => {
      const monthlyNOI = 3000;
      const dscrPayment = 2500;
      const sfPayment = 1000;
      
      const result = calculateCashFlow(monthlyNOI, dscrPayment, sfPayment);
      
      expect(result).toBe(-500);
    });
  });
});

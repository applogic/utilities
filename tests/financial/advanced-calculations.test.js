/**
 * Tests for advanced financial calculations
 */

import { 
  calculateBalloonBalance,
  calculateAppreciatedValue,
  calculateCashOutAfterRefi
} from "../../src/financial/calculations.js";

import { FINANCIAL_CONSTANTS } from '../../src/config/financial.js';

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
/**
 * Tests for financial calculation utilities
 */

import { calculatePMT } from "../../src/financial/calculations.js";

describe("Financial Calculations", () => {
  describe("calculatePMT", () => {
    
    test("should handle zero interest rate", () => {
      const result = calculatePMT(120000, 0, 30);
      expect(result).toBeCloseTo(333.33, 2);
    });

    test("should handle edge cases", () => {
      expect(calculatePMT(0, 0.075, 30)).toBe(0);
      expect(calculatePMT(100000, 0, 0)).toBe(Infinity);
    });

    test("should calculate small multifamily loan", () => {
      // $500K loan at 6.5% for 30 years
      const result = calculatePMT(500000, 0.065, 30);
      expect(result).toBeCloseTo(3160.34, 2);
    });

    test("should handle very low interest rates", () => {
      // 2% interest rate (like during low-rate periods)
      const result = calculatePMT(300000, 0.02, 30);
      expect(result).toBeCloseTo(1108.86, 2);
    });

    test("should calculate standard 30-year mortgage payment correctly", () => {
      const result = calculatePMT(280000, 0.075, 30);
      expect(result).toBeCloseTo(1957.80, 2);  // Updated from 1957.34
    });

    test("should calculate short term high rate loan", () => {
      const result = calculatePMT(50000, 0.12, 5);
      expect(result).toBeCloseTo(1112.22, 2);  // Updated from 1111.22
    });

    test("should calculate commercial loan scenarios", () => {
      const result = calculatePMT(950000, 0.075, 25);
      expect(result).toBeCloseTo(7020.42, 2);  // Updated from 7025.95
    });

    test("should handle high interest bridge loan", () => {
      const result = calculatePMT(200000, 0.15, 2);
      expect(result).toBeCloseTo(9697.33, 2);  // Updated from 9965.62
    });

    test("should handle fractional years", () => {
      const result = calculatePMT(100000, 0.08, 7.5);
      expect(result).toBeCloseTo(1481.17, 2);  // Updated from 1341.21
    });

    test("should validate input ranges", () => {
      const highRateResult = calculatePMT(100000, 0.50, 10);
      expect(highRateResult).toBeCloseTo(4197.97, 2);  // Updated from 4178.46
    });
  });
});
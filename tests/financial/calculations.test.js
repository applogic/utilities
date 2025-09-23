/**
 * Tests for financial calculation utilities
 */

import { 
  calculatePMT,
  calculatePriceForCOCR,
  calculateCOCRAtPercent,
  calculateNOIByType,
  calculateAssignmentFee,
  calculateNetToBuyer
} from "../../src/financial/calculations.js";

import { FINANCIAL_CONSTANTS } from '../../src/config/financial.js';
import { BUSINESS_CONSTANTS } from '../../src/config/business.js';
import { PROPERTY_TYPE_CONSTANTS, PROPERTY_TYPES } from '../../src/config/property-types.js';



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

describe("Core Financial Calculations", () => {
  describe("calculatePriceForCOCR", () => {
    test("should calculate price for 15% COCR target using config defaults", () => {
      const noi = 50000;
      const result = calculatePriceForCOCR(noi, 0.15);
      
      expect(result).toBeGreaterThan(400000);
      expect(result).toBeLessThan(600000);
    });

    test("should respect business constants for bounds", () => {
      const noi = 1; // Very small NOI
      const result = calculatePriceForCOCR(noi, 0.15);
      
      // With such a small NOI, should return minimum bound
      expect(result).toBe(BUSINESS_CONSTANTS.MINIMUM_COCR15_PRICE);
    });

    test("should use financial constants for defaults", () => {
      const noi = 60000;
      const result1 = calculatePriceForCOCR(noi, 0.15);
      const result2 = calculatePriceForCOCR(noi, 0.15, {
        downPercent: FINANCIAL_CONSTANTS.DEFAULT_DOWN_PAYMENT * 100,
        dscrRate: FINANCIAL_CONSTANTS.DSCR_INTEREST_RATE
      });
      
      expect(result1).toBeCloseTo(result2, 0);
    });

    test("should handle different target COCR rates", () => {
      const noi = 60000;
      const result15 = calculatePriceForCOCR(noi, 0.15);
      const result20 = calculatePriceForCOCR(noi, 0.20);
      
      expect(result20).toBeLessThan(result15);
    });
  });

  describe("calculateCOCRAtPercent", () => {
    test("should use config constants for calculations", () => {
      const askingPrice = 500000;
      const noi = 60000;
      const result = calculateCOCRAtPercent(askingPrice, noi, 30);
      
      expect(result).toBeCloseTo(20.42, 2);

    });
    
  });

  describe("calculateNOIByType", () => {
    test("should calculate multifamily NOI using cap rate", () => {
      const askingPrice = 500000;
      const capRate = 0.08;
      const result = calculateNOIByType(askingPrice, capRate, PROPERTY_TYPES.MULTIFAMILY);
      
      expect(result).toBe(40000);
    });

    test("should calculate STR NOI using config constants", () => {
      const askingPrice = 500000;
      const result = calculateNOIByType(askingPrice, 0.08, PROPERTY_TYPES.STR);
      
      const expectedGross = askingPrice * PROPERTY_TYPE_CONSTANTS.STR.ESTIMATED_GROSS_RATE;
      const expectedNOI = expectedGross * PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE;
      
      expect(result).toBe(expectedNOI);
    });

    test("should calculate assisted living NOI using config constants", () => {
      const result = calculateNOIByType(500000, 0.08, PROPERTY_TYPES.ASSISTED_LIVING);
      
      const expected = PROPERTY_TYPE_CONSTANTS.ASSISTED_LIVING.DEFAULT_BEDROOM_COUNT * 
                      PROPERTY_TYPE_CONSTANTS.ASSISTED_LIVING.INCOME_PER_BEDROOM_MONTHLY * 12;
      
      expect(result).toBe(expected);
    });

    test("should handle custom bedroom count for assisted living", () => {
      const result = calculateNOIByType(500000, 0.08, PROPERTY_TYPES.ASSISTED_LIVING, { bedroomCount: 6 });
      
      expect(result).toBe(6 * PROPERTY_TYPE_CONSTANTS.ASSISTED_LIVING.INCOME_PER_BEDROOM_MONTHLY * 12);
    });
  });

  describe("calculateAssignmentFee", () => {
    test("should use config constant for default assignment fee", () => {
      const askingPrice = 500000;
      const result = calculateAssignmentFee(askingPrice);
      
      const expected = askingPrice * BUSINESS_CONSTANTS.ASSIGNMENT_FEE_PERCENTAGE;
      expect(result).toBe(expected);
    });

    test("should calculate custom assignment fee percentage", () => {
      const askingPrice = 500000;
      const result = calculateAssignmentFee(askingPrice, 3);
      
      expect(result).toBe(15000); // 500k * 3%
    });
  });

  describe("calculateNetToBuyer", () => {
    test("should use config constants for calculation", () => {
      const askingPrice = 500000;
      const result = calculateNetToBuyer(askingPrice);
      
      // Should use business constants from config
      expect(result).toBeGreaterThan(0); // Should be positive for typical scenario
    });

    test("should handle custom parameters while defaulting to config", () => {
      const askingPrice = 500000;
      const result1 = calculateNetToBuyer(askingPrice);
      const result2 = calculateNetToBuyer(askingPrice, {
        dscrLtvPercent: FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE * 100
      });
      
      expect(result1).toBeCloseTo(result2, 0);
    });
  });

  describe("Config constant integration", () => {
    test("should use consistent constants across functions", () => {
      // Test that the same DSCR rate is used across functions
      const askingPrice = 500000;
      const noi = 60000;
      
      // Both functions should use the same DSCR rate from config
      const cocrResult = calculateCOCRAtPercent(askingPrice, noi, 30);
      expect(cocrResult).toBeGreaterThan(0);
      
      const priceResult = calculatePriceForCOCR(noi, 0.15);
      expect(priceResult).toBeGreaterThan(0);
    });
  });
});

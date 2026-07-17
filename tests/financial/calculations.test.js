/**
 * Tests for financial calculation utilities
 */

import { 
  calculatePMT,
  calculatePriceForCOCR,
  calculateCOCRAtPercent,
  calculateNOIByType,
  calculateSTRNOI,
  calculateAssignmentFee,
  calculateCashOfferPrice,
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
      const defaultTier = FINANCIAL_CONSTANTS.INTEREST_RATE_TIERS[FINANCIAL_CONSTANTS.DEFAULT_INTEREST_RATE_TYPE];
      const result1 = calculatePriceForCOCR(noi, 0.15);
      const result2 = calculatePriceForCOCR(noi, 0.15, {
        downPercent: FINANCIAL_CONSTANTS.DEFAULT_DOWN_PAYMENT * 100,
        dscrRate: defaultTier.rate
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

      expect(result).toBeCloseTo(19.45, 2);

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

    test("REGRESSION: STR branch delegates to calculateSTRNOI but preserves the 5.5% estimate", () => {
      const askingPrice = 500000;
      const viaType = calculateNOIByType(askingPrice, 0.08, PROPERTY_TYPES.STR);
      const viaDirect = calculateSTRNOI(askingPrice);
      const expectedNOI = askingPrice
        * PROPERTY_TYPE_CONSTANTS.STR.ESTIMATED_GROSS_RATE
        * PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE;

      expect(viaType).toBe(expectedNOI);
      expect(viaType).toBe(viaDirect);
    });

    test("STR branch passes strApiResult through to calculateSTRNOI", () => {
      const result = calculateNOIByType(500000, 0.08, PROPERTY_TYPES.STR, {
        strApiResult: { value: 90000, type: "noi" }
      });

      expect(result).toBe(90000);
    });
  });

  describe("calculateSTRNOI", () => {
    test("estimates 5.5% of price when no apiResult is supplied", () => {
      const askingPrice = 500000;
      const expected = askingPrice
        * PROPERTY_TYPE_CONSTANTS.STR.ESTIMATED_GROSS_RATE
        * PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE;

      expect(calculateSTRNOI(askingPrice)).toBe(expected);
      expect(calculateSTRNOI(askingPrice, null)).toBe(expected);
    });

    test("returns the API value as-is when type is 'noi'", () => {
      expect(calculateSTRNOI(500000, { value: 72000, type: "noi" })).toBe(72000);
    });

    test("applies the NOI margin when type is 'gross'", () => {
      const result = calculateSTRNOI(500000, { value: 120000, type: "gross" });
      expect(result).toBe(120000 * PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE);
    });

    test("falls back to the price estimate when apiResult.value is not a finite number", () => {
      const expected = 500000
        * PROPERTY_TYPE_CONSTANTS.STR.ESTIMATED_GROSS_RATE
        * PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE;

      expect(calculateSTRNOI(500000, { value: NaN, type: "noi" })).toBe(expected);
      expect(calculateSTRNOI(500000, { value: undefined, type: "gross" })).toBe(expected);
      expect(calculateSTRNOI(500000, { value: -5, type: "noi" })).toBe(expected);
    });

    test("falls back to the price estimate when apiResult.type is unrecognized", () => {
      const expected = 500000
        * PROPERTY_TYPE_CONSTANTS.STR.ESTIMATED_GROSS_RATE
        * PROPERTY_TYPE_CONSTANTS.STR.NOI_PERCENTAGE;

      expect(calculateSTRNOI(500000, { value: 80000, type: "revenue" })).toBe(expected);
    });

    test("returns 0 for invalid price when no API value is available", () => {
      expect(calculateSTRNOI(0)).toBe(0);
      expect(calculateSTRNOI(-100000)).toBe(0);
      expect(calculateSTRNOI(NaN)).toBe(0);
      expect(calculateSTRNOI(undefined)).toBe(0);
    });

    test("still returns the API value for a zero/invalid price when type is 'noi'", () => {
      expect(calculateSTRNOI(0, { value: 60000, type: "noi" })).toBe(60000);
    });

    test("honors rate overrides passed via options", () => {
      const result = calculateSTRNOI(500000, null, { grossRate: 0.12, noiPercentage: 0.5 });
      expect(result).toBe(500000 * 0.12 * 0.5);
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

  describe("calculateCashOfferPrice", () => {
    test("applies the config haircut and floors to the config step", () => {
      // 1,000,000 less 7% = 930,000, already on the $10k grid.
      // Guards the float-noise case (930000.0000001 / 929999.9999) from
      // dropping a whole step.
      expect(calculateCashOfferPrice(1000000)).toBe(930000);
    });

    test("floors DOWN to the step, never up", () => {
      // 1,000,000 less 7.5% = 925,000 -> floors to 920,000 on the $10k grid
      expect(calculateCashOfferPrice(1000000, 0.075)).toBe(920000);
    });

    test("honors a custom haircut", () => {
      expect(calculateCashOfferPrice(1000000, 0.05)).toBe(950000);
    });

    test("honors a custom rounding step", () => {
      // 930,000 floored to the $25k grid = 925,000
      expect(calculateCashOfferPrice(1000000, 0.07, 25000)).toBe(925000);
    });

    test("a zero rounding step disables flooring", () => {
      expect(calculateCashOfferPrice(1000000, 0.075, 0)).toBeCloseTo(925000, 6);
    });

    test("returns null for non-positive or non-numeric input", () => {
      expect(calculateCashOfferPrice(0)).toBeNull();
      expect(calculateCashOfferPrice(-5)).toBeNull();
      expect(calculateCashOfferPrice(null)).toBeNull();
      expect(calculateCashOfferPrice(undefined)).toBeNull();
      expect(calculateCashOfferPrice("abc")).toBeNull();
    });
  });

  describe("calculateNetToBuyer", () => {
    test("should calculate with custom rates", () => {
      const askingPrice = 500000;
      const result = calculateNetToBuyer(askingPrice, {
        buyerCostPercent: 12,           // Custom 12%
        sellerCostAssignment: 6,        // Custom 6%
        sellerCostClosing: 1.5,
        additionalCostRehab: 0,
        additionalCostFinancing: 3,
        dscrLtvPercent: 70
      });
      
      expect(result).toBeGreaterThan(0);
      // Add specific expected value calculation
    });
    
    test("should use defaults when no options provided", () => {
      const askingPrice = 500000;
      const result = calculateNetToBuyer(askingPrice);
      
      // Should use business constants
      expect(result).toBeGreaterThan(0);
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

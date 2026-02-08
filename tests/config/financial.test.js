/**
 * Tests for financial configuration constants
 */

import {
  FINANCIAL_CONSTANTS,
  INTEREST_RATE_TIERS,
  DEFAULT_INTEREST_RATE_TYPE,
  SELLER_FI_INTEREST_RATE,
  DEFAULT_DOWN_PAYMENT,
  DEFAULT_CAP_RATE,
  determineInterestRateType
} from '../../src/config/financial.js';

describe('Financial Constants', () => {
  describe('Interest rate tiers', () => {
    test('should have all 5 tiers with valid rates', () => {
      expect(Object.keys(INTEREST_RATE_TIERS)).toHaveLength(5);
      expect(INTEREST_RATE_TIERS.dscr_residential.rate).toBe(0.08);
      expect(INTEREST_RATE_TIERS.dscr_commercial.rate).toBe(0.10);
      expect(INTEREST_RATE_TIERS.commercial.rate).toBe(0.10);
      expect(INTEREST_RATE_TIERS.mixed_use.rate).toBe(0.10);
      expect(INTEREST_RATE_TIERS.rv_park.rate).toBe(0.11);
    });

    test('should have valid amortization periods per tier', () => {
      expect(INTEREST_RATE_TIERS.dscr_residential.amortization).toBe(30);
      expect(INTEREST_RATE_TIERS.dscr_commercial.amortization).toBe(30);
      expect(INTEREST_RATE_TIERS.commercial.amortization).toBe(25);
      expect(INTEREST_RATE_TIERS.mixed_use.amortization).toBe(25);
      expect(INTEREST_RATE_TIERS.rv_park.amortization).toBe(25);
    });

    test('should have a valid default interest rate type', () => {
      expect(DEFAULT_INTEREST_RATE_TYPE).toBe("dscr_residential");
      expect(INTEREST_RATE_TIERS[DEFAULT_INTEREST_RATE_TYPE]).toBeDefined();
    });

    test('should have seller financing rate', () => {
      expect(SELLER_FI_INTEREST_RATE).toBe(0.0);
    });
  });

  describe('Loan terms', () => {
    test('should have standard loan terms', () => {
      expect(FINANCIAL_CONSTANTS.SELLER_FI_AMORTIZATION).toBe(30);
      expect(FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS).toBe(7);
    });
  });

  describe('determineInterestRateType', () => {
    test('should return dscr_residential for small multifamily', () => {
      expect(determineInterestRateType("mfr", 4)).toBe("dscr_residential");
      expect(determineInterestRateType("multifamily", 3)).toBe("dscr_residential");
    });

    test('should return dscr_commercial for 5+ unit multifamily', () => {
      expect(determineInterestRateType("mfr", 5)).toBe("dscr_commercial");
      expect(determineInterestRateType("multifamily", 10)).toBe("dscr_commercial");
    });

    test('should return commercial for business type', () => {
      expect(determineInterestRateType("business")).toBe("commercial");
      expect(determineInterestRateType("commercial")).toBe("commercial");
    });

    test('should return mixed_use for mixed_use type', () => {
      expect(determineInterestRateType("mixed_use")).toBe("mixed_use");
    });

    test('should return rv_park for rv_park type', () => {
      expect(determineInterestRateType("rv_park")).toBe("rv_park");
    });

    test('should default to dscr_residential for unknown types', () => {
      expect(determineInterestRateType("str")).toBe("dscr_residential");
      expect(determineInterestRateType("assisted")).toBe("dscr_residential");
      expect(determineInterestRateType("other")).toBe("dscr_residential");
    });
  });

  describe('Down payments and financing', () => {
    test('should have valid down payment percentages', () => {
      expect(DEFAULT_DOWN_PAYMENT).toBe(0.30);
      expect(FINANCIAL_CONSTANTS.SELLER_FI_DOWN_PAYMENT).toBe(0.60);
      expect(FINANCIAL_CONSTANTS.SELLER_FI_CARRY).toBe(0.40);
      
      // Seller FI down payment + carry should equal 100%
      expect(
        FINANCIAL_CONSTANTS.SELLER_FI_DOWN_PAYMENT + 
        FINANCIAL_CONSTANTS.SELLER_FI_CARRY
      ).toBe(1.0);
    });

    test('should have valid DSCR percentages', () => {
      expect(FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE).toBe(0.70);
      expect(FINANCIAL_CONSTANTS.MAX_DSCR_PERCENTAGE).toBe(0.70);
      expect(FINANCIAL_CONSTANTS.DEFAULT_DSCR_PERCENTAGE).toBeLessThanOrEqual(1);
    });
  });


  describe('Cap rates', () => {
    test('should have reasonable cap rate values', () => {
      expect(DEFAULT_CAP_RATE).toBe(0.05);
      expect(FINANCIAL_CONSTANTS.MAX_ESTIMATED_CAP_RATE).toBe(25);
      expect(DEFAULT_CAP_RATE).toBeGreaterThan(0);
      expect(DEFAULT_CAP_RATE).toBeLessThan(1);
    });
  });

  describe('Market assumptions', () => {
    test('should have reasonable appreciation rate', () => {
      expect(FINANCIAL_CONSTANTS.APPRECIATION_RATE).toBe(0.045);
      expect(FINANCIAL_CONSTANTS.APPRECIATION_RATE).toBeGreaterThan(0);
      expect(FINANCIAL_CONSTANTS.APPRECIATION_RATE).toBeLessThan(1);
    });
  });
});

/**
 * Tests for financial configuration constants
 */

import { 
  FINANCIAL_CONSTANTS,
  DSCR_INTEREST_RATE,
  SELLER_FI_INTEREST_RATE,
  DEFAULT_DOWN_PAYMENT,
  DEFAULT_CAP_RATE,
  MAX_ITERATIONS
} from '../../src/config/financial.js';

describe('Financial Constants', () => {
  describe('Interest rates', () => {
    test('should have reasonable interest rates', () => {
      expect(DSCR_INTEREST_RATE).toBe(0.075);
      expect(SELLER_FI_INTEREST_RATE).toBe(0.0);
      expect(DSCR_INTEREST_RATE).toBeGreaterThan(0);
      expect(DSCR_INTEREST_RATE).toBeLessThan(1);
    });
  });

  describe('Loan terms', () => {
    test('should have standard amortization periods', () => {
      expect(FINANCIAL_CONSTANTS.DSCR_AMORTIZATION).toBe(30);
      expect(FINANCIAL_CONSTANTS.SELLER_FI_AMORTIZATION).toBe(30);
      expect(FINANCIAL_CONSTANTS.DEFAULT_BALLOON_PERIOD_YEARS).toBe(7);
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

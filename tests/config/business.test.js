/**
 * Tests for business configuration constants
 */

import { 
  BUSINESS_CONSTANTS,
  ASSIGNMENT_FEE_PERCENTAGE,
  NET_TO_BUYER_PERCENTAGE,
  CLOSING_COSTS_PERCENTAGE,
  SELLER_AGENT_COMMISSION,
  MINIMUM_COCR15_PRICE
} from '../../src/config/business.js';

describe('Business Constants', () => {
  describe('Fee percentages', () => {
    test('should have correct fee percentages', () => {
      expect(ASSIGNMENT_FEE_PERCENTAGE).toBe(0.05);
      expect(NET_TO_BUYER_PERCENTAGE).toBe(0.10);
      expect(CLOSING_COSTS_PERCENTAGE).toBe(0.0125);
      expect(BUSINESS_CONSTANTS.HARD_MONEY_RATE).toBe(0.03);
      expect(BUSINESS_CONSTANTS.REHAB_RATE).toBe(0.0);
    });
  });

  describe('Agent commissions', () => {
    test('should have standard commission rates', () => {
      expect(SELLER_AGENT_COMMISSION).toBe(0.025);
      expect(BUSINESS_CONSTANTS.BUYER_AGENT_COMMISSION).toBe(0.025);
    });
  });

  describe('COCR15 price limits', () => {
    test('should have reasonable price calculation limits', () => {
      expect(MINIMUM_COCR15_PRICE).toBe(10000);
      expect(BUSINESS_CONSTANTS.MAX_COCR15_PRICE_MULTIPLIER).toBe(50);
      expect(BUSINESS_CONSTANTS.CONSERVATIVE_COCR15_PRICE_MULTIPLIER).toBe(20);
      
      expect(BUSINESS_CONSTANTS.MAX_COCR15_PRICE_MULTIPLIER).toBeGreaterThan(
        BUSINESS_CONSTANTS.CONSERVATIVE_COCR15_PRICE_MULTIPLIER
      );
    });
  });

  describe('Algorithm parameters', () => {
    test('should have reasonable iteration limits', () => {
      expect(BUSINESS_CONSTANTS.MAX_ITERATIONS).toBe(50);
      expect(BUSINESS_CONSTANTS.CALCULATION_TOLERANCE).toBe(0.001);
      expect(BUSINESS_CONSTANTS.ADJUSTMENT_FACTOR).toBe(0.5);
    });
  });
  describe('Export configuration', () => {
    test('should have valid export settings', () => {
      expect(BUSINESS_CONSTANTS.EXPORT_URL_BASE).toContain('https://');
      expect(Array.isArray(BUSINESS_CONSTANTS.EXCLUDED_EXPORT_VALUES)).toBe(true);
      expect(BUSINESS_CONSTANTS.EXCLUDED_EXPORT_VALUES).toContain("Loading...");
      expect(BUSINESS_CONSTANTS.EXCLUDED_EXPORT_VALUES).toContain(null);
      expect(BUSINESS_CONSTANTS.EXCLUDED_EXPORT_VALUES).toContain(undefined);
    });
  });
});

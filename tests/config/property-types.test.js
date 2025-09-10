/**
 * Tests for property type configuration constants
 */

import { 
  PROPERTY_TYPE_CONSTANTS,
  PROPERTY_TYPES,
  STR,
  ASSISTED_LIVING,
  MULTIFAMILY
} from '../../src/config/property-types.js';

describe('Property Type Constants', () => {
  describe('STR constants', () => {
    test('should have correct STR calculations', () => {
      expect(STR.ESTIMATED_GROSS_RATE).toBe(0.10);
      expect(STR.NOI_PERCENTAGE).toBe(0.55);
      expect(STR.DEFAULT_CAP_RATE).toBe(0.05);
    });
  });

  describe('Assisted living constants', () => {
    test('should have correct assisted living calculations', () => {
      expect(ASSISTED_LIVING.INCOME_PER_BEDROOM_MONTHLY).toBe(1500);
      expect(ASSISTED_LIVING.DEFAULT_BEDROOM_COUNT).toBe(10);
      expect(ASSISTED_LIVING.DEFAULT_CAP_RATE).toBe(0.05);
    });
  });

  describe('Multifamily constants', () => {
    test('should have correct multifamily calculations', () => {
      expect(MULTIFAMILY.DEFAULT_CAP_RATE).toBe(0.05);
    });
  });

  describe('Property type enums', () => {
    test('should have consistent property type strings', () => {
      expect(PROPERTY_TYPES.MULTIFAMILY).toBe('multifamily');
      expect(PROPERTY_TYPES.STR).toBe('str');
      expect(PROPERTY_TYPES.ASSISTED_LIVING).toBe('assisted');
    });
  });

  describe('Convenience exports', () => {
    test('should export property objects correctly', () => {
      expect(STR).toEqual(PROPERTY_TYPE_CONSTANTS.STR);
      expect(ASSISTED_LIVING).toEqual(PROPERTY_TYPE_CONSTANTS.ASSISTED_LIVING);
      expect(MULTIFAMILY).toEqual(PROPERTY_TYPE_CONSTANTS.MULTIFAMILY);
    });
  });
});

// Jest setup file for @archerjessop/utilities tests

import { expect } from 'vitest';

// Custom matchers for financial calculations
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false
      };
    }
  },

  toBeCloseToPercentage(received, expected, precision = 2) {
    const pass = Math.abs(received - expected) < Math.pow(10, -precision);
    if (pass) {
      return {
        message: () => `expected ${received} not to be close to ${expected}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be close to ${expected}`,
        pass: false
      };
    }
  }
});

// Global test utilities
global.testHelpers = {
  createMockProperty: (overrides = {}) => ({
    price: 1000000,
    noi: 80000,
    capRate: 0.08,
    ...overrides
  }),

  createMockLoan: (overrides = {}) => ({
    principal: 700000,
    rate: 0.075,
    years: 30,
    ...overrides
  })
};

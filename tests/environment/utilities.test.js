import { getEnvVar, isNodeEnvironment, isBrowserEnvironment } from '../../src/environment/utilities.js';

describe('Environment Utilities', () => {
  describe('getEnvVar', () => {
    test('should return default value when env var not set', () => {
      expect(getEnvVar('NONEXISTENT_VAR', 'default')).toBe('default');
    });

    test('should return env var value when set', () => {
      process.env.TEST_VAR = 'test-value';
      expect(getEnvVar('TEST_VAR', 'default')).toBe('test-value');
      delete process.env.TEST_VAR;
    });

    test('should return default when env var is empty string', () => {
      process.env.TEST_VAR = '';
      expect(getEnvVar('TEST_VAR', 'default')).toBe('default');
      delete process.env.TEST_VAR;
    });
  });

  describe('isNodeEnvironment', () => {
    test('should return true in Node.js environment', () => {
      expect(isNodeEnvironment()).toBe(true);
    });
  });

  describe('isBrowserEnvironment', () => {
    test('should return false in Node.js test environment', () => {
      expect(isBrowserEnvironment()).toBe(false);
    });
  });
});
// src/environment/utilities.js

/**
 * Safely get environment variable (Node.js only)
 * Returns defaultValue in browser environments or if variable is not set
 * 
 * @param {string} key - Environment variable name
 * @param {*} defaultValue - Default value to return if not found
 * @returns {*} Environment variable value or default
 * 
 * @example
 * const apiUrl = getEnvVar('API_URL', 'https://api.example.com');
 */
export const getEnvVar = (key, defaultValue) => {
  try {
    // Check if we're in Node.js environment
    if (typeof process !== 'undefined' && 
        process.env !== undefined && 
        process.env[key]) {
      return process.env[key];
    }
  } catch (e) {
    // Silently fall back to default if anything fails
  }
  return defaultValue;
};

/**
 * Check if running in Node.js environment
 * 
 * @returns {boolean} True if Node.js, false if browser
 * 
 * @example
 * if (isNodeEnvironment()) {
 *   // Node.js specific code
 * }
 */
export const isNodeEnvironment = () => {
  try {
    return typeof process !== 'undefined' && 
           process.versions !== undefined && 
           process.versions.node !== undefined;
  } catch (e) {
    return false;
  }
};

/**
 * Check if running in browser environment
 * 
 * @returns {boolean} True if browser, false if Node.js
 */
export const isBrowserEnvironment = () => {
  try {
    return typeof window !== 'undefined' && 
           typeof document !== 'undefined';
  } catch (e) {
    return false;
  }
};
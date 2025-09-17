/**
 * src/formatting/text.js - Text formatting utilities
 */

/**
 * Normalizes whitespace in text by replacing multiple whitespace characters
 * (spaces, newlines, tabs) with single spaces and trimming edges
 * 
 * @param {string|any} rawText - The text to normalize
 * @returns {string|any} Normalized text or original value if not a string
 */
export function normalizeWhitespace(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return rawText;
  }
  
  return rawText
    .replace(/\s+/g, " ")  // Replace multiple whitespace chars with single space
    .trim();               // Remove leading/trailing whitespace
}
/**
 * tests/formatting/text.test.js - Unit tests for text formatting utilities
 */

import { describe, test, expect } from "vitest";
import { normalizeWhitespace } from "../../src/formatting/text.js";

describe("Text Formatting Utilities", () => {
  describe("normalizeWhitespace", () => {
    test("should handle normal text correctly", () => {
      expect(normalizeWhitespace("John Smith")).toBe("John Smith");
      expect(normalizeWhitespace("Mary Jane Watson")).toBe("Mary Jane Watson");
      expect(normalizeWhitespace("555-123-4567")).toBe("555-123-4567");
    });

    test("should remove leading and trailing whitespace", () => {
      expect(normalizeWhitespace("  John Smith  ")).toBe("John Smith");
      expect(normalizeWhitespace("\t\nMary Jane\t\n")).toBe("Mary Jane");
      expect(normalizeWhitespace("  555-123-4567  ")).toBe("555-123-4567");
    });

    test("should collapse multiple spaces into single space", () => {
      expect(normalizeWhitespace("John    Smith")).toBe("John Smith");
      expect(normalizeWhitespace("Mary  Jane   Watson")).toBe("Mary Jane Watson");
      expect(normalizeWhitespace("555   123   4567")).toBe("555 123 4567");
    });

    test("should handle newlines and tabs", () => {
      expect(normalizeWhitespace("John\nSmith")).toBe("John Smith");
      expect(normalizeWhitespace("Mary\tJane")).toBe("Mary Jane");
      expect(normalizeWhitespace("John\n\nSmith")).toBe("John Smith");
      expect(normalizeWhitespace("Mary\t\t\tJane")).toBe("Mary Jane");
      expect(normalizeWhitespace("555\n123\t4567")).toBe("555 123 4567");
    });

    test("should handle mixed whitespace characters", () => {
      expect(normalizeWhitespace("John\n\t Smith")).toBe("John Smith");
      expect(normalizeWhitespace(" \t\nMary  \n\t Jane \t\n ")).toBe("Mary Jane");
      expect(normalizeWhitespace("First\n  \t  Last")).toBe("First Last");
      expect(normalizeWhitespace("\t555\n  123   4567\t")).toBe("555 123 4567");
    });

    test("should handle complex real-world scenarios", () => {
      expect(normalizeWhitespace("  John\nSmith\n\nReal Estate Agent  ")).toBe("John Smith Real Estate Agent");
      expect(normalizeWhitespace("\t\tMary\n\nJane\t\tBroker\n")).toBe("Mary Jane Broker");
      expect(normalizeWhitespace("Contact:\n\nJohn    Smith\n\n")).toBe("Contact: John Smith");
      expect(normalizeWhitespace("Office:\n555-123-4567\nCell:\n555-987-6543")).toBe("Office: 555-123-4567 Cell: 555-987-6543");
    });

    test("should handle edge cases", () => {
      expect(normalizeWhitespace("")).toBe("");
      expect(normalizeWhitespace("   ")).toBe("");
      expect(normalizeWhitespace("\n\t\n")).toBe("");
      expect(normalizeWhitespace(null)).toBe(null);
      expect(normalizeWhitespace(undefined)).toBe(undefined);
      expect(normalizeWhitespace("A")).toBe("A");
    });

    test("should handle non-string inputs gracefully", () => {
      expect(normalizeWhitespace(123)).toBe(123);
      expect(normalizeWhitespace({})).toStrictEqual({});
      expect(normalizeWhitespace([])).toStrictEqual([]);
    });

    test("should handle unicode and special characters", () => {
      expect(normalizeWhitespace("José  \n\t María")).toBe("José María");
      expect(normalizeWhitespace("  François\n\nDuBois  ")).toBe("François DuBois");
      expect(normalizeWhitespace("李\t\t小明")).toBe("李 小明");
    });

    test("should handle phone number formats", () => {
      expect(normalizeWhitespace("+1\n(555)\t123-4567")).toBe("+1 (555) 123-4567");
      expect(normalizeWhitespace("  555.123.4567  ext\n123  ")).toBe("555.123.4567 ext 123");
      expect(normalizeWhitespace("\t\n+1 555 123 4567\n\n")).toBe("+1 555 123 4567");
    });

    test("should be suitable for various use cases", () => {
      // Contact names
      expect(normalizeWhitespace("  John\n\nSmith  ")).toBe("John Smith");
      expect(normalizeWhitespace("Mary\t\tJane\n\nBroker")).toBe("Mary Jane Broker");
      
      // Addresses
      expect(normalizeWhitespace("123\n\nMain\t\tStreet")).toBe("123 Main Street");
      expect(normalizeWhitespace("  Suite\n100\t\tApt\n5  ")).toBe("Suite 100 Apt 5");
    });
  });
});
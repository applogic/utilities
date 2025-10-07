// tests/financial/formatters.test.js
import { describe, test, expect } from "vitest";
import { 
  formatCurrency, 
  formatPriceValue, 
  formatPercentage 
} from "../../src/financial/formatters.js";

describe("Financial Formatters", () => {
  describe("formatCurrency", () => {
    test("should format standard amounts", () => {
      expect(formatCurrency(1000000)).toBe("$1M");
      expect(formatCurrency(500000)).toBe("$500k");
      expect(formatCurrency(2500000)).toBe("$2.5M");
      expect(formatCurrency(750000)).toBe("$750k");
    });

    test("should handle amounts under 1000", () => {
      expect(formatCurrency(999)).toBe("$999");
      expect(formatCurrency(500)).toBe("$500");
      expect(formatCurrency(50)).toBe("$50");
      expect(formatCurrency(5)).toBe("$5");
    });

    test("should handle precise thousands", () => {
      expect(formatCurrency(1500)).toBe("$1.5k");
      expect(formatCurrency(10500)).toBe("$10.5k");
      expect(formatCurrency(999999)).toBe("$1M");
    });

    test("should handle billions", () => {
      expect(formatCurrency(1000000000)).toBe("$1B");
      expect(formatCurrency(1500000000)).toBe("$1.5B");
      expect(formatCurrency(10500000000)).toBe("$10.5B");
    });

    test("should handle negative amounts", () => {
      expect(formatCurrency(-5000)).toBe("-$5k");
      expect(formatCurrency(-1000000)).toBe("-$1M");
      expect(formatCurrency(-500)).toBe("-$500");
    });

    test("should handle zero", () => {
      expect(formatCurrency(0)).toBe("$0");
    });

    test("should handle edge cases", () => {
      expect(formatCurrency(null)).toBe("$0");
      expect(formatCurrency(undefined)).toBe("$0");
      expect(formatCurrency(NaN)).toBe("$0");
      expect(formatCurrency("1000")).toBe("$1k");
    });

    test("should handle decimal precision", () => {
      expect(formatCurrency(1234567)).toBe("$1.23M");
      expect(formatCurrency(12345)).toBe("$12.3k");
      expect(formatCurrency(123456)).toBe("$123k");
    });
  });

  describe("formatPriceValue", () => {
    test("should format price strings", () => {
      expect(formatPriceValue("$1,000,000")).toBe("$1M");
      expect(formatPriceValue("$500,000")).toBe("$500k");
      expect(formatPriceValue("$2,500,000")).toBe("$2.5M");
    });

    test("should handle unformatted numbers", () => {
      expect(formatPriceValue("1000000")).toBe("$1M");
      expect(formatPriceValue("500000")).toBe("$500k");
    });

    test("should pass through non-numeric values", () => {
      expect(formatPriceValue("Contact for price")).toBe("Contact for price");
      expect(formatPriceValue("TBD")).toBe("TBD");
      expect(formatPriceValue("")).toBe("");
    });

    test("should handle partial formatting", () => {
      expect(formatPriceValue("1,000,000")).toBe("$1M");
      expect(formatPriceValue("$1000000")).toBe("$1M");
    });
  });

  describe("formatPercentage", () => {
    test("should format standard percentages", () => {
      expect(formatPercentage(0.075)).toBe("7.5%");
      expect(formatPercentage(0.10)).toBe("10%");
      expect(formatPercentage(0.125)).toBe("12.5%");
      expect(formatPercentage(0.06875)).toBe("6.88%");
    });

    test("should format whole percentages without decimals", () => {
      expect(formatPercentage(0.05)).toBe("5%");
      expect(formatPercentage(0.20)).toBe("20%");
      expect(formatPercentage(0.15)).toBe("15%");
    });

    test("should handle small percentages", () => {
      expect(formatPercentage(0.001)).toBe("0.1%");
      expect(formatPercentage(0.0025)).toBe("0.25%");
      expect(formatPercentage(0.0001)).toBe("0.01%");
    });

    test("should handle large percentages", () => {
      expect(formatPercentage(1)).toBe("100%");
      expect(formatPercentage(1.5)).toBe("150%");
      expect(formatPercentage(2)).toBe("200%");
    });

    test("should handle negative percentages", () => {
      expect(formatPercentage(-0.05)).toBe("-5%");
      expect(formatPercentage(-0.125)).toBe("-12.5%");
    });

    test("should handle edge cases", () => {
      expect(formatPercentage(0)).toBe("0%");
      expect(formatPercentage(null)).toBe("0%");
      expect(formatPercentage(undefined)).toBe("0%");
      expect(formatPercentage(NaN)).toBe("0%");
    });

    test("should handle already-percentage values", () => {
      expect(formatPercentage(7.5, true)).toBe("7.5%");
      expect(formatPercentage(10, true)).toBe("10%");
      expect(formatPercentage(12.5, true)).toBe("12.5%");
    });
  });
});
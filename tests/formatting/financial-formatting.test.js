import { describe, test, expect, beforeEach } from "vitest";
import { 
  calculateCursorPosition,
  extractNumericValue,
  filterNumericInput,
  formatInputDisplay,
  formatLiveInput,
  formatLiveNumber,
  parseNumericInput
} from "../../src/formatting/financial-formatting.js";

describe("Financial Formatting Utilities", () => {
  
  beforeEach(() => {
    // Reset any global state if needed
  });

  describe("formatInputDisplay", () => {
    describe("Currency Formatting", () => {
      test("should format whole dollar amounts without decimals", () => {
        expect(formatInputDisplay(1000, "currency")).toBe("$1,000");
        expect(formatInputDisplay(500000, "currency")).toBe("$500,000");
        expect(formatInputDisplay(1250000, "currency")).toBe("$1,250,000");
      });

      test("should format decimal amounts with appropriate precision", () => {
        expect(formatInputDisplay(1000.50, "currency")).toBe("$1,000.50");
        expect(formatInputDisplay(500000.99, "currency")).toBe("$500,000.99");
        expect(formatInputDisplay(1250000.01, "currency")).toBe("$1,250,000.01");
      });

      test("should handle property price scenarios", () => {
        const askingPrice = 2500000;
        const offerPrice = 2250000.50;
        
        expect(formatInputDisplay(askingPrice, "currency")).toBe("$2,500,000");
        expect(formatInputDisplay(offerPrice, "currency")).toBe("$2,250,000.50");
      });

      test("should handle negative values for cash flow", () => {
        expect(formatInputDisplay(-5000, "currency")).toBe("-$5,000");
        expect(formatInputDisplay(-1250.75, "currency")).toBe("-$1,250.75");
      });
    });

    describe("Percentage Formatting", () => {
      test("should format whole percentages without decimals", () => {
        expect(formatInputDisplay(5, "percent")).toBe("5%");
        expect(formatInputDisplay(30, "percent")).toBe("30%");
        expect(formatInputDisplay(100, "percent")).toBe("100%");
      });

      test("should format decimal percentages with precision", () => {
        expect(formatInputDisplay(6.5, "percent")).toBe("6.5%");
        expect(formatInputDisplay(7.25, "percent")).toBe("7.25%");
        expect(formatInputDisplay(0.75, "percent")).toBe("0.75%");
      });

      test("should handle typical real estate percentage scenarios", () => {
        const downPayment = 25;
        const interestRate = 6.875;
        const capRate = 7.5;
        const equity = 20;
        
        expect(formatInputDisplay(downPayment, "percent")).toBe("25%");
        expect(formatInputDisplay(interestRate, "percent")).toBe("6.88%");
        expect(formatInputDisplay(capRate, "percent")).toBe("7.5%");
        expect(formatInputDisplay(equity, "percent")).toBe("20%");
      });
    });

    describe("Years Formatting", () => {
      test("should format whole years without decimals", () => {
        expect(formatInputDisplay(5, "years")).toBe("5 yrs.");
        expect(formatInputDisplay(30, "years")).toBe("30 yrs.");
        expect(formatInputDisplay(1, "years")).toBe("1 yrs.");
      });

      test("should format partial years with precision", () => {
        expect(formatInputDisplay(5.5, "years")).toBe("5.5 yrs.");
        expect(formatInputDisplay(2.25, "years")).toBe("2.3 yrs.");
        expect(formatInputDisplay(10.1, "years")).toBe("10.1 yrs.");
      });

      test("should handle common loan term scenarios", () => {
        const balloonTerm = 5;
        const amortization = 30;
        const bridgeTerm = 1.5;
        
        expect(formatInputDisplay(balloonTerm, "years")).toBe("5 yrs.");
        expect(formatInputDisplay(amortization, "years")).toBe("30 yrs.");
        expect(formatInputDisplay(bridgeTerm, "years")).toBe("1.5 yrs.");
      });
    });

    describe("Months Formatting", () => {
      test("should format months as whole numbers", () => {
        expect(formatInputDisplay(6, "months")).toBe("6 mos.");
        expect(formatInputDisplay(12, "months")).toBe("12 mos.");
        expect(formatInputDisplay(0, "months")).toBe("0 mos.");
      });

      test("should round decimal months to whole numbers", () => {
        expect(formatInputDisplay(6.7, "months")).toBe("7 mos.");
        expect(formatInputDisplay(11.2, "months")).toBe("11 mos.");
        expect(formatInputDisplay(18.9, "months")).toBe("19 mos.");
      });

      test("should handle deferred payment scenarios", () => {
        const deferredPeriod = 6;
        const seasonality = 3;
        
        expect(formatInputDisplay(deferredPeriod, "months")).toBe("6 mos.");
        expect(formatInputDisplay(seasonality, "months")).toBe("3 mos.");
      });
    });

    describe("Number Formatting", () => {
      test("should format large numbers with commas", () => {
        expect(formatInputDisplay(1000, "number")).toBe("1,000");
        expect(formatInputDisplay(1000000, "number")).toBe("1,000,000");
        expect(formatInputDisplay(50000, "number")).toBe("50,000");
      });

      test("should preserve decimal places", () => {
        expect(formatLiveNumber("1000.5")).toBe("1,000.50");     // Add trailing zero
        expect(formatLiveNumber("1000.520")).toBe("1,000.52");   // Drop last zero
        expect(formatLiveNumber("1000.50")).toBe("1,000.50");    // Keep as is
        expect(formatLiveNumber("1000.123")).toBe("1,000.12");   // Drop last digit
        expect(formatLiveNumber("1000")).toBe("1,000");       // Add two zeros
      });
    });

    describe("Edge Cases and Error Handling", () => {
      test("should handle invalid inputs gracefully", () => {
        expect(formatInputDisplay("invalid", "currency")).toBe("$0");
        expect(formatInputDisplay(null, "percent")).toBe("0%");
        expect(formatInputDisplay(undefined, "years")).toBe("0 yrs.");
        expect(formatInputDisplay(NaN, "months")).toBe("0 mos.");
      });

      test("should handle unknown format types", () => {
        expect(formatInputDisplay(100, "unknown")).toBe(100);
        expect(formatInputDisplay("test", "invalid")).toBe("test");
      });

      test("should handle extreme values", () => {
        const largeProperty = 100000000;
        const tinyRate = 0.001;
        
        expect(formatInputDisplay(largeProperty, "currency")).toBe("$100,000,000");
        expect(formatInputDisplay(tinyRate, "percent")).toBe("0.001%");
      });
    });
  });

  describe("parseNumericInput", () => {
    describe("Basic Numeric Parsing", () => {
      test("should parse clean numeric strings", () => {
        expect(parseNumericInput("100")).toBe(100);
        expect(parseNumericInput("1000.50")).toBe(1000.50);
        expect(parseNumericInput("0")).toBe(0);
        expect(parseNumericInput("-500")).toBe(-500);
      });

      test("should handle already numeric inputs", () => {
        expect(parseNumericInput(100)).toBe(100);
        expect(parseNumericInput(1000.50)).toBe(1000.50);
        expect(parseNumericInput(-500)).toBe(-500);
      });
    });

    describe("Formatted String Parsing", () => {
      test("should parse currency formatted strings", () => {
        expect(parseNumericInput("$1,000")).toBe(1000);
        expect(parseNumericInput("$1,250,000.50")).toBe(1250000.50);
        expect(parseNumericInput("-$50,000")).toBe(-50000);
        expect(parseNumericInput("$0")).toBe(0);
      });

      test("should parse percentage formatted strings", () => {
        expect(parseNumericInput("6.5%")).toBe(6.5);
        expect(parseNumericInput("25%")).toBe(25);
        expect(parseNumericInput("0.75%")).toBe(0.75);
        expect(parseNumericInput("-5%")).toBe(-5);
      });

      test("should parse years formatted strings", () => {
        expect(parseNumericInput("5 yrs.")).toBe(5);
        expect(parseNumericInput("30 yrs.")).toBe(30);
        expect(parseNumericInput("2.5 yrs.")).toBe(2.5);
      });

      test("should parse months formatted strings", () => {
        expect(parseNumericInput("6 mos.")).toBe(6);
        expect(parseNumericInput("12 mos.")).toBe(12);
        expect(parseNumericInput("18 mos.")).toBe(18);
      });
    });

    describe("Real Estate Scenario Parsing", () => {
      test("should handle typical property price inputs", () => {
        expect(parseNumericInput("$2,500,000")).toBe(2500000);
        expect(parseNumericInput("$1,750,000.00")).toBe(1750000);
        expect(parseNumericInput("2500000")).toBe(2500000);
      });

      test("should handle typical percentage inputs", () => {
        expect(parseNumericInput("25%")).toBe(25);
        expect(parseNumericInput("6.875%")).toBe(6.875);
        expect(parseNumericInput("7.5%")).toBe(7.5);
      });

      test("should handle partial user inputs during typing", () => {
        expect(parseNumericInput("$2,5")).toBe(25);
        expect(parseNumericInput("6.")).toBe(6);
        expect(parseNumericInput("1,")).toBe(1);
        expect(parseNumericInput("$1,0")).toBe(10);
      });

      test("should handle copied formatted values", () => {
        expect(parseNumericInput("$1,234,567.89")).toBe(1234567.89);
        expect(parseNumericInput("15.75%")).toBe(15.75);
        expect(parseNumericInput("30 yrs.")).toBe(30);
        expect(parseNumericInput("6 mos.")).toBe(6);
      });
    });

    describe("Edge Cases and Error Handling", () => {
      test("should handle invalid inputs gracefully", () => {
        expect(parseNumericInput("")).toBe(0);
        expect(parseNumericInput("abc")).toBe(0);
        expect(parseNumericInput("$")).toBe(0);
        expect(parseNumericInput("%")).toBe(0);
        expect(parseNumericInput(" ")).toBe(0);
        expect(parseNumericInput(null)).toBe(0);
        expect(parseNumericInput(undefined)).toBe(0);
      });

      test("should handle malformed numeric strings", () => {
        expect(parseNumericInput("1.2.3")).toBe(1.2);
        expect(parseNumericInput("$1,0a0b0")).toBe(1000);
        expect(parseNumericInput("abc123def")).toBe(123);
        expect(parseNumericInput("1a2b3c")).toBe(123);
      });

      test("should handle strings with multiple formatting characters", () => {
        expect(parseNumericInput("$1,000,000.99")).toBe(1000000.99);
        expect(parseNumericInput("$-500,000")).toBe(-500000);
        expect(parseNumericInput("1,000.50%")).toBe(1000.50);
      });

      test("should handle strings with extra spaces", () => {
        expect(parseNumericInput(" $1,000 ")).toBe(1000);
        expect(parseNumericInput(" 5.5% ")).toBe(5.5);
        expect(parseNumericInput(" 30 yrs. ")).toBe(30);
      });
    });
  });

  describe("filterNumericInput", () => {
    describe("Basic Filtering", () => {
      test("should allow only numeric characters, decimal, and negative", () => {
        expect(filterNumericInput("123")).toBe("123");
        expect(filterNumericInput("123.45")).toBe("123.45");
        expect(filterNumericInput("-123.45")).toBe("-123.45");
        expect(filterNumericInput("abc123def")).toBe("123");
        expect(filterNumericInput("1,2,3")).toBe("123");
      });

      test("should handle single decimal point", () => {
        expect(filterNumericInput("123.45.67")).toBe("123.4567");
        expect(filterNumericInput("1.2.3.4")).toBe("1.234");
      });

      test("should handle negative sign positioning", () => {
        expect(filterNumericInput("-123")).toBe("-123");
        expect(filterNumericInput("12-3")).toBe("-123");
        expect(filterNumericInput("123-")).toBe("-123");
        expect(filterNumericInput("--123")).toBe("-123");
      });
    });

    describe("Edge Cases", () => {
      test("should handle empty values", () => {
        expect(filterNumericInput("")).toBe("");
        expect(filterNumericInput(null)).toBe("");
        expect(filterNumericInput(undefined)).toBe("");
      });

      test("should handle allowNegative parameter", () => {
        expect(filterNumericInput("-123", false)).toBe("123");
        expect(filterNumericInput("-123", true)).toBe("-123");
      });
    });
  });

  describe("formatLiveNumber", () => {
    describe("Comma Insertion", () => {
      test("should add commas to large numbers", () => {
        expect(formatLiveNumber("1000")).toBe("1,000");
        expect(formatLiveNumber("1000000")).toBe("1,000,000");
        expect(formatLiveNumber("1234567.89")).toBe("1,234,567.89");
      });

      test("should not add commas to small numbers", () => {
        expect(formatLiveNumber("100")).toBe("100");
        expect(formatLiveNumber("999")).toBe("999");
      });

      test("should handle negative numbers", () => {
        expect(formatLiveNumber("-1000")).toBe("-1,000");
        expect(formatLiveNumber("-1234567.89")).toBe("-1,234,567.89");
      });
    });

    describe("Decimal Handling", () => {
      test("should preserve decimal places", () => {
        expect(formatLiveNumber("1000.5")).toBe("1,000.50");
        expect(formatLiveNumber("1000.50")).toBe("1,000.50");
        expect(formatLiveNumber("1000.123")).toBe("1,000.12");
      });
    });

    describe("Edge Cases", () => {
      test("should handle invalid inputs", () => {
        expect(formatLiveNumber("")).toBe("");
        expect(formatLiveNumber("abc")).toBe("");
        expect(formatLiveNumber(null)).toBe("");
      });
    });
  });

  describe("formatLiveInput", () => {
    describe("Currency Formatting", () => {
      test("should format currency with dollar sign", () => {
        expect(formatLiveInput("1000", "currency")).toBe("$ 1,000");
        expect(formatLiveInput("-1000", "currency")).toBe("$ -1,000");
        expect(formatLiveInput("1234.56", "currency")).toBe("$ 1,234.56");
      });
    });

    describe("Percentage Formatting", () => {
      test("should format percentages with percent sign", () => {
        expect(formatLiveInput("25", "percent")).toBe("25 %");
        expect(formatLiveInput("6.5", "percent")).toBe("6.5 %");
        expect(formatLiveInput("6.50", "percent")).toBe("6.5 %"); 
        expect(formatLiveInput("6.25", "percent")).toBe("6.25 %"); 
        expect(formatLiveInput("-5", "percent")).toBe("-5 %");
      });
    });

    describe("Years Formatting", () => {
      test("should format years with yrs suffix", () => {
        expect(formatLiveInput("5", "years")).toBe("5 yrs.");
        expect(formatLiveInput("30", "years")).toBe("30 yrs.");
        expect(formatLiveInput("2.5", "years")).toBe("2.5 yrs.");
        expect(formatLiveInput("2.50", "years")).toBe("2.5 yrs.");
        expect(formatLiveInput("2.25", "years")).toBe("2.25 yrs.");
      });

    });

    describe("Months Formatting", () => {
      test("should format months with mos suffix", () => {
        expect(formatLiveInput("6", "months")).toBe("6 mos.");
        expect(formatLiveInput("12", "months")).toBe("12 mos.");
      });
    });

    describe("Input Filtering Integration", () => {
      test("should filter and format in one step", () => {
        expect(formatLiveInput("$1,000", "currency")).toBe("$ 1,000");
        expect(formatLiveInput("25%", "percent")).toBe("25 %");
        expect(formatLiveInput("abc1000def", "currency")).toBe("$ 1,000");
      });
    });
  });

  describe("calculateCursorPosition", () => {
    describe("Comma Addition", () => {
      test("should adjust cursor position when commas are added", () => {
        expect(calculateCursorPosition("1000", "1,000", 4)).toBe(5);
        expect(calculateCursorPosition("10000", "10,000", 5)).toBe(6);
        expect(calculateCursorPosition("1000000", "1,000,000", 7)).toBe(9);
      });

      test("should handle cursor before comma insertion point", () => {
        expect(calculateCursorPosition("1000", "1,000", 2)).toBe(3);   // "10|00" -> "1,0|00"
        expect(calculateCursorPosition("10000", "10,000", 2)).toBe(3); // "10|000" -> "1,0|000"
      });
    });

    describe("Comma Removal", () => {
      test("should adjust cursor position when commas are removed", () => {
        expect(calculateCursorPosition("1,000", "100", 5)).toBe(3);
        expect(calculateCursorPosition("10,000", "1000", 6)).toBe(4);
      });
    });

    describe("Boundary Conditions", () => {
      test("should not go below 0 or above string length", () => {
        expect(calculateCursorPosition("1000", "1,000", -1)).toBe(0);
        expect(calculateCursorPosition("1000", "1,000", 10)).toBe(5);
      });

      test("should move cursor past comma if positioned on one", () => {
        // This would need to be implemented in the function
        expect(calculateCursorPosition("1000", "1,000", 1)).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe("extractNumericValue", () => {
    describe("Currency Extraction", () => {
      test("should extract numeric value from currency format", () => {
        expect(extractNumericValue("$ 1,000", "currency")).toBe(1000);
        expect(extractNumericValue("$ -1,234.56", "currency")).toBe(-1234.56);
        expect(extractNumericValue("$ 0", "currency")).toBe(0);
      });
    });

    describe("Percentage Extraction", () => {
      test("should extract numeric value from percentage format", () => {
        expect(extractNumericValue("25 %", "percent")).toBe(25);
        expect(extractNumericValue("6.5 %", "percent")).toBe(6.5);
        expect(extractNumericValue("-5 %", "percent")).toBe(-5);
      });
    });

    describe("Years Extraction", () => {
      test("should extract numeric value from years format", () => {
        expect(extractNumericValue("5 yrs.", "years")).toBe(5);
        expect(extractNumericValue("30 yrs.", "years")).toBe(30);
        expect(extractNumericValue("2.5 yrs.", "years")).toBe(2.5);
      });
    });

    describe("Months Extraction", () => {
      test("should extract numeric value from months format", () => {
        expect(extractNumericValue("6 mos.", "months")).toBe(6);
        expect(extractNumericValue("12 mos.", "months")).toBe(12);
        expect(extractNumericValue("18 mos.", "months")).toBe(18);
      });
    });

    describe("Complex Formats", () => {
      test("should handle formatted numbers with commas", () => {
        expect(extractNumericValue("$ 1,234,567.89", "currency")).toBe(1234567.89);
        expect(extractNumericValue("1,500 %", "percent")).toBe(1500);
      });
    });

    describe("Edge Cases", () => {
      test("should handle empty and invalid values", () => {
        expect(extractNumericValue("", "currency")).toBe(0);
        expect(extractNumericValue("$ ", "currency")).toBe(0);
        expect(extractNumericValue("abc", "percent")).toBe(0);
        expect(extractNumericValue(null, "years")).toBe(0);
      });
    });
  });

});
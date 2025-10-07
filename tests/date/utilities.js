// tests/date/utilities.test.js
import { describe, test, expect, beforeEach, vi } from "vitest";
import { calculateDOM } from "../../src/date/utilities.js";

describe("Date Utilities", () => {
  describe("calculateDOM (Days on Market)", () => {
    beforeEach(() => {
      // Mock current date for consistent testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-06-15"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    test("should calculate days from date string", () => {
      expect(calculateDOM("2024-06-01")).toBe(14);
      expect(calculateDOM("2024-05-15")).toBe(31);
      expect(calculateDOM("2024-06-14")).toBe(1);
      expect(calculateDOM("2024-06-15")).toBe(0);
    });

    test("should handle various date formats", () => {
      expect(calculateDOM("06/01/2024")).toBe(14);
      expect(calculateDOM("2024/06/01")).toBe(14);
      expect(calculateDOM("June 1, 2024")).toBe(14);
      expect(calculateDOM("1 Jun 2024")).toBe(14);
    });

    test("should extract date from text", () => {
      expect(calculateDOM("Listed on 2024-06-01")).toBe(14);
      expect(calculateDOM("Posted: June 1, 2024")).toBe(14);
      expect(calculateDOM("Available since 06/01/2024")).toBe(14);
    });

    test("should handle future dates", () => {
      expect(calculateDOM("2024-06-20")).toBe(0); // Future date
      expect(calculateDOM("2024-07-01")).toBe(0);
    });

    test("should handle invalid dates", () => {
      expect(calculateDOM("not a date")).toBe(0);
      expect(calculateDOM("2024-13-45")).toBe(0); // Invalid date
      expect(calculateDOM("")).toBe(0);
      expect(calculateDOM(null)).toBe(0);
      expect(calculateDOM(undefined)).toBe(0);
    });

    test("should handle Date objects", () => {
      expect(calculateDOM(new Date("2024-06-01"))).toBe(14);
      expect(calculateDOM(new Date("2024-05-15"))).toBe(31);
    });

    test("should handle timestamps", () => {
      const june1 = new Date("2024-06-01").getTime();
      expect(calculateDOM(june1)).toBe(14);
    });

    test("should handle very old dates", () => {
      expect(calculateDOM("2020-01-01")).toBeGreaterThan(1500);
      expect(calculateDOM("2023-06-15")).toBe(365);
    });

    test("should handle DOM text patterns", () => {
      expect(calculateDOM("45 days on market")).toBe(45);
      expect(calculateDOM("DOM: 30")).toBe(30);
      expect(calculateDOM("Days on Market: 60")).toBe(60);
      expect(calculateDOM("On market for 90 days")).toBe(90);
    });
  });
});
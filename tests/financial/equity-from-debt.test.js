import { describe, test, expect } from "vitest";
import { equityPercentFromDebt } from "../../src/financial/calculations.js";

describe("equityPercentFromDebt", () => {
  test("computes equity as (price - debt) / price", () => {
    // 10521 Blucher Ave: value 946,000, debt 380,084 => ~0.5982
    expect(equityPercentFromDebt(946000, 380084)).toBeCloseTo(0.598219, 5);
  });

  test("zero debt is full equity", () => {
    expect(equityPercentFromDebt(500000, 0)).toBe(1);
  });

  test("recomputes against a user-edited price", () => {
    // same debt, lower price the user typed => lower equity
    expect(equityPercentFromDebt(800000, 380084)).toBeCloseTo(0.524895, 5);
  });

  test("underwater debt yields negative equity (reality, not clamped)", () => {
    expect(equityPercentFromDebt(100000, 150000)).toBeCloseTo(-0.5, 10);
  });

  test("missing debt falls back to 100% equity (estimated case)", () => {
    expect(equityPercentFromDebt(946000, null)).toBe(1);
    expect(equityPercentFromDebt(946000, undefined)).toBe(1);
    expect(equityPercentFromDebt(946000, NaN)).toBe(1);
  });

  test("non-positive or non-numeric price falls back to 100%", () => {
    expect(equityPercentFromDebt(0, 380084)).toBe(1);
    expect(equityPercentFromDebt(-100, 380084)).toBe(1);
    expect(equityPercentFromDebt("abc", 380084)).toBe(1);
  });

  test("accepts numeric strings for price and debt", () => {
    expect(equityPercentFromDebt("946000", "380084")).toBeCloseTo(0.598219, 5);
  });
});

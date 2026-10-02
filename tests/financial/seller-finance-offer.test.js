import { describe, expect, it } from "vitest";
import { calculateSellerFinanceOffer } from "../../src/financial/calculations.js";
import { BUSINESS_CONSTANTS } from "../../src/config/business.js";

// Standard Seller Financing: down payment + seller note = 100% of price (no DSCR leg).
// Default terms are 0% interest / 30yr amortization / 7yr balloon, so the seller-note
// annual payment is simply note / 30 and the COCR falls as the down payment rises.
describe("calculateSellerFinanceOffer", () => {
  it("caps the down payment at 7% when 15% COCR would need more cash", () => {
    // price 1,000,000, noi 50,000 (5% cap). Solving cocr = 15%:
    //   cf = 50000 - (1,000,000 - 10,000d)/30 = 16,666.67 + 333.33d ; down = 10,000d
    //   (16,666.67 + 333.33d)/(10,000d) = 0.15 -> d = 14.29% (> 7 ceiling) -> cap.
    // At 7% down: note 930,000 ; annual pmt 930,000/30 = 31,000 ;
    //   cf = 50,000 - 31,000 = 19,000 ; cocr = 19,000/70,000 = 27.143%.
    const r = calculateSellerFinanceOffer(50000, 1000000);
    expect(r.solvedDownPercent).toBeCloseTo(14.2857, 2);
    expect(r.downPercent).toBe(7);
    expect(r.capped).toBe(true);
    expect(r.downPaymentAmount).toBeCloseTo(70000, 6);
    expect(r.sellerNoteAmount).toBeCloseTo(930000, 6);
    expect(r.annualDebtService).toBeCloseTo(31000, 1);
    expect(r.annualCashFlow).toBeCloseTo(19000, 1);
    expect(r.cocr).toBeCloseTo(27.143, 2);
    expect(r.cashFlowYield).toBeCloseTo(1.9, 3);
  });

  it("uses the exact 15% COCR down payment when it lands at or below 7%", () => {
    // price 1,000,000, noi 40,000 (4% cap). Solving cocr = 15%:
    //   cf = 40,000 - (1,000,000 - 10,000d)/30 = 6,666.67 + 333.33d ; down = 10,000d
    //   (6,666.67 + 333.33d)/(10,000d) = 0.15 -> d = 5.714% (<= 7) -> use solved.
    const r = calculateSellerFinanceOffer(40000, 1000000);
    expect(r.solvedDownPercent).toBeCloseTo(5.7143, 2);
    expect(r.downPercent).toBeCloseTo(5.7143, 2);
    expect(r.capped).toBe(false);
    expect(r.cocr).toBeCloseTo(15, 1);
  });

  it("computes the balloon balance and total payments for the default 7yr / 30yr note", () => {
    // At 7% down: note 930,000 at 0% over 30yr. After 7yr (84 of 360 payments):
    //   balloon = 930,000 * (360 - 84)/360 = 713,000 ; total paid = 31,000 * 7.
    const r = calculateSellerFinanceOffer(50000, 1000000);
    expect(r.balloonBalance).toBeCloseTo(713000, 1);
    expect(r.totalPaymentsToBalloon).toBeCloseTo(217000, 1);
  });

  it("floors at min down and reports the achievable COCR when interest drags the deal below target", () => {
    // price 1,000,000, noi 80,000, 7% seller-note interest. Interest on the ~99% note at
    // 1% down is ~79,036/yr, so cf = 964 and cocr = 9.64% — below the 15% target. COCR only
    // falls as the down rises, so the best (and least-cash) answer is the 1% floor.
    const r = calculateSellerFinanceOffer(80000, 1000000, { interestRate: 0.07 });
    expect(r.downPercent).toBe(1);
    expect(r.capped).toBe(false);
    expect(r.cocr).toBeGreaterThan(9);
    expect(r.cocr).toBeLessThan(10);
  });

  it("returns the minimum down (poor COCR) for a deal that cannot cash-flow", () => {
    // price 1,000,000, noi 20,000 (2% cap). At 1% down the note payment (33,000/yr)
    // already exceeds NOI, so COCR is negative everywhere reachable -> floor at 1%.
    const r = calculateSellerFinanceOffer(20000, 1000000);
    expect(r.downPercent).toBe(1);
    expect(r.cocr).toBeLessThan(0);
    expect(r.capped).toBe(false);
  });

  it("defaults the ceiling to the business constant", () => {
    expect(BUSINESS_CONSTANTS.SELLER_FINANCE_MAX_DOWN_PERCENT).toBe(7);
  });
});

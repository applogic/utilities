import { describe, expect, test } from "vitest";
import { EQUITY_CARRY_TIERS, calculateEquityCarryScore } from "../../src/financial/equity-carry.js";

// The scorer routes scraped_listings into deal pools via the Equity Carry Method (constant
// 110% leverage across five down-payment tiers). These fixtures are fed in the EXACT shape
// Postgres returns — NUMERIC columns as STRINGS and cap_rate as a PERCENT ("12.00", not 0.12)
// — because a fixture written in clean decimals would pass while production data fails
// silently. The expected numbers below are hand-computed (see the design doc), not read back
// from the engine, so the test can actually catch a wrong model.
//
// Hand math (mfr, units < 5 => dscr_residential, rate 0.08 / 30yr; seller carry 0% / 30yr):
//   DSCR leg  = calculatePMT(basis * dscr%, 0.08, 30) * 12 = 0.08805168 * (basis * dscr%)
//   Seller leg = basis * seller% / 30
//   Debt-service fraction of basis: 60-down 0.0749695, 50 0.0694977, 40 0.0640258,
//     30 0.0585540, 20 0.0530822. Cash flow FALLS as the down payment rises.

describe("calculateEquityCarryScore", () => {
  test("PROSPECT: a strong cap rate cash-flows at asking, so the highest down tier (60) wins", () => {
    // WHY: at $1M / 12% cap, NOI = $120,000 clears even the 60-down stack
    // ($74,969.51 debt service) at the asking price -> prospect at the strongest tier.
    const r = calculateEquityCarryScore({ capRate: "12.00", price: "1000000", propertyType: "mfr", units: "4" });
    expect(r.deal_pool).toBe("prospect");
    expect(r.downpayment_percent).toBe(60);
    expect(r.offer_price).toBe(1000000);
    expect(r.cash_flow).toBeCloseTo(45030.49, 1); // 120000 - 74969.51
    expect(r.equity_tier).toEqual({ downPercent: 60, dscrPercent: 70, sellerPercent: 40 });
    expect(r.raw_yield).toBeCloseTo(0.0669178, 5); // (120000 - 53082.17) / 1000000
    expect(r.yield_band).toBe("medium"); // 0.04 <= y <= 0.08
    expect(r.cap_source).toBe("reported"); // a real cap was supplied
  });

  test("DISCOUNT: a deal that fails at asking but cash-flows at the 85% basis routes to discount", () => {
    // WHY: at $1M / 5% cap, NOI = $50,000 is below the cheapest (20-down) stack at asking
    // ($53,082.17) so Run A pass 1 finds nothing; at 85% ($850k) the 30-down stack costs
    // $49,770.90, so it clears by $229.10 -> discount, and 30 is the highest tier that clears.
    const r = calculateEquityCarryScore({ capRate: "5.00", price: "1000000", propertyType: "mfr", units: "4" });
    expect(r.deal_pool).toBe("discount");
    expect(r.downpayment_percent).toBe(30);
    expect(r.offer_price).toBe(850000);
    expect(r.cash_flow).toBeCloseTo(229.1, 0); // 50000 - 49770.90
    expect(r.raw_yield).toBeCloseTo(0.0057414, 5); // (50000 - 45119.85) / 850000
    expect(r.yield_band).toBe("low");
  });

  test("DEAD: a deal that cannot cash-flow even at 85% is dead with the -1 sentinel", () => {
    // WHY: at $1M / 4% cap, NOI = $40,000 is below the 20-down stack at the 85% basis
    // ($45,119.85), so no tier clears in either pass. downpayment_percent = -1 distinguishes
    // "scored dead" from the 0 "never scored" default; yield_band is forced to none.
    const r = calculateEquityCarryScore({ capRate: "4.00", price: "1000000", propertyType: "mfr", units: "4" });
    expect(r.deal_pool).toBe("dead");
    expect(r.downpayment_percent).toBe(-1);
    expect(r.offer_price).toBe(1000000); // asking, not discounted
    expect(r.cash_flow).toBeNull();
    expect(r.equity_tier).toBeNull();
    expect(r.raw_yield).toBeCloseTo(-0.0130822, 5); // (40000 - 53082.17) / 1000000, still reported
    expect(r.yield_band).toBe("none"); // forced for dead despite a real (negative) raw yield
  });

  test("WHY 20-down is cheaper than 60-down: a marginal-NOI deal qualifies low, not high", () => {
    // WHY: the model's core counter-intuition. Lower down = more of the stack on the 0%
    // seller note, so the LOWER tier is the cheaper stack. A cap that clears only the cheapest
    // stack must qualify at 20% down (not 60), proving cash flow rises as the down payment falls.
    // 20-down DS fraction = 0.0530822; 30-down = 0.0585540. A 5.5% cap sits between them.
    const r = calculateEquityCarryScore({ capRate: "5.50", price: "1000000", propertyType: "mfr", units: "4" });
    expect(r.deal_pool).toBe("prospect");
    expect(r.downpayment_percent).toBe(20); // only the cheapest stack clears at asking
  });

  test("units >= 5 selects the commercial DSCR tier (higher rate), which lowers the yield", () => {
    // WHY: determineInterestRateType routes mfr with 5+ units to dscr_commercial (10% vs 8%),
    // a materially more expensive DSCR leg. At 12% cap both route to prospect at asking (same
    // offer basis), so the only difference is the DSCR rate -- the commercial row must yield
    // strictly less. A units-unit bug would make the two scores identical.
    const residential = calculateEquityCarryScore({ capRate: "12.00", price: "1000000", propertyType: "mfr", units: "4" });
    const commercial = calculateEquityCarryScore({ capRate: "12.00", price: "1000000", propertyType: "mfr", units: "6" });
    expect(residential.deal_pool).toBe("prospect");
    expect(commercial.deal_pool).toBe("prospect");
    expect(commercial.offer_price).toBe(residential.offer_price);
    expect(commercial.raw_yield).toBeLessThan(residential.raw_yield);
  });

  test("null reported cap falls back to the 5% default (not Number(null)=0, which scores dead)", () => {
    // WHY: many scraped rows have no published cap. The scorer must score them off the
    // estimated default (5%), never NaN and never a real 0% (Number(null) === 0 is the trap).
    // A 5% cap is the same scenario as the cap-5% discount fixture -> discount at 30-down.
    const r = calculateEquityCarryScore({ capRate: null, price: "1000000", propertyType: "mfr", units: "4" });
    expect(Number.isFinite(r.raw_yield)).toBe(true);
    expect(r.deal_pool).toBe("discount");
    expect(r.downpayment_percent).toBe(30);
    expect(r.cap_source).toBe("estimate"); // flagged so the UI can show "confirm with broker"
    // Same routing as a real 5% cap, but a real 5% is flagged "reported" — the score is
    // identical, only the provenance differs (which is exactly what the UI badge keys off).
    expect(r.deal_pool).toBe(calculateEquityCarryScore({ capRate: "5.00", price: "1000000", propertyType: "mfr", units: "4" }).deal_pool);
    expect(calculateEquityCarryScore({ capRate: "5.00", price: "1000000", propertyType: "mfr", units: "4" }).cap_source).toBe("reported");
  });

  test("non-positive / non-numeric price returns null so the caller skips it (fail loud)", () => {
    // WHY: a 0/null price would make NOI 0 and mis-score the row 'dead'. The SQL gate excludes
    // these, but the scorer also refuses them rather than emitting a bogus terminal bucket.
    expect(calculateEquityCarryScore({ capRate: "6.5", price: "0" })).toBeNull();
    expect(calculateEquityCarryScore({ capRate: "6.5", price: null })).toBeNull();
    expect(calculateEquityCarryScore({ capRate: "6.5", price: "not a number" })).toBeNull();
  });

  test("tier table is the constant 110% leverage stack, highest down first", () => {
    // WHY: the sweep relies on this order (highest down first => first clear = strongest tier)
    // and on DSCR% + seller% = 110 for every tier. A reordering or a broken stack silently
    // changes which tier wins.
    expect(EQUITY_CARRY_TIERS.map((t) => t.downPercent)).toEqual([60, 50, 40, 30, 20]);
    for (const t of EQUITY_CARRY_TIERS) {
      expect(t.dscrPercent + t.sellerPercent).toBe(110);
      expect(t.dscrPercent).toBe(t.downPercent + 10);
      expect(t.sellerPercent).toBe(100 - t.downPercent);
    }
  });
});

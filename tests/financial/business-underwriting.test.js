import { describe, expect, test } from "vitest";
import {
  calculateBusinessDownPayment,
  calculateBusinessOffer,
  calculateBusinessSellerFinance,
  resolveBusinessEarnings,
  shouldIncludeRealEstate,
  underwriteBusinessListing,
} from "../../src/financial/business-underwriting.js";

// Underwriting for businesses backed by real estate. Every expected number below is
// hand-computed from the model, never read back from the engine, so a wrong model fails
// the test rather than agreeing with itself.
//
// Model:
//   down  = 0.50*RE + 0.30*FF&E + 0.20*inventory + (EBITDA >= $1M ? 0.20*EBITDA : 0)
//   offer = {2,3} x earnings + the tangible assets whose include flag is on
//
// Fixtures use the string-shaped values the DOM scrape and Postgres NUMERIC columns
// actually produce ("$660,061", "2000000"), because decimal-clean fixtures would pass
// while production data silently failed.

describe("resolveBusinessEarnings", () => {
  test("prefers EBITDA over SDE, because the multiple is defined on EBITDA", () => {
    expect(resolveBusinessEarnings({ ebitda: 800000, sde: 950000 })).toEqual({
      earnings: 800000,
      source: "ebitda",
    });
  });

  test("falls back to SDE, and labels the source — most BizBuySell listings publish no EBITDA", () => {
    // WHY: the gunrange listing reports only "Cash Flow (SDE): $660,061". Quoting a
    // multiple of SDE as though it were an EBITDA multiple would overstate the business.
    expect(resolveBusinessEarnings({ sde: "$660,061" })).toEqual({
      earnings: 660061,
      source: "sde",
    });
  });

  test("returns null rather than 0 when the listing publishes no earnings at all", () => {
    // WHY: 0 would flow through as a real $0 offer; null stops the quote.
    expect(resolveBusinessEarnings({})).toEqual({ earnings: null, source: null });
  });
});

describe("shouldIncludeRealEstate", () => {
  test("excludes real estate worth the whole asking price — the building IS the ask", () => {
    // WHY: the real BizBuySell listing 2420290 asks $10,000,000 and states its real estate
    // at $10,000,000, with no inclusion wording anywhere. Adding it on top of the multiple
    // would quote a ceiling of $11,980,183 against a $10M ask.
    expect(shouldIncludeRealEstate({ askingPrice: 10000000, realEstateValue: 10000000 })).toBe(false);
  });

  test("excludes real estate valued above the asking price", () => {
    expect(shouldIncludeRealEstate({ askingPrice: 4000000, realEstateValue: 5000000 })).toBe(false);
  });

  test("includes real estate worth less than the ask — the balance is the business", () => {
    // WHY: a $2M building inside a $5M ask means $3M is being charged for the business,
    // which is exactly the case the multiple plus assets is built to price.
    expect(shouldIncludeRealEstate({ askingPrice: 5000000, realEstateValue: 2000000 })).toBe(true);
  });

  test("explicit listing wording beats the arithmetic in both directions", () => {
    // WHY: the seller stating the position is a fact; the value comparison is only an
    // inference drawn when they said nothing.
    expect(shouldIncludeRealEstate({ askingPrice: 10000000, realEstateValue: 10000000, statedInclusion: true })).toBe(true);
    expect(shouldIncludeRealEstate({ askingPrice: 5000000, realEstateValue: 1000000, statedInclusion: false })).toBe(false);
  });

  test("includes by default when either figure is missing", () => {
    // WHY: no asking price or no stated real-estate value means there is nothing to compare,
    // so the guard must not fire — it would drop an asset on no evidence.
    expect(shouldIncludeRealEstate({ realEstateValue: 2000000 })).toBe(true);
    expect(shouldIncludeRealEstate({ askingPrice: 5000000 })).toBe(true);
    expect(shouldIncludeRealEstate({})).toBe(true);
  });
});

describe("calculateBusinessDownPayment", () => {
  test("sums the collateral legs at their own advance rates", () => {
    // Hand math: 0.50*2,000,000 = 1,000,000
    //          + 0.30*300,000   =    90,000
    //          + 0.20*100,000   =    20,000
    //          + 0.20*1,500,000 =   300,000  (EBITDA >= $1M)
    //          =                   1,410,000
    const result = calculateBusinessDownPayment({
      ebitda: 1500000,
      ffeValue: 300000,
      inventoryValue: 100000,
      realEstateValue: 2000000,
    });

    expect(result.downPayment).toBe(1410000);
    expect(result.legs).toEqual({
      ebitda: 300000,
      ffe: 90000,
      inventory: 20000,
      realEstate: 1000000,
    });
  });

  test("the EBITDA leg fires at exactly $1M — the threshold is inclusive", () => {
    // WHY: pinning the boundary. 0.20 * 1,000,000 = 200,000.
    expect(calculateBusinessDownPayment({ ebitda: 1000000 }).legs.ebitda).toBe(200000);
  });

  test("the EBITDA leg contributes nothing a dollar below the threshold", () => {
    // WHY: earnings below $1M are not treated as collateral at all — this is a cliff,
    // not a taper, so $999,999 must contribute exactly 0.
    expect(calculateBusinessDownPayment({ ebitda: 999999 }).legs.ebitda).toBe(0);
  });

  test("a large SDE never fires the EBITDA leg", () => {
    // WHY: SDE includes owner compensation, so it is not the measure the $1M threshold
    // was set against. Coalescing it into the EBITDA leg would inflate the down payment
    // on exactly the listings that report SDE only — i.e. most of them.
    const result = calculateBusinessDownPayment({ realEstateValue: 1000000, sde: 5000000 });

    expect(result.legs.ebitda).toBe(0);
    expect(result.downPayment).toBe(500000);
  });

  test("parses currency strings and ignores assets the listing never reported", () => {
    // Hand math: 0.50 * 2,000,000 = 1,000,000, with no FF&E or inventory reported.
    expect(calculateBusinessDownPayment({ realEstateValue: "$2,000,000" }).downPayment).toBe(1000000);
  });

  test("an excluded asset stops securing the down payment", () => {
    // WHY: the include flags gate the offer, so they must gate the collateral too.
    // An excluded building is not being bought; counting half its value as collateral
    // would quote a down payment secured by an asset that is not in the deal.
    // Hand math with the real estate out: 0.30*500,000 = 150,000
    //                                   + 0.20*200,000 =  40,000
    //                                   + 0.20*1,500,000 = 300,000
    //                                   =                  490,000
    const result = calculateBusinessDownPayment({
      ebitda: 1500000,
      ffeValue: 500000,
      includeRealEstate: false,
      inventoryValue: 200000,
      realEstateValue: 3000000,
    });

    expect(result.legs.realEstate).toBe(0);
    expect(result.downPayment).toBe(490000);
  });

  test("excluding EBITDA drops only its advance, leaving the tangible legs intact", () => {
    // WHY: the EBITDA flag governs collateral alone. It must not disturb the assets,
    // and it must not be confused with the earnings figure driving the multiple.
    // Hand math: 0.50*3,000,000 + 0.30*500,000 + 0.20*200,000 = 1,690,000
    const result = calculateBusinessDownPayment({
      ebitda: 1500000,
      ffeValue: 500000,
      includeEbitda: false,
      inventoryValue: 200000,
      realEstateValue: 3000000,
    });

    expect(result.legs.ebitda).toBe(0);
    expect(result.downPayment).toBe(1690000);
  });

  test("every flag defaults on, so an unflagged caller keeps the full stack", () => {
    // WHY: backwards compatibility. Callers predating the flags pass none, and an asset
    // silently dropped from the collateral is the more damaging error.
    expect(calculateBusinessDownPayment({ realEstateValue: 1000000 }).downPayment).toBe(500000);
  });
});

describe("calculateBusinessSellerFinance", () => {
  // The seller carries whatever the collateral down payment leaves on the offered
  // price. Fixtures use 5,000,000 offered against 2,000,000 down, so the carry is
  // 3,000,000 throughout and each mode's arithmetic is comparable at a glance.

  test("amortizes the carry and reports the balance still owed at the balloon", () => {
    // Hand math at 0% over 30 years, 7-year balloon:
    //   carry    = 5,000,000 - 2,000,000 = 3,000,000
    //   payment  = 3,000,000 / 360       =     8,333.33
    //   balloon  = 3,000,000 * (360-84)/360 = 2,300,000
    //   payments = 8,333.33 * 12 * 7     =   700,000
    const result = calculateBusinessSellerFinance({
      amortizationYears: 30,
      balloonYears: 7,
      downPayment: 2000000,
      interestRate: 0,
      priceOffered: 5000000,
    });

    expect(result.sellerFinanced).toBe(3000000);
    expect(result.sfPayment).toBeCloseTo(8333.333333, 4);
    expect(result.balloonBalance).toBe(2300000);
    expect(result.totalPayments).toBeCloseTo(700000, 4);
    expect(result.performancePayout).toBe(0);
  });

  test("simple payout defers interest to the balloon instead of the payment", () => {
    // WHY: in payout mode the running payment is principal-only, so the interest has to
    // reappear at the balloon or the seller is never paid it at all.
    // Hand math: payout  = 3,000,000 * 0.05 * 7 = 1,050,000
    //            balloon = 3,000,000 + 1,050,000 = 4,050,000  (principal undiminished)
    const result = calculateBusinessSellerFinance({
      amortizationYears: 30,
      balloonYears: 7,
      downPayment: 2000000,
      interestPaymentMode: "simple_payout",
      interestRate: 0.05,
      priceOffered: 5000000,
    });

    expect(result.sfPayment).toBeCloseTo(8333.333333, 4);
    expect(result.performancePayout).toBe(1050000);
    expect(result.balloonBalance).toBe(4050000);
  });

  test("compound payout accrues the deferred interest, not just multiplies it", () => {
    // WHY: this is the only difference from simple payout, so it is the whole test.
    // Hand math: 1.05^7 = 1.40710042265625
    //            payout = 3,000,000 * 0.40710042265625 = 1,221,301.26796875
    const result = calculateBusinessSellerFinance({
      amortizationYears: 30,
      balloonYears: 7,
      downPayment: 2000000,
      interestPaymentMode: "compound_payout",
      interestRate: 0.05,
      priceOffered: 5000000,
    });

    expect(result.performancePayout).toBeCloseTo(1221301.26796875, 6);
    expect(result.balloonBalance).toBeCloseTo(4221301.26796875, 6);
  });

  test("reports nulls until a price is actually offered", () => {
    // WHY: the offer is a range and the LOI needs one number. A zeroed payment schedule
    // would render on an LOI as real terms — $0 payments against a $0 balloon — so the
    // absence of a chosen price has to stay visible instead of collapsing to zero.
    expect(calculateBusinessSellerFinance({ downPayment: 2000000 })).toEqual({
      balloonBalance: null,
      performancePayout: 0,
      sellerFinanced: null,
      sfPayment: null,
      totalPayments: null,
    });
  });

  test("never carries a negative balance when collateral outruns the offer", () => {
    // WHY: a down payment above the price is a real signal (collateralShortfall), but it
    // must not invert into a carry the seller somehow owes the buyer.
    const result = calculateBusinessSellerFinance({
      downPayment: 2000000,
      priceOffered: 1000000,
    });

    expect(result.sellerFinanced).toBe(0);
    expect(result.balloonBalance).toBe(0);
  });
});

describe("calculateBusinessOffer", () => {
  test("brackets the offer at 2x and 3x earnings plus the conveying assets", () => {
    // Hand math: assets = 2,000,000 + 300,000 + 100,000 = 2,400,000
    //            low  = 2 * 500,000 + 2,400,000 = 3,400,000
    //            high = 3 * 500,000 + 2,400,000 = 3,900,000
    const result = calculateBusinessOffer({
      earnings: 500000,
      ffeValue: 300000,
      inventoryValue: 100000,
      realEstateValue: 2000000,
    });

    expect(result).toEqual({ assetsIncluded: 2400000, offerHigh: 3900000, offerLow: 3400000 });
  });

  test("drops an asset the listing states is already in the asking price", () => {
    // WHY: include_* is how "included in asking price" wording reaches the math.
    // Hand math: assets = 300,000 FF&E only; high = 3*500,000 + 300,000 = 1,800,000.
    const result = calculateBusinessOffer({
      earnings: 500000,
      ffeValue: 300000,
      includeRealEstate: false,
      realEstateValue: 2000000,
    });

    expect(result.assetsIncluded).toBe(300000);
    expect(result.offerHigh).toBe(1800000);
  });

  test("includes assets by default when the wording could not be determined", () => {
    // WHY: the toggles default true on purpose. Silently dropping an asset understates
    // the offer, which is the more damaging error — a wrong inclusion is visible and
    // toggled off in a second.
    expect(calculateBusinessOffer({ earnings: 100000, realEstateValue: 1000000 }).assetsIncluded).toBe(1000000);
  });

  test("quotes no offer without earnings, even when the assets are known", () => {
    // WHY: returning just the asset total would read as an offer of that amount.
    const result = calculateBusinessOffer({ realEstateValue: 2000000 });

    expect(result.offerLow).toBeNull();
    expect(result.offerHigh).toBeNull();
    expect(result.assetsIncluded).toBe(2000000);
  });
});

describe("underwriteBusinessListing", () => {
  test("underwrites the gunrange listing from its published figures", () => {
    // The real listing (BizBuySell 2420290): asking $10,000,000, "Cash Flow (SDE)"
    // $660,061, and no EBITDA / FF&E / inventory / real-estate value published.
    // Hand math: earnings 660,061 (sde); no collateral reported so down = 0;
    //            low  = 2 * 660,061 = 1,320,122
    //            high = 3 * 660,061 = 1,980,183
    // The gulf between the $10M ask and a $1.98M ceiling is the honest answer here.
    const result = underwriteBusinessListing({ asking_price: 10000000, sde: "$660,061" });

    expect(result.earnings).toBe(660061);
    expect(result.earningsSource).toBe("sde");
    expect(result.downPayment).toBe(0);
    expect(result.offerLow).toBe(1320122);
    expect(result.offerHigh).toBe(1980183);
    expect(result.collateralShortfall).toBe(false);
  });

  test("reads snake_case columns straight from the database row", () => {
    // WHY: the dashboard passes a Postgres row through unchanged; a camelCase-only
    // reader would silently underwrite every stored listing as asset-free.
    // Hand math: down = 0.50*1,000,000 + 0.30*200,000 = 500,000 + 60,000 = 560,000
    //            high = 3*400,000 + 1,200,000 = 2,400,000
    const result = underwriteBusinessListing({
      ebitda: 400000,
      ff_e_value: "200000",
      real_estate_value: "1000000",
    });

    expect(result.downPayment).toBe(560000);
    expect(result.offerHigh).toBe(2400000);
    expect(result.sellerCarry).toBe(1840000);
  });

  test("flags a collateral shortfall instead of clamping it", () => {
    // WHY: real estate worth far more than the earnings justify is a genuine signal, not
    // an error to hide. Reaching it takes LOSSES, not merely thin earnings: every advance
    // rate is below 1, so an included asset always adds more to the offer than to the
    // collateral, and the EBITDA leg (0.20x) is dominated by the 3x multiple taken on the
    // same figure. A business losing money against valuable real estate is the remaining
    // case — and is exactly the distressed target this pipeline exists to find.
    //
    // Hand math: down = 0.50*5,000,000               = 2,500,000  (EBITDA leg dormant)
    //            high = 3*(-2,000,000) + 5,000,000   = -1,000,000
    //            2,500,000 > -1,000,000 -> shortfall
    const result = underwriteBusinessListing({
      ebitda: -2000000,
      real_estate_value: 5000000,
    });

    expect(result.downPayment).toBe(2500000);
    expect(result.offerHigh).toBe(-1000000);
    expect(result.collateralShortfall).toBe(true);
    expect(result.sellerCarry).toBe(-3500000);
  });

  test("the include flags move the collateral and the offer together", () => {
    // WHY: this is the regression. Excluding the real estate used to drop it from the
    // offer while leaving half its value in the down payment — quoting collateral drawn
    // from a building that is not in the deal.
    // Hand math with the real estate out: down = 0.30*500,000 + 0.20*200,000
    //                                          + 0.20*1,500,000 = 490,000
    //                                     high = 3*1,500,000 + 500,000 + 200,000
    //                                          = 5,200,000
    const result = underwriteBusinessListing({
      ebitda: "1500000",
      ff_e_value: "500000",
      include_real_estate: false,
      inventory_value: "200000",
      real_estate_value: "3000000",
    });

    expect(result.downPayment).toBe(490000);
    expect(result.legs.realEstate).toBe(0);
    expect(result.assetsIncluded).toBe(700000);
    expect(result.offerHigh).toBe(5200000);
  });

  test("terms price the deal at the offer made, while sellerCarry stays the ceiling", () => {
    // WHY: the range and the deal are different numbers and an LOI must quote the deal.
    // sellerCarry is the carry at offerHigh; terms.sellerFinanced is the carry at the
    // price actually offered. Conflating them would put the ceiling on the letter.
    // Hand math: down  = 0.50*3,000,000 + 0.20*1,500,000 = 1,800,000
    //            high  = 3*1,500,000 + 3,000,000         = 7,500,000
    //            carry = 7,500,000 - 1,800,000           = 5,700,000
    //            terms = 5,000,000 - 1,800,000           = 3,200,000
    const result = underwriteBusinessListing({
      balloon_length: 7,
      ebitda: "1500000",
      price_offered: "5000000",
      real_estate_value: "3000000",
      seller_amortization: 30,
      seller_fi_rate: 0,
    });

    expect(result.downPayment).toBe(1800000);
    expect(result.sellerCarry).toBe(5700000);
    expect(result.priceOffered).toBe(5000000);
    expect(result.terms.sellerFinanced).toBe(3200000);
    // 3,200,000 / 360 = 8,888.88; balloon 3,200,000 * (360-84)/360 = 2,453,333.33
    expect(result.terms.sfPayment).toBeCloseTo(8888.888889, 4);
    expect(result.terms.balloonBalance).toBeCloseTo(2453333.333333, 4);
  });

  test("leaves the terms null until a price is offered", () => {
    // WHY: an imported listing has a range and no chosen price. The LOI must not be able
    // to render $0 terms as though they were agreed.
    const result = underwriteBusinessListing({ ebitda: "1500000", real_estate_value: "3000000" });

    expect(result.priceOffered).toBe(null);
    expect(result.terms.sellerFinanced).toBe(null);
    expect(result.terms.sfPayment).toBe(null);
  });

  test("carries a stored earnings_source rather than re-deriving it", () => {
    // WHY: once a human confirms which figure the multiple applies to, a later
    // re-underwrite must not quietly relabel it.
    const result = underwriteBusinessListing({ earnings_source: "cash_flow", sde: 300000 });

    expect(result.earningsSource).toBe("cash_flow");
    expect(result.offerHigh).toBe(900000);
  });
});

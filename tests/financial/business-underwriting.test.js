import { describe, expect, test } from "vitest";
import {
  calculateBusinessCashFlow,
  calculateBusinessDownPayment,
  calculateBusinessOffer,
  calculateBusinessSellerFinance,
  resolveBusinessEarnings,
  shouldIncludeRealEstate,
  underwriteBusinessListing,
} from "../../src/financial/business-underwriting.js";
import { calculatePMT } from "../../src/financial/calculations.js";

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

  test("an asset kept out of the offer range still secures the down payment", () => {
    // WHY: this is the distinction the whole model turns on, and it is easy to collapse.
    // include_* answers "is this ADDED to the offer on top of the multiple", NOT "is this
    // being bought". A building worth exactly the asking price is not added (that would
    // quote a ceiling above the ask) but it is still acquired and still secures half its
    // value. Gating collateral on that flag zeroes the down payment on precisely the
    // listings where the real estate is the whole thesis.
    // Hand math: 0.50*3,000,000 + 0.30*500,000 + 0.20*200,000 + 0.20*1,500,000 = 1,990,000
    const result = calculateBusinessDownPayment({
      ebitda: 1500000,
      ffeValue: 500000,
      includeRealEstate: false,
      inventoryValue: 200000,
      realEstateValue: 3000000,
    });

    expect(result.legs.realEstate).toBe(1500000);
    expect(result.downPayment).toBe(1990000);
  });

  test("collateralizeEbitda drops only its advance, leaving the tangible legs intact", () => {
    // WHY: the one collateral switch that exists, named apart from include_* because it
    // answers the other question. EBITDA never enters the offer range, so there is no
    // include_ebitda for it to be confused with.
    // Hand math: 0.50*3,000,000 + 0.30*500,000 + 0.20*200,000 = 1,690,000
    const result = calculateBusinessDownPayment({
      collateralizeEbitda: false,
      ebitda: 1500000,
      ffeValue: 500000,
      inventoryValue: 200000,
      realEstateValue: 3000000,
    });

    expect(result.legs.ebitda).toBe(0);
    expect(result.downPayment).toBe(1690000);
  });

  test("collateralizeEbitda defaults on, so an unflagged caller keeps the full stack", () => {
    // WHY: backwards compatibility. Callers predating the switch pass none, and an asset
    // silently dropped from the collateral is the more damaging error.
    expect(calculateBusinessDownPayment({ ebitda: 1500000 }).downPayment).toBe(300000);
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
    //            low  = 2   * 500,000 + 2,400,000 = 3,400,000
    //            mid  = 2.5 * 500,000 + 2,400,000 = 3,650,000
    //            high = 3   * 500,000 + 2,400,000 = 3,900,000
    const result = calculateBusinessOffer({
      earnings: 500000,
      ffeValue: 300000,
      inventoryValue: 100000,
      realEstateValue: 2000000,
    });

    expect(result).toEqual({ assetsIncluded: 2400000, offerHigh: 3900000, offerLow: 3400000, offerMid: 3650000 });
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
    // WHY: real estate worth far more than the earnings justify is a genuine signal,
    // not an error to hide. Hand math: down = 0.50*5,000,000 = 2,500,000;
    // high = 3*50,000 + 5,000,000 = 5,150,000... still covered, so push earnings lower
    // with the real estate excluded from the offer: high = 3*50,000 = 150,000 < 2,500,000.
    const result = underwriteBusinessListing({
      ebitda: 50000,
      include_real_estate: false,
      real_estate_value: 5000000,
    });

    expect(result.downPayment).toBe(2500000);
    expect(result.offerHigh).toBe(150000);
    expect(result.collateralShortfall).toBe(true);
    expect(result.sellerCarry).toBe(-2350000);
  });

  test("an offer-range exclusion leaves the collateral stack untouched", () => {
    // WHY: the regression guard. include_real_estate is about double-counting in the
    // offer, never about whether the asset conveys — so excluding it must move
    // assetsIncluded and offerHigh while downPayment stays exactly where it was.
    // Hand math: down = 0.50*3,000,000 + 0.30*500,000 + 0.20*200,000 + 0.20*1,500,000
    //                 = 1,990,000  (unchanged by the flag)
    //            high = 3*1,500,000 + 500,000 + 200,000 = 5,200,000
    const result = underwriteBusinessListing({
      ebitda: "1500000",
      ff_e_value: "500000",
      include_real_estate: false,
      inventory_value: "200000",
      real_estate_value: "3000000",
    });

    expect(result.downPayment).toBe(1990000);
    expect(result.legs.realEstate).toBe(1500000);
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

describe("calculateBusinessOffer — mid multiple", () => {
  test("offerMid is 2.5x earnings plus the included assets", () => {
    // WHY: the gate can be run at the middle of the range, so the middle must exist.
    // Hand math: 2.5 * 500,000 + 3,000,000 = 4,250,000.
    const result = calculateBusinessOffer({ earnings: 500000, realEstateValue: 3000000 });
    expect(result.offerMid).toBe(4250000);
    expect(result.offerLow).toBe(4000000);
    expect(result.offerHigh).toBe(4500000);
  });

  test("offerMid is null when there is no earnings figure", () => {
    expect(calculateBusinessOffer({ realEstateValue: 3000000 }).offerMid).toBe(null);
  });
});

describe("calculateBusinessCashFlow", () => {
  test("an SDE deal installs a manager, services both loans, and clears", () => {
    // WHY: the whole point of the gate — earnings must cover the DSCR loan (P+I on the
    // advance) AND the 0% seller carry, AFTER a hired manager, or the deal is not real.
    // SDE still pays the owner, so the manager comes out of it.
    //   manager  = clamp(0.125 * 2,000,000, 60K, 120K) = 250,000 -> capped at 120,000
    //   adjusted = 500,000 - 120,000 = 380,000
    //   DSCR     = P+I on the 1,500,000 advance at 10% / 25yr
    //   seller   = (4,500,000 - 1,500,000) principal-only over 60yr = 3,000,000 / 720 /mo
    //   cashflow = adjusted - DSCR*12 - seller*12   (positive here -> passes)
    const cf = calculateBusinessCashFlow({
      askingPrice: 5000000,
      downPayment: 1500000,
      earnings: 500000,
      earningsSource: "sde",
      grossRevenue: 2000000,
      offerHigh: 4500000,
      priceOffered: 4500000,
    });

    expect(cf.managerCost).toBe(120000);
    expect(cf.adjustedEarnings).toBe(380000);
    expect(cf.dscrPaymentMonthly).toBe(calculatePMT(1500000, 0.10, 25));
    expect(cf.sellerPaymentMonthly).toBeCloseTo(3000000 / 720, 6);
    expect(cf.cashFlowAnnual).toBeCloseTo(380000 - calculatePMT(1500000, 0.10, 25) * 12 - (3000000 / 720) * 12, 6);
    expect(cf.marginAnnual).toBeCloseTo(cf.cashFlowAnnual / 4500000, 12);
    expect(cf.marginMonthly).toBeCloseTo(cf.cashFlowMonthly / 4500000, 12);
    expect(cf.pass).toBe(true);
    expect(cf.offerBelowAsking).toBe(true); // 4.5M ceiling < 5M ask -> soft highlight, not a pill
    expect(cf.pills).toEqual([]);
  });

  test("EBITDA is used raw (no manager) and the EBITDA advance leg flags cash-flow lending", () => {
    // WHY: EBITDA is already struck after management, so no manager is deducted; and once
    // the advance leans on the 0.20*EBITDA leg the deal is financed on cash flow, which the
    // "EBITDA financed" pill must surface even when it still clears.
    //   advance  = 0.50*2,000,000 + 0.20*1,500,000 = 1,300,000  (EBITDA leg = 300,000)
    //   offerHigh= 3*1,500,000 + 2,000,000 = 6,500,000
    const cf = calculateBusinessCashFlow({
      downPayment: 1300000,
      earnings: 1500000,
      earningsSource: "ebitda",
      ebitdaLegAmount: 300000,
      grossRevenue: 4000000,
      offerHigh: 6500000,
      priceOffered: 6500000,
    });

    expect(cf.managerCost).toBe(0);
    expect(cf.adjustedEarnings).toBe(1500000);
    expect(cf.ebitdaFinanced).toBe(true);
    expect(cf.pass).toBe(true);
    expect(cf.flagged).toBe(true);
    expect(cf.pills).toEqual(["EBITDA financed"]);
  });

  test("thin earnings that cannot service the debt fail the gate with a Cash Flow pill", () => {
    // WHY: the fail path. No revenue reported, so the manager falls to the $60K floor (never
    // zero), and $100K of SDE cannot carry a $1M DSCR loan plus a $4M seller carry.
    //   manager  = 60,000 (floor)      adjusted = 40,000
    const cf = calculateBusinessCashFlow({
      downPayment: 1000000,
      earnings: 100000,
      earningsSource: "sde",
      offerHigh: 5000000,
      priceOffered: 5000000,
    });

    expect(cf.managerCost).toBe(60000);
    expect(cf.cashFlowAnnual).toBeLessThan(0);
    expect(cf.pass).toBe(false);
    expect(cf.pills).toContain("Cash Flow");
  });

  test("returns null when it cannot be gated — no earnings, or no price", () => {
    // WHY: an un-underwritable listing has not failed; a zeroed verdict would read as a fail.
    expect(calculateBusinessCashFlow({ downPayment: 100000, priceOffered: 500000 })).toBe(null);
    expect(calculateBusinessCashFlow({ downPayment: 100000, earnings: 500000 })).toBe(null);
  });
});

describe("underwriteBusinessListing — cash-flow gate", () => {
  test("attaches the gate priced at the offer ceiling by default", () => {
    // WHY: the panel shows a range but must gate somewhere; the ceiling is the thinnest
    // margin, so it is the honest default. Hand math: down = 0.50*3,000,000 = 1,500,000;
    // offerHigh = 3*500,000 + 3,000,000 = 4,500,000; manager clamps at 120,000.
    const result = underwriteBusinessListing({
      gross_revenue: 2000000,
      real_estate_value: 3000000,
      sde: 500000,
    });

    expect(result.offerMid).toBe(4250000);
    expect(result.offerEnd).toBe("high");
    expect(result.cashFlow.price).toBe(4500000);
    expect(result.cashFlow.managerCost).toBe(120000);
    expect(result.cashFlow.pass).toBe(true);
  });

  test("offer_end re-gates at the chosen end of the range", () => {
    // WHY: the panel's high/mid/low toggle. A lower offer is a smaller seller carry and a
    // fatter margin, so the gated price must actually move with the toggle.
    const result = underwriteBusinessListing({
      offer_end: "low",
      gross_revenue: 2000000,
      real_estate_value: 3000000,
      sde: 500000,
    });

    expect(result.cashFlow.price).toBe(4000000); // offerLow = 2*500,000 + 3,000,000
  });
});

describe("calculateBusinessCashFlow — blended rate", () => {
  test("weights each leg by its share of the stack, not by a simple average", () => {
    // WHY: the two legs are priced differently and are rarely the same size, so an
    // unweighted average would flatter a deal carried mostly by the 0% seller.
    //   advance 1,800,000 @ 10%  +  carry 2,700,000 @ 0%   over 4,500,000 financed
    //   = 180,000 / 4,500,000 = 4%
    const cf = calculateBusinessCashFlow({
      downPayment: 1800000,
      earnings: 500000,
      earningsSource: "sde",
      grossRevenue: 2000000,
      priceOffered: 4500000,
    });

    expect(cf.blendedRate).toBeCloseTo(0.04, 10);
  });

  test("collapses to the DSCR rate when the seller carries nothing", () => {
    // WHY: the advance is itself borrowed, so a deal the collateral covers end to end is
    // not an all-cash deal — it is 100% DSCR, and the blend must say 10%, not 0%.
    const cf = calculateBusinessCashFlow({
      downPayment: 500000,
      earnings: 500000,
      earningsSource: "ebitda",
      priceOffered: 500000,
    });

    expect(cf.sellerFinanced).toBe(0);
    expect(cf.blendedRate).toBeCloseTo(0.1, 10);
  });
});

describe("underwriteBusinessListing — down payment override", () => {
  // Shared fixture: RE 3,000,000, SDE 500,000, revenue 2,000,000, no price offered.
  //   collateral down = 0.50 * 3,000,000 = 1,500,000
  //   offerHigh       = 3 * 500,000 + 3,000,000 = 4,500,000  (the gate price)
  const fixture = {
    gross_revenue: 2000000,
    real_estate_value: 3000000,
    sde: 500000,
  };

  test("collateral answers when no override is set", () => {
    const result = underwriteBusinessListing(fixture);

    expect(result.downPayment).toBe(1500000);
    expect(result.downPaymentSource).toBe("collateral");
    expect(result.downPaymentPercent).toBeCloseTo(1500000 / 4500000, 10);
  });

  test("an override replaces the collateral stack and resizes the DSCR loan with it", () => {
    // WHY: the down payment IS the DSCR principal. An override that moved the down payment
    // but left the loan at the collateral figure would quote a deal nobody can finance.
    //   down = 0.40 * 4,500,000 = 1,800,000, so the loan is 1,800,000, not 1,500,000
    //   dscr annual = 12 * PMT(1,800,000, 10%, 25) = 196,279.36…
    const result = underwriteBusinessListing({ ...fixture, down_payment_percent: 0.4 });

    expect(result.downPayment).toBe(1800000);
    expect(result.downPaymentSource).toBe("override");
    expect(result.cashFlow.dscrPaymentAnnual).toBeCloseTo(calculatePMT(1800000, 0.1, 25) * 12, 6);
    expect(result.sellerCarry).toBe(2700000); // 4,500,000 − 1,800,000
  });

  test("keeps reporting what the collateral would have advanced", () => {
    // WHY: the legs are the check on the override. Losing them would hide that the assets
    // only support 1,500,000 of the 1,800,000 being put down.
    const result = underwriteBusinessListing({ ...fixture, down_payment_percent: 0.4 });

    expect(result.collateralDownPayment).toBe(1500000);
    expect(result.legs.realEstate).toBe(1500000);
  });

  test("takes its percentage of the price offered once there is one", () => {
    // WHY: the LOI price is the deal being made; a down payment struck against the ceiling
    // instead would not match the carry the LOI quotes.
    //   0.25 * 4,000,000 = 1,000,000 down, so the carry at the offered price is 3,000,000
    const result = underwriteBusinessListing({
      ...fixture,
      down_payment_percent: 0.25,
      price_offered: 4000000,
    });

    expect(result.downPayment).toBe(1000000);
    expect(result.terms.sellerFinanced).toBe(3000000);
  });

  test("a cleared or zeroed override hands the deal back to the collateral", () => {
    // WHY: emptying the field must restore the collateral answer, never zero the down
    // payment — a $0 down payment quotes the whole price as seller carry.
    expect(underwriteBusinessListing({ ...fixture, down_payment_percent: null }).downPayment).toBe(1500000);
    expect(underwriteBusinessListing({ ...fixture, down_payment_percent: 0 }).downPayment).toBe(1500000);
    expect(underwriteBusinessListing({ ...fixture, down_payment_percent: "" }).downPayment).toBe(1500000);
  });
});

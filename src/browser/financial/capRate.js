// Pure finance helpers — no DOM, no state, Node-safe. These are the cap-rate / NOI business
// rules the engine used to bury inside DOM-coupled closures. Isolated here so the subtle
// parts (the no-cap default fix, the "*"-marker provenance, active cap = NOI/price, the
// manual-override NOI) are unit-tested directly rather than only through a full jsdom render.

// Read a number out of a price/currency string ("$1,299,000" -> 1299000). Returns null when
// there is no numeric run.
export function parsePriceNumber(priceText) {
  const m = (priceText || "").match(/[\d,]+/);
  return m ? parseFloat(m[0].replace(/,/g, "")) : null;
}

// Decide cap-rate provenance from the scraped string, using the "*" marker convention:
//   "6.5%"      -> real reported cap (estimated:false)
//   "6%*"       -> page estimate, whole-number percent (estimated:true)
//   "Not found" -> no cap; the engine applies the default estimate (isDefault:true)
// defaultPct is DEFAULT_CAP_RATE * 100 = 5 (whole-number percent) — the fix for the latent
// bug where the decimal 0.05 was stored then divided by 100, computing NOI at 0.05%.
// Returns { isDefault, estimated, num, displayCap }.
export function resolveCapRateProvenance(capRateString, defaultPct) {
  if (capRateString === "Not found") {
    return { isDefault: true, estimated: true, num: defaultPct, displayCap: `${defaultPct}%*` };
  }
  const estimated = capRateString.includes("*");
  const match = capRateString.match(/[\d.]+/);
  const num = match ? parseFloat(match[0]) : null;
  return { isDefault: false, estimated, num, displayCap: capRateString };
}

// The active cap shown on the panel = NOI / current price. Returns "X.X%" when both are real
// and price > 0, else "N/A" (so a missing NOI/price never paints a bogus 0% or Infinity).
export function computeActiveCapDisplay(baseNOI, price) {
  if (Number.isFinite(baseNOI) && Number.isFinite(price) && price > 0) {
    return `${((baseNOI / price) * 100).toFixed(1)}%`;
  }
  return "N/A";
}

// The reported cap shown on hover — only a real (non-estimated) scraped value qualifies.
// Returns the number (e.g. 4.86) or null when the cap was estimated or absent.
export function parseReportedCap(originalCapRate, isUsingEstimatedCapRate) {
  if (isUsingEstimatedCapRate || !originalCapRate) return null;
  const m = originalCapRate.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

// Manual cap override: clicking the cap sets NOI = original price x cap for EVERY type. Returns
// the overridden NOI, or null when the price is unreadable / non-positive (caller leaves NOI as-is).
export function computeManualOverrideNOI(opText, currentEstimatedCapRate) {
  const op = parsePriceNumber(opText);
  if (!Number.isFinite(op) || op <= 0) return null;
  return op * (currentEstimatedCapRate / 100);
}

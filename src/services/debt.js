// Agnostic debt fetcher: receives an address, returns the property's outstanding debt.
//
// PURE IO — no per-repo state, no panel DOM, no caching. Works in both Node (the dashboard
// add-by-address flow) and the browser (the analyzer engine). The caller owns caching, the
// loading indicator, the equity computation, and the "estimated = 100%" fallback.
//
// Returns { address, estimatedMortgageBalance, currentMortgages, source }:
//   - estimatedMortgageBalance: number (debt owing) or null when the service has no figure
//   - currentMortgages: array of lien objects (amount, position, lenderName, loanType, ...)
//   - source: "api" when a numeric balance came back, "estimated" when it did not
// A 404 means the service definitively has no debt record for the address — returned as the
// estimated case (not thrown). Throws on a genuine network / non-OK HTTP error (e.g. 500) so
// the caller can log it and still fall back to the estimated case.
export async function fetchDebt(address, { baseUrl = "https://api.archerjessop.com" } = {}) {
  const response = await fetch(
    `${baseUrl}/debt?address=${encodeURIComponent(address)}`,
    { method: "GET", headers: { "Content-Type": "application/json" } }
  );

  if (response.status === 404) {
    return {
      address,
      currentMortgages: [],
      estimatedMortgageBalance: null,
      source: "estimated",
    };
  }

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  const balance = typeof data.estimatedMortgageBalance === "number" && Number.isFinite(data.estimatedMortgageBalance)
    ? data.estimatedMortgageBalance
    : null;

  return {
    address: typeof data.address === "string" ? data.address : address,
    currentMortgages: Array.isArray(data.currentMortgages) ? data.currentMortgages : [],
    estimatedMortgageBalance: balance,
    source: balance === null ? "estimated" : "api",
  };
}

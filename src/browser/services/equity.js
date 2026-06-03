// Agnostic equity fetcher: receives an address, returns equity data. Nothing more.
//
// Returns the equity as a normalized "<n>%" string, or null when the endpoint returns no
// usable equity. Throws on a network / non-OK HTTP error so the caller can treat it as the
// fallback case. PURE IO — no per-repo state, no panel DOM, no navigation guard. The caller
// (the analyzer engine) owns caching, the loading indicator, the stale-drop, the provenance
// flag, and the fallback value. The endpoint is identical for every analyzer, so there is
// nothing per-site here.
export async function fetchEquity(address) {
  const response = await fetch(
    `https://api.archerjessop.com/equity?address=${encodeURIComponent(address)}`,
    { method: "GET", headers: { "Content-Type": "application/json" } }
  );

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if (data && data.equity !== undefined && data.equity !== null) {
    let equityValue = data.equity;
    if (typeof equityValue === "number") {
      equityValue = `${equityValue}%`;
    } else if (typeof equityValue === "string") {
      if (!equityValue.includes("%") && !isNaN(parseFloat(equityValue))) {
        equityValue = `${equityValue}%`;
      }
    }
    return equityValue;
  }

  return null;
}

// Agnostic STR-revenue fetcher (the network seam): receives an address, returns the raw
// { value, type } payload from api.archerjessop.com/str-revenue, or null when unavailable.
//
// PURE IO — no per-repo state, no panel DOM, no navigation guard. The caller (the analyzer
// engine) owns caching, the loading indicator, the stale-drop, validating the payload, and
// the 5.5%-of-price estimate fallback. The backend is not built yet, so this returns null
// today and callers use the estimate; when it ships, uncomment the fetch — no other change
// is required (the endpoint applies NO margin; gross->NOI is the financial model's job).
export async function fetchStrRevenue(_address) {
  // const response = await fetch(
  //   `https://api.archerjessop.com/str-revenue?address=${encodeURIComponent(_address)}`,
  //   { method: "GET", headers: { "Content-Type": "application/json" } }
  // );
  // if (!response.ok) {
  //   throw new Error(`HTTP error! status: ${response.status}`);
  // }
  // return await response.json(); // { value: number, type: "noi" | "gross" }
  return null;
}

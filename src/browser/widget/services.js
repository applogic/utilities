// Services unit: the orchestration around the agnostic fetchers (caching, the panel loading
// indicator, the 2s minimum loading, the stale-drop via the pipeline guard, the provenance +
// fallbacks). The fetchers themselves stay pure IO in ../services. Extracted verbatim (T12).

import { fetchEquity } from "../services/equity.js";
import { fetchStrRevenue } from "../services/str-revenue.js";
import { lookupLOI } from "../../services/loi-lookup.js";
import { LOI_SENT_STATUS, MATCH_TYPES } from "../../config/loi-lookup.js";

export function createServices({ ctx }) {
  const { state, updateState } = ctx;

  // Caching + match-type mapping for the LOI lead status. lookupLOI is the agnostic call; the
  // engine owns the cache (ctx.state.cachedLoiData) and the mapping.
  async function loadLeadStatus(address) {
    if (!state.cachedLoiData) updateState({ cachedLoiData: {} });
    if (state.cachedLoiData.leadStatus) {
      return {
        leadStatus: state.cachedLoiData.leadStatus,
        contactName: state.cachedLoiData.contactName,
        opportunityAddress: state.cachedLoiData.opportunityAddress,
      };
    }
    try {
      const result = await lookupLOI(address);
      let leadStatus = "New Lead";
      const data = result?.data || {};
      switch (result?.matchType) {
        case MATCH_TYPES.NO_RESPONSE:
          data.contactName = "LOI lookup failed";
          data.opportunityAddress = "to supply a response";
          break;
        case MATCH_TYPES.NO_MATCH:
          data.contactName = "LOI lookup replied with";
          data.opportunityAddress = "no match found";
          break;
        case MATCH_TYPES.EXACT:
        case MATCH_TYPES.FUZZY:
          leadStatus = LOI_SENT_STATUS;
          break;
        default:
          data.contactName = "LOI lookup failed";
          data.opportunityAddress = "unknown match type";
          break;
      }
      const loiData = {
        leadStatus,
        contactName: data.contactName || "No contact available",
        opportunityAddress: data.opportunityAddress || "(Unknown)",
      };
      updateState({ cachedLoiData: loiData });
      return loiData;
    } catch (error) {
      console.error("💥 Error fetching lead status:", error);
      return {
        leadStatus: "New Lead*",
        contactName: "No contact available",
        opportunityAddress: "Error fetching address",
      };
    }
  }

  // Equity orchestration: cache-first, panel loading indicator, 2s minimum loading, stale-drop
  // via the pipeline guard, provenance + fallback.
  async function loadEquity(address, guard) {
    if (state.cachedEquity) return state.cachedEquity;

    updateState({ equityLoadingStartTime: Date.now() });
    const equityElement = document.getElementById("prop-equity");
    if (equityElement) {
      equityElement.classList.add("loading");
      equityElement.textContent = "";
    }

    let value = null;
    try {
      value = await fetchEquity(address);
    } catch (error) {
      console.error("Error fetching equity:", error);
      value = null;
    }

    const elapsed = Date.now() - state.equityLoadingStartTime;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 2000 - elapsed)));

    if (guard.isStale()) return null;
    if (equityElement) equityElement.classList.remove("loading");

    if (value != null) {
      updateState({ equitySource: "scraped", cachedEquity: value });
      return value;
    }
    updateState({ cachedEquity: "100%*" });
    return state.cachedEquity;
  }

  // STR-revenue orchestration: cache-first, NOI loading indicator, stale-drop, payload
  // validation. Returns null until the backend ships.
  async function loadStrValue(address, guard) {
    if (state.cachedStrValue) return state.cachedStrValue;

    const noiElement = document.getElementById("prop-noi");
    if (noiElement) noiElement.classList.add("loading");

    try {
      const data = await fetchStrRevenue(address);
      if (guard.isStale()) return null;
      if (data && Number.isFinite(data.value) && (data.type === "noi" || data.type === "gross")) {
        updateState({ cachedStrValue: data });
        return data;
      }
      return null;
    } catch (error) {
      console.error("Error fetching STR revenue:", error);
      return null;
    } finally {
      if (!guard.isStale() && noiElement) noiElement.classList.remove("loading");
    }
  }

  async function ensureEquityLoaded(address) {
    if (state.cachedEquity) return state.cachedEquity;
    try {
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve("100%"), 3000));
      const equityPromise = fetchEquity(address).then((v) => v ?? "100%").catch(() => "100%");
      return await Promise.race([equityPromise, timeoutPromise]);
    } catch (error) {
      console.error("❌ Error ensuring equity loaded:", error);
      return "100%";
    }
  }

  return { ensureEquityLoaded, loadEquity, loadLeadStatus, loadStrValue };
}

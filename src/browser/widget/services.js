// Services unit: the orchestration around the agnostic fetchers (caching, the panel loading
// indicator, the 2s minimum loading, the stale-drop via the pipeline guard, the provenance +
// fallbacks). The fetchers themselves stay pure IO in ../services. Extracted verbatim (T12).

import { fetchDebt } from "../../services/debt.js";
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
        contactName: state.cachedLoiData.contactName,
        createdAt: state.cachedLoiData.createdAt,
        leadStatus: state.cachedLoiData.leadStatus,
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
        contactName: data.contactName || "No contact available",
        createdAt: data.createdAt || null,
        leadStatus,
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

  // Apply a fetchDebt result (or a null/failed fetch) to ctx. A numeric balance is provenance
  // "scraped"; no number means the service had no figure, so equity falls back to 100%
  // ("estimated"). debtLoaded guards against re-fetching when the balance is legitimately null.
  function applyDebtResult(result, address) {
    if (result && result.estimatedMortgageBalance !== null) {
      updateState({
        cachedDebtAddress: result.address,
        cachedDebtBalance: result.estimatedMortgageBalance,
        cachedMortgages: Array.isArray(result.currentMortgages) ? result.currentMortgages : [],
        debtLoaded: true,
        equitySource: "scraped",
      });
    } else {
      updateState({
        cachedDebtAddress: result?.address ?? address,
        cachedDebtBalance: null,
        cachedMortgages: Array.isArray(result?.currentMortgages) ? result.currentMortgages : [],
        debtLoaded: true,
        equitySource: "estimated",
      });
    }
  }

  // Debt orchestration: cache-first, panel loading indicator, 2s minimum loading, stale-drop
  // via the pipeline guard. Stores the debt; the panel DERIVES equity from it vs the current
  // price (render.updateEquityDisplay), so equity tracks user price edits.
  async function loadDebt(address, guard) {
    if (state.debtLoaded) return;

    updateState({ equityLoadingStartTime: Date.now() });
    const equityElement = document.getElementById("prop-equity");
    if (equityElement) {
      equityElement.classList.add("loading");
      equityElement.textContent = "";
    }

    let result = null;
    try {
      result = await fetchDebt(address);
    } catch (error) {
      console.error("Error fetching debt:", error);
      result = null;
    }

    const elapsed = Date.now() - state.equityLoadingStartTime;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 2000 - elapsed)));

    if (guard.isStale()) return;
    if (equityElement) equityElement.classList.remove("loading");

    applyDebtResult(result, address);
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

  // Export-time guarantee: ensure debt is loaded (cache-first, 3s timeout => estimated), then
  // return the debt snapshot so the export carries the balance + mortgages and a price-derived
  // equity. Never throws; a failure becomes the "estimated" case.
  async function ensureDebtLoaded(address) {
    if (!state.debtLoaded) {
      try {
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 3000));
        const debtPromise = fetchDebt(address).catch(() => null);
        const result = await Promise.race([debtPromise, timeoutPromise]);
        applyDebtResult(result, address);
      } catch (error) {
        console.error("❌ Error ensuring debt loaded:", error);
        applyDebtResult(null, address);
      }
    }
    return {
      address: state.cachedDebtAddress,
      balance: state.cachedDebtBalance,
      mortgages: state.cachedMortgages,
      source: state.equitySource,
    };
  }

  return { ensureDebtLoaded, loadDebt, loadLeadStatus, loadStrValue };
}

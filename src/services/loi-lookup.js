/**
 * LOI Lookup Service
 * Checks if a property address has an existing LOI in the CRM system
 */

import { LOI_LOOKUP_CONFIG, MATCH_TYPES } from "../config/loi-lookup.js";

/**
 * Normalize an address string for comparison
 * @param {string} address - Address string to normalize
 * @returns {string} Normalized address
 */
function normalizeAddress(address) {
  if (!address) return "";
  
  return address
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract components from an address string
 * @param {string} address - Address to parse
 * @returns {Object} Address components
 */
function parseAddress(address) {
  const normalized = normalizeAddress(address);
  
  const zipMatch = normalized.match(/\b\d{5}\b/);
  const zip = zipMatch ? zipMatch[0] : null;
  
  const stateMatch = normalized.match(/\b([a-z]{2})\s+\d{5}\b/);
  const state = stateMatch ? stateMatch[1] : null;
  
  const cityMatch = normalized.match(/([a-z\s]+)\s+[a-z]{2}\s+\d{5}/);
  const city = cityMatch ? cityMatch[1].trim() : null;
  
  const streetMatch = normalized.match(/^(.+?)\s+[a-z\s]+\s+[a-z]{2}\s+\d{5}/);
  const street = streetMatch ? streetMatch[1].trim() : normalized;
  
  return {
    city,
    full: normalized,
    state,
    street,
    zip,
  };
}

/**
 * Calculate similarity score between two strings (0-1)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = normalizeAddress(str1);
  const s2 = normalizeAddress(str2);
  
  if (s1 === s2) return 1.0;
  
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  const words1 = s1.split(" ").filter(w => w.length > 2);
  const words2 = s2.split(" ").filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const commonWords = words1.filter(w => words2.includes(w));
  const overlapRatio = (commonWords.length * 2) / (words1.length + words2.length);
  
  return overlapRatio;
}

/**
 * Match two addresses using fuzzy matching
 * @param {string} searchQuery - The address being searched
 * @param {string} opportunityAddress - Address from the CRM opportunity
 * @returns {Object} Match result with type and score
 */
function matchAddresses(searchQuery, opportunityAddress) {
  const search = parseAddress(searchQuery);
  const opportunity = parseAddress(opportunityAddress);
  
  if (search.city && opportunity.city) {
    if (search.city !== opportunity.city) {
      return { matchType: MATCH_TYPES.NO_MATCH, score: 0 };
    }
  }
  
  if (search.zip && opportunity.zip) {
    if (search.zip !== opportunity.zip) {
      return { matchType: MATCH_TYPES.NO_MATCH, score: 0 };
    }
  }
  
  if (search.state && opportunity.state) {
    if (search.state !== opportunity.state) {
      return { matchType: MATCH_TYPES.NO_MATCH, score: 0 };
    }
  }
  
  const similarity = calculateSimilarity(searchQuery, opportunityAddress);
  
  if (similarity >= 0.95) {
    return { matchType: MATCH_TYPES.EXACT, score: similarity };
  }
  
  if (similarity >= 0.6) {
    return { matchType: MATCH_TYPES.FUZZY, score: similarity };
  }
  
  return { matchType: MATCH_TYPES.NO_MATCH, score: similarity };
}

/**
 * Extract the property address from a GHL opportunity record
 * Prefers the clean structured field, falls back to the "address + name" displayName
 * @param {Object} opportunity - GHL opportunity record
 * @returns {string} Property address
 */
function extractOpportunityAddress(opportunity) {
  if (opportunity.fields?.full_property_address) {
    return opportunity.fields.full_property_address;
  }
  if (opportunity.displayName) {
    return opportunity.displayName.split("+")[0].trim();
  }
  return "";
}

/**
 * Lookup LOI from API
 * Queries the GHL lookup endpoint, which returns an array of matching opportunities
 * @param {string} searchQuery - Property address to search
 * @returns {Promise<Object>} Lookup result
 */
async function lookupFromAPI(searchQuery) {
  try {
    const url = new URL(LOI_LOOKUP_CONFIG.LOOKUP_PATH, LOI_LOOKUP_CONFIG.API_BASE_URL);
    url.searchParams.set("q", searchQuery);

    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
      },
      method: "GET",
    });

    if (!response.ok) {
      return {
        data: null,
        error: `HTTP ${response.status}`,
        matchType: MATCH_TYPES.NO_RESPONSE,
        searchQuery,
      };
    }

    const results = await response.json();

    if (!Array.isArray(results) || results.length === 0) {
      return {
        data: null,
        matchType: MATCH_TYPES.NO_MATCH,
        searchQuery,
      };
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const opportunity of results) {
      const opportunityAddress = extractOpportunityAddress(opportunity);
      if (!opportunityAddress) continue;

      const matchResult = matchAddresses(searchQuery, opportunityAddress);

      if (matchResult.matchType !== MATCH_TYPES.NO_MATCH && matchResult.score > bestScore) {
        bestScore = matchResult.score;
        bestMatch = {
          data: {
            contactEmail: opportunity.contactEmail || null,
            contactName: opportunity.studentName || null,
            createdAt: opportunity.createdAt || null,
            foundIn: "api",
            loiTrackingNumber: opportunity.fields?.loi_tracking_number || null,
            opportunityAddress,
            opportunityName: opportunity.displayName || opportunityAddress,
            statusOrStage: opportunity.stage || null,
            updatedAt: opportunity.updatedAt || null,
          },
          matchType: matchResult.matchType,
          score: matchResult.score,
          searchQuery,
        };
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    return {
      data: null,
      matchType: MATCH_TYPES.NO_MATCH,
      searchQuery,
    };

  } catch (error) {
    return {
      data: null,
      error: error.message,
      matchType: MATCH_TYPES.NO_RESPONSE,
      searchQuery,
    };
  }
}

/**
 * Lookup LOI status for a property address
 * @param {string} searchQuery - Property address to search
 * @returns {Promise<Object>} Lookup result
 */
export async function lookupLOI(searchQuery) {
  if (!searchQuery) {
    return {
      data: null,
      matchType: MATCH_TYPES.NO_RESPONSE,
      searchQuery,
    };
  }

  return await lookupFromAPI(searchQuery);
}
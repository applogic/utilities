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
 * Parse CSV text into array of objects
 * @param {string} csvText - CSV content
 * @returns {Array<Object>} Parsed rows
 */
function parseCSV(csvText) {
  const lines = csvText.split("\n").filter(line => line.trim());
  if (lines.length === 0) return [];
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cols = line.split(",").map(col => col.trim().replace(/^"|"$/g, ""));
    
    if (cols.length >= 4 && cols[1]) {
      rows.push({
        address: cols[1],
        contactName: cols[3] || null,
        date: cols[2] || null,
      });
    }
  }
  
  return rows;
}

/**
 * Lookup LOI from Google Spreadsheet
 * DELETE THIS FUNCTION when phasing out spreadsheet
 * @param {string} searchQuery - Property address to search
 * @returns {Promise<Object>} Lookup result
 */
async function lookupFromSpreadsheet(searchQuery) {
  try {
    const response = await fetch(LOI_LOOKUP_CONFIG.SPREADSHEET_URL, {
      headers: {
        "Accept": "text/csv",
      },
      method: "GET",
    });
    
    if (!response.ok) {
      return {
        data: null,
        matchType: MATCH_TYPES.NO_RESPONSE,
        searchQuery,
      };
    }
    
    const csvText = await response.text();
    const rows = parseCSV(csvText);
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const row of rows) {
      const matchResult = matchAddresses(searchQuery, row.address);
      
      if (matchResult.matchType !== MATCH_TYPES.NO_MATCH && matchResult.score > bestScore) {
        bestScore = matchResult.score;
        bestMatch = {
          data: {
            contactName: row.contactName,
            createdAt: row.date,
            opportunityAddress: row.address,
            opportunityName: row.address,
            statusOrStage: LOI_LOOKUP_CONFIG.LOI_SENT_STATUS,
            updatedAt: row.date,
            foundIn: "spreadsheet",
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
 * Lookup LOI from API
 * This function will remain after spreadsheet is phased out
 * @param {string} searchQuery - Property address to search
 * @returns {Promise<Object>} Lookup result
 */
async function lookupFromAPI(searchQuery) {
  try {
    const url = new URL(LOI_LOOKUP_CONFIG.API_BASE_URL);
    url.pathname = LOI_LOOKUP_CONFIG.WEBHOOK_PATH;
    url.searchParams.set("location_id", LOI_LOOKUP_CONFIG.LOCATION_ID);
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
    
    const data = await response.json();
    
    if (!data || !data.opportunityName) {
      return {
        data: null,
        matchType: MATCH_TYPES.NO_RESPONSE,
        searchQuery,
      };
    }
    
    const opportunityAddress = data.opportunityName.split("+")[0].trim();
    
    const matchResult = matchAddresses(searchQuery, opportunityAddress);
    
    return {
      data: {
        contactName: data.contactName,
        createdAt: data.createdAt,
        opportunityAddress,
        opportunityName: data.opportunityName,
        statusOrStage: data.statusOrStage,
        updatedAt: data.updatedAt,
        foundIn: "api",
      },
      matchType: matchResult.matchType,
      score: matchResult.score,
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
  
  const spreadsheetResult = await lookupFromSpreadsheet(searchQuery);
  if (spreadsheetResult.matchType !== MATCH_TYPES.NO_MATCH && spreadsheetResult.matchType !== MATCH_TYPES.NO_RESPONSE) {
    return spreadsheetResult;
  }
  
  return await lookupFromAPI(searchQuery);
}
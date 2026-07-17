/**
 * LOI Lookup service configuration
 */

export const LOI_LOOKUP_CONFIG = {
  API_BASE_URL: "https://instanthotelshq.com",
  LOOKUP_PATH: "/api/ghl/lookup",

  MATCH_TYPES: {
    EXACT: "exact",
    FUZZY: "fuzzy",
    NO_MATCH: "service-replied-no-match",
    NO_RESPONSE: "no-response-from-service",
  },

  LOI_SENT_STATUS: "LOI Sent",
};

export const { MATCH_TYPES, LOI_SENT_STATUS } = LOI_LOOKUP_CONFIG;

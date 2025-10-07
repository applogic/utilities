/**
 * LOI Lookup service configuration
 */

export const LOI_LOOKUP_CONFIG = {
  API_BASE_URL: "https://n8n-whai-u45960.vm.elestio.app",
  WEBHOOK_PATH: "/webhook/e15233bc-0623-4365-9e65-334bc5fc72e2",
  LOCATION_ID: "KjMMUEqwj4uFZvx4hWzq",
  
  // Match type constants
  MATCH_TYPES: {
    NO_RESPONSE: "no-response",
    NO_MATCH: "no-match",
    FUZZY: "fuzzy",
    EXACT: "exact",
  },
  
  // Status constants
  LOI_SENT_STATUS: "LOI Sent",
};

export const { MATCH_TYPES, LOI_SENT_STATUS } = LOI_LOOKUP_CONFIG;
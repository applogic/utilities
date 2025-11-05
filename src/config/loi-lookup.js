/**
 * LOI Lookup service configuration
 */

export const LOI_LOOKUP_CONFIG = {
  API_BASE_URL: "https://n8n-whai-u45960.vm.elestio.app",
  LOCATION_ID: "KjMMUEqwj4uFZvx4hWzq",
  SPREADSHEET_URL: "https://docs.google.com/spreadsheets/d/1bSAVIhJbm0HQShCN-TI0Fev29DfKhFlxYCDHG4Dy8xs/export?format=csv&gid=1131505700",
  WEBHOOK_PATH: "/webhook/e15233bc-0623-4365-9e65-334bc5fc72e2",
  
  MATCH_TYPES: {
    EXACT: "exact",
    FUZZY: "fuzzy",
    NO_MATCH: "service-replied-no-match",
    NO_RESPONSE: "no-response-from-service",
  },
  
  LOI_SENT_STATUS: "LOI Sent",
};

export const { MATCH_TYPES, LOI_SENT_STATUS } = LOI_LOOKUP_CONFIG;
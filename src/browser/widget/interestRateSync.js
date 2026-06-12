// Auto-selects the DSCR Commercial (10%) interest-rate tier for multifamily listings of 5+ units,
// reverting to DSCR Residential (8%) below that. Delegates the threshold to determineInterestRateType
// so the rule lives in one place. MFR-only by design: other property types keep their own tier and
// are never force-switched here.

import { determineInterestRateType } from "../../config/financial.js";

export function syncInterestRateForUnits(state, updateState, unitCount = state.numberOfUnits) {
  const isMfr = state.currentPropertyType === "mfr" || state.currentPropertyType === "multifamily";
  if (!isMfr) return false;

  const irDropdown = document.getElementById("ln-interest-rate-type");
  if (!irDropdown) return false;

  const target = determineInterestRateType(state.currentPropertyType, unitCount);
  if (irDropdown.value === target) return false;

  irDropdown.value = target;
  updateState({ currentInterestRateType: target });
  return target;
}

/**
 * src/financial/formatters.js
 * 
 * OUTPUT/DISPLAY FORMATTERS - For read-only display of financial data
 * 
 * Purpose: Format calculated financial values for compact, readable display
 * Use cases:
 *   - Browser extension metrics and tooltips
 *   - Dashboard display values
 *   - Comparison pages
 *   - Any read-only financial data presentation
 * 
 * Characteristics:
 *   - Uses K/M notation for compact display (e.g., "$2.5M", "$125K")
 *   - Optimized for space-constrained UI elements
 *   - Not for user input fields (see formatting/financial-formatting.js)
 * 
 * Related files:
 *   - formatting/financial-formatting.js: Input formatters for editable fields
 */

/**
 * Format currency with K/M notation for compact display
 * @param {number} amount - The amount to format
 * @param {boolean} isMonthly - If true, shows full amount with commas (for monthly payments)
 * @returns {string} Formatted currency string (e.g., "$2.5M", "$125K", "$1,234")
 */
export function formatCurrency(amount, isMonthly = false) {
  if (isNaN(amount) || !isFinite(amount)) return "N/A";
  
  const absAmount = Math.abs(amount);
  const isNegative = amount < 0;
  const prefix = isNegative ? "-$" : "$";
  
  if (isMonthly) {
    return prefix + absAmount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  } else {
    if (absAmount >= 1000000) {
      const millions = absAmount / 1000000;
      const formatted = millions.toFixed(3).replace(/\.?0+$/, "");
      return prefix + formatted + "M";
    } else if (absAmount >= 1000) {
      const thousands = absAmount / 1000;
      const formatted = thousands.toFixed(3).replace(/\.?0+$/, "");
      return prefix + formatted + "K";
    } else {
      return prefix + absAmount.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
  }
}

/**
 * Format price value with K/M notation for compact display
 * Similar to formatCurrency but with fixed decimal places
 * @param {number} amount - The amount to format
 * @returns {string} Formatted price string (e.g., "$2.5M", "$125K")
 */
export function formatPriceValue(amount) {
  if (isNaN(amount) || !isFinite(amount)) return "N/A";
  
  const absAmount = Math.abs(amount);
  const isNegative = amount < 0;
  const prefix = isNegative ? "-$" : "$";
  
  if (absAmount >= 1000000) {
    return prefix + (absAmount / 1000000).toFixed(1) + "M";
  } else if (absAmount >= 1000) {
    return prefix + (absAmount / 1000).toFixed(0) + "K";
  } else {
    return prefix + absAmount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
}

/**
 * Format percentage for display
 * @param {number} percentage - The percentage value to format (e.g., 7.5 for 7.5%)
 * @returns {string} Formatted percentage string (e.g., "7.5%")
 * 
 */
export function formatPercentage(percentage) {
  if (isNaN(percentage) || !isFinite(percentage)) return "N/A";

  let str = percentage.toString();

  if (str.includes("e")) {
    str = Number(str).toFixed(2 + 10);
  }

  const [intPart, decPart = ""] = str.split(".");

  if (!decPart) {
    // No decimal part - just return the integer
    return intPart + "%";
  }

  // Only remove trailing zeros from decimal part
  const truncatedDec = decPart.slice(0, 2);
  const cleanedDec = truncatedDec.replace(/0+$/, "");
  
  if (cleanedDec) {
    return intPart + "." + cleanedDec + "%";
  } else {
    return intPart + "%";
  }
}

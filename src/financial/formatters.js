export function formatCurrency(amount, isMonthly = false) {
  if (isNaN(amount) || !isFinite(amount)) return "N/A";
  
  const absAmount = Math.abs(amount);
  const isNegative = amount < 0;
  const prefix = isNegative ? "-$" : "$";
  
  if (isMonthly) {
    // For monthly payments, show full amount with commas
    return prefix + absAmount.toLocaleString("en-US", { maximumFractionDigits: 0 });
  } else {
    // For larger amounts, use K/M notation with 2-3 decimal places as needed
    if (absAmount >= 1000000) {
      const millions = absAmount / 1000000;
      // Use 2-3 decimal places but remove unnecessary trailing zeros
      const formatted = millions.toFixed(3).replace(/\.?0+$/, "");
      return prefix + formatted + "M";
    } else if (absAmount >= 1000) {
      const thousands = absAmount / 1000;
      // Use 2-3 decimal places but remove unnecessary trailing zeros  
      const formatted = thousands.toFixed(3).replace(/\.?0+$/, "");
      return prefix + formatted + "K";
    } else {
      return prefix + absAmount.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
  }
}

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

export function formatPercentage(percentage) {
  if (isNaN(percentage) || !isFinite(percentage)) return "N/A";
  return percentage.toFixed(1) + "%";
}


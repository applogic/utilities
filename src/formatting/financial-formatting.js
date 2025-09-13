// Enhanced formatting for input fields
export const formatInputDisplay = (value, type) => {
  const num = parseFloat(value) || 0;
  const hasDecimals = num % 1 !== 0;
  
  switch (type) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2
      }).format(num);
    
    case "percent":
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: hasDecimals && Math.abs(num) >= 0.1 ? 1 : hasDecimals ? 3 : 0,
        maximumFractionDigits: Math.abs(num) < 1 ? 3 : 2
      }).format(num) + "%";
    
    case "years":
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: hasDecimals ? 1 : 0,
        maximumFractionDigits: 1
      }).format(num) + " yrs.";
    
    case "months":
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(num) + " mos.";
    
    case "number":
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2
      }).format(num);
    
    default:
      return value;
  }
};

export const parseNumericInput = (value) => {
  // Handle null, undefined, or non-string inputs
  if (value === null || value === undefined) {
    return 0;
  }
  
  // Remove all non-numeric characters except decimal point and negative sign
  const cleaned = value.toString().replace(/[^0-9.-]/g, "");
  return parseFloat(cleaned) || 0;
};

// Add these functions to the existing file:

export const filterNumericInput = (value, allowNegative = true) => {
  if (!value) return "";
  
  let filtered = value.toString();
  
  // Remove symbols and text, keep only numbers, decimal, and negative
  // This regex keeps numeric chars, decimal point, and negative sign
  filtered = filtered.replace(/[^0-9.-]/g, "");
  
  // Handle negative sign - only allow at the beginning
  if (allowNegative) {
    const negativeCount = (filtered.match(/-/g) || []).length;
    if (negativeCount > 1) {
      // Remove extra negative signs, keep only the first one if input started with -
      const startsWithNegative = value.toString().trim().startsWith("-");
      filtered = filtered.replace(/-/g, "");
      if (startsWithNegative) {
        filtered = "-" + filtered;
      }
    } else if (filtered.includes("-") && !filtered.startsWith("-")) {
      // Move negative to the front if it's not already there
      filtered = "-" + filtered.replace(/-/g, "");
    }
  } else {
    filtered = filtered.replace(/-/g, "");
  }
  
  // Handle decimal - only allow one decimal point
  const decimalCount = (filtered.match(/\./g) || []).length;
  if (decimalCount > 1) {
    const parts = filtered.split(".");
    filtered = parts[0] + "." + parts.slice(1).join("");
  }
  
  return filtered;
};

export const formatLiveNumber = (value, type = "default") => {
  if (!value && value !== 0) return "";
  
  const originalStr = value.toString();
  const num = parseFloat(originalStr);
  if (isNaN(num)) return "";
  
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const hasDecimal = originalStr.includes(".");
  
  let result;
  
  if (!hasDecimal) {
    // No decimal point in original input - format as integer
    const intStr = Math.floor(absNum).toString();
    result = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  } else {
    // Decimal point exists in original input
    if (type === "months") {
      // Months: always round to whole number (no decimals)
      const rounded = Math.round(absNum);
      result = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    } else if (type === "percent" || type === "years") {
      // Percentages and Years: remove trailing zeros after decimal
      let formatted = absNum.toFixed(2); // First get 2 decimal places
      formatted = formatted.replace(/\.?0+$/, ''); // Remove trailing zeros
      
      // Add commas to integer part
      const [intPart, decPart] = formatted.split(".");
      const commaInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      result = decPart ? commaInt + "." + decPart : commaInt;
    } else {
      // Currency and default: always show exactly 2 decimal places
      const twoDecimal = absNum.toFixed(2);
      const [intPart, decPart] = twoDecimal.split(".");
      const commaInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      result = commaInt + "." + decPart;
    }
  }
  
  return isNegative ? "-" + result : result;
};

export const formatLiveInput = (value, type) => {
  const filtered = filterNumericInput(value, true);
  const formatted = formatLiveNumber(filtered, type); // Make sure type is passed here
  
  if (!formatted) return "";
  
  switch (type) {
    case "currency":
      return "$ " + formatted;
    case "percent":
      return formatted + " %";
    case "years":
      return formatted + " yrs.";
    case "months":
      return formatted + " mos.";
    case "number":
      return formatted;
    default:
      return formatted;
  }
};

export const calculateCursorPosition = (oldValue, newValue, oldCursor) => {
  if (oldCursor <= 0) return 0;
  if (oldCursor >= oldValue.length) {
    // Cursor was at end - find the end of numeric part in new value
    const match = newValue.match(/^[0-9,.-]+/);
    return match ? match[0].length : 0;
  }
  
  // Count logical characters before cursor position in old value
  let logicalCharsBefore = 0;
  for (let i = 0; i < oldCursor; i++) {
    if (oldValue[i] !== ',') {
      logicalCharsBefore++;
    }
  }
  
  // Find position after the same number of logical characters in new value
  let charsProcessed = 0;
  
  for (let i = 0; i < newValue.length; i++) {
    // Stop if we hit a letter (start of symbol)
    if (/[a-zA-Z]/.test(newValue[i])) {
      break;
    }
    
    // If we've found all the logical characters we need
    if (charsProcessed === logicalCharsBefore) {
      return newValue[i] === ',' ? i + 1 : i;
    }
    
    // Count non-comma, non-space characters
    if (newValue[i] !== ',' && newValue[i] !== ' ') {
      charsProcessed++;
    }
  }
  
  // Find the end of the numeric part (before any letters)
  const match = newValue.match(/^[0-9,.\s-]+/);
  return match ? Math.min(match[0].length, newValue.length) : 0;
};

export const extractNumericValue = (formattedValue, type) => {
  if (!formattedValue) return 0;
  
  let cleaned = formattedValue.toString();
  
  switch (type) {
    case "currency":
      cleaned = cleaned.replace(/^\$\s*/, "").trim();
      break;
    case "percent":
      cleaned = cleaned.replace(/\s*%$/, "").trim();
      break;
    case "years":
      cleaned = cleaned.replace(/\s*yrs\.$/, "").trim();
      break;
    case "months":
      cleaned = cleaned.replace(/\s*mos\.$/, "").trim();
      break;
  }
  
  cleaned = cleaned.replace(/,/g, "");
  return parseFloat(cleaned) || 0;
};
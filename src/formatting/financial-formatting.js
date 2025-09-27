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

export const formatLiveNumber = (value, type = "default", preserveTyping = false) => {
  if (!value && value !== 0) return "";
  
  const originalStr = value.toString();
  const num = parseFloat(originalStr);
  if (isNaN(num)) return "";
  
  const isNegative = num < 0;
  const absStr = isNegative ? originalStr.substring(1) : originalStr;
  const hasDecimal = absStr.includes(".");
  
  let result;
  
  if (!hasDecimal) {
    // No decimal point - format as integer
    const intStr = Math.floor(Math.abs(num)).toString();
    result = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  } else {
    // Has decimal point
    if (preserveTyping) {
      // LIVE TYPING: Preserve exactly what user typed, just add commas
      const [intPart, decPart] = absStr.split(".");
      const commaInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      result = commaInt + "." + decPart;
    } else {
      // FINAL FORMATTING: Apply type-specific decimal rules
      if (type === "months") {
        const rounded = Math.round(Math.abs(num));
        result = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      } else if (type === "percent" || type === "years") {
        let formatted = Math.abs(num).toFixed(2);
        formatted = formatted.replace(/\.?0+$/, '');
        const [intPart, decPart] = formatted.split(".");
        const commaInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        result = decPart ? commaInt + "." + decPart : commaInt;
      } else {
        // Currency: always 2 decimal places
        const twoDecimal = Math.abs(num).toFixed(2);
        const [intPart, decPart] = twoDecimal.split(".");
        const commaInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        result = commaInt + "." + decPart;
      }
    }
  }
  
  return isNegative ? "-" + result : result;
};

export const formatLiveInput = (value, type, preserveTyping = false) => {
  const filtered = filterNumericInput(value, true);
  let formatted = formatLiveNumber(filtered, type, preserveTyping);
  
  if (formatted === "" || formatted === null || formatted === undefined) formatted = "0";
  
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

export const calculateCursorPosition = (oldValue, newValue, oldCursor, type) => {
  if (oldCursor <= 0) return 0;
  
  // Handle end-of-input positioning
  if (oldCursor >= oldValue.length) {
    if (type === "currency") {
      return newValue.length;
    } else {
      const match = newValue.match(/^[0-9,.-\s]+/);
      return match ? match[0].length : 0;
    }
  }
  
  // Extract the numeric content (without prefix/suffix) for analysis
  const getNumericContent = (value, inputType) => {
    let content = value;
    let prefixLength = 0;
    
    // Remove prefix
    if (inputType === "currency" && content.startsWith("$ ")) {
      content = content.substring(2);
      prefixLength = 2;
    }
    
    // Remove suffix and find suffix start
    let suffixStart = content.length;
    if (inputType === "percent") {
      const match = content.match(/^([0-9,.-]+)\s*%/);
      if (match) {
        content = match[1];
        suffixStart = match[1].length;
      }
    } else if (inputType === "years") {
      const match = content.match(/^([0-9,.-]+)\s*yrs\.?/);
      if (match) {
        content = match[1];
        suffixStart = match[1].length;
      }
    } else if (inputType === "months") {
      const match = content.match(/^([0-9,.-]+)\s*mos\.?/);
      if (match) {
        content = match[1];
        suffixStart = match[1].length;
      }
    }
    
    return { content, prefixLength, suffixStart };
  };
  
  const oldAnalysis = getNumericContent(oldValue, type);
  const newAnalysis = getNumericContent(newValue, type);
  
  // Adjust cursor position to be relative to numeric content
  const adjustedOldCursor = Math.max(0, oldCursor - oldAnalysis.prefixLength);
  
  // Detect the type of change by comparing character counts
  const oldDigits = oldAnalysis.content.replace(/[^0-9.-]/g, '');
  const newDigits = newAnalysis.content.replace(/[^0-9.-]/g, '');
  
  let newCursorInContent;
  
  if (newDigits.length > oldDigits.length) {
    // INSERTION: Characters were added
    const insertedCount = newDigits.length - oldDigits.length;
    
    // Find how many significant characters were before cursor in old content
    let significantCharsBefore = 0;
    for (let i = 0; i < Math.min(adjustedOldCursor, oldAnalysis.content.length); i++) {
      if (/[0-9.-]/.test(oldAnalysis.content[i])) {
        significantCharsBefore++;
      }
    }
    
    // Position cursor after the inserted characters
    const targetPosition = significantCharsBefore + insertedCount;
    newCursorInContent = findPositionAfterNSignificantChars(newAnalysis.content, targetPosition);
    
  } else if (newDigits.length < oldDigits.length) {
    // DELETION: Characters were removed
    let significantCharsBefore = 0;
    for (let i = 0; i < Math.min(adjustedOldCursor, oldAnalysis.content.length); i++) {
      if (/[0-9.-]/.test(oldAnalysis.content[i])) {
        significantCharsBefore++;
      }
    }
    
    // Position cursor at the same logical position (accounting for deletions)
    newCursorInContent = findPositionAfterNSignificantChars(newAnalysis.content, significantCharsBefore);
    
  } else {
    // SAME LENGTH: Either no change or character replacement
    // Maintain relative position
    let significantCharsBefore = 0;
    for (let i = 0; i < Math.min(adjustedOldCursor, oldAnalysis.content.length); i++) {
      if (/[0-9.-]/.test(oldAnalysis.content[i])) {
        significantCharsBefore++;
      }
    }
    
    newCursorInContent = findPositionAfterNSignificantChars(newAnalysis.content, significantCharsBefore);
  }
  
  // Convert back to full string position
  const finalPosition = newAnalysis.prefixLength + newCursorInContent;
  
  // Ensure cursor doesn't go past content boundary
  const maxPosition = newAnalysis.prefixLength + newAnalysis.suffixStart;
  return Math.min(finalPosition, maxPosition);
};

// Helper function to find position after N significant characters
const findPositionAfterNSignificantChars = (content, targetCount) => {
  let significantChars = 0;
  
  for (let i = 0; i < content.length; i++) {
    if (significantChars === targetCount) {
      return i;
    }
    
    if (/[0-9.-]/.test(content[i])) {
      significantChars++;
    }
  }
  
  return content.length;
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
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
      const match = newValue.match(/^[0-9,.\-\s]+/);
      return match ? match[0].length : 0;
    }
  }
  
  // Get prefix length for different input types
  const getPrefixLength = (value, inputType) => {
    if (inputType === "currency" && value.startsWith("$ ")) return 2;
    return 0;
  };
  
  // Get the end of numeric content (before suffix)
  const getContentEnd = (value, inputType, prefixLength) => {
    const content = value.substring(prefixLength);
    
    if (inputType === "percent") {
      const match = content.match(/^([0-9,.\-]+)/);
      return match ? match[1].length : content.length;
    } else if (inputType === "years") {
      const match = content.match(/^([0-9,.\-]+)/);
      return match ? match[1].length : content.length;
    } else if (inputType === "months") {
      const match = content.match(/^([0-9,.\-]+)/);
      return match ? match[1].length : content.length;
    }
    
    return content.length;
  };
  
  const oldPrefixLength = getPrefixLength(oldValue, type);
  const newPrefixLength = getPrefixLength(newValue, type);
  
  const oldContentEnd = getContentEnd(oldValue, type, oldPrefixLength);
  const newContentEnd = getContentEnd(newValue, type, newPrefixLength);
  
  // Convert cursor position to be relative to numeric content
  const cursorInOldContent = Math.max(0, oldCursor - oldPrefixLength);
  const maxOldContentCursor = Math.min(cursorInOldContent, oldContentEnd);
  
  // Count logical position: how many significant characters before cursor
  const oldContent = oldValue.substring(oldPrefixLength, oldPrefixLength + oldContentEnd);
  let logicalPosition = 0;
  
  for (let i = 0; i < maxOldContentCursor; i++) {
    const char = oldContent[i];
    if (/[0-9.\-]/.test(char)) {
      logicalPosition++;
    }
  }
  
  // Find physical position for this logical position in new content
  const newContent = newValue.substring(newPrefixLength, newPrefixLength + newContentEnd);
  let physicalPosition = 0;
  let logicalCount = 0;
  
  // Scan through new content to find the target position
  for (let i = 0; i < newContent.length; i++) {
    const char = newContent[i];
    if (/[0-9.\-]/.test(char)) {
      logicalCount++;
      
      // If we've reached our target logical position
      if (logicalCount === logicalPosition) {
        // Look ahead to see if there's a comma after this character
        if (i + 1 < newContent.length && newContent[i + 1] === ',') {
          // Position cursor after the comma
          physicalPosition = i + 2;
        } else {
          // Position cursor after this character
          physicalPosition = i + 1;
        }
        break;
      }
    }
  }
  
  // Handle case where we need position 0 (before any characters)
  if (logicalPosition === 0) {
    physicalPosition = 0;
  }
  
  // Convert back to full string position
  const finalPosition = newPrefixLength + physicalPosition;
  
  // Ensure we don't exceed the content boundary
  const maxAllowedPosition = newPrefixLength + newContentEnd;
  return Math.min(finalPosition, maxAllowedPosition);
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
export function extractPhoneNumber() {
  const phoneElement = document.querySelector(".phone-number") ||
                      document.querySelector("a[href^='tel:']") ||
                      document.querySelector(".number") ||
                      document.querySelector("[class*='phone']");
  
  if (phoneElement) {
    if (phoneElement.textContent && phoneElement.textContent.trim() !== "Call") {
      return phoneElement.textContent.trim();
    } else if (phoneElement.href) {
      // Extract from tel: link
      const telMatch = phoneElement.href.match(/tel:(.+)/);
      if (telMatch) {
        return telMatch[1];
      }
    }
  }
  
  // Fallback to text search with multiple patterns
  const pageText = document.body ? document.body.textContent || "" : "";
  const phoneMatch = pageText.match(/(\+?1?\s*\(?[0-9]{3}\)?[\s.-]*[0-9]{3}[\s.-]*[0-9]{4})/);
  if (phoneMatch) {
    return phoneMatch[1].trim();
  }
  
  return "Not found";
}

export function extractBedrooms() {
  try {
    // Look for bedroom information in various places
    const bodyText = document.body?.textContent || "";
    
    // Common patterns for bedroom information
    const bedroomPatterns = [
      /(\d+)\s*bed/i,
      /(\d+)\s*bedroom/i,
      /beds?\s*:\s*(\d+)/i,
      /bedrooms?\s*:\s*(\d+)/i,
      /(\d+)\s*BR/i,
      /(\d+)br/i
    ];
    
    for (const pattern of bedroomPatterns) {
      const match = bodyText.match(pattern);
      if (match) {
        const bedrooms = parseInt(match[1]);
        if (bedrooms > 0 && bedrooms < 100) { // Sanity check
          return bedrooms;
        }
      }
    }
    
    // Look in property details section specifically
    const propertyDetails = document.querySelector(".property-details") || 
                           document.querySelector("#PropertyDetails") ||
                           document.querySelector(".details");
    
    if (propertyDetails) {
      const detailsText = propertyDetails.textContent || "";
      for (const pattern of bedroomPatterns) {
        const match = detailsText.match(pattern);
        if (match) {
          const bedrooms = parseInt(match[1]);
          if (bedrooms > 0 && bedrooms < 100) {
            return bedrooms;
          }
        }
      }
    }
    
    // Default fallback
    return 10; // Default assumption for assisted living
  } catch (error) {
    return 10; // Default fallback
  }
}


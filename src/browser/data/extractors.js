export function extractPhoneNumber() {
  const PHONE_RE = /(\+?1?\s*\(?[0-9]{3}\)?[\s.-]*[0-9]{3}[\s.-]*[0-9]{4})/;

  // A tel: link is unambiguous — prefer it. Its href holds the real number even when the
  // visible text is a label ("Call") or, on LoopNet, a lead-form validation message.
  const telLink = document.querySelector("a[href^='tel:']");
  if (telLink && telLink.href) {
    const num = decodeURIComponent(telLink.href.replace(/^tel:/, "")).trim();
    if (PHONE_RE.test(num)) return num;
  }

  // Other phone-ish elements, but accept their TEXT only if it actually looks like a phone —
  // guards against lead-capture form fields (class*="phone") whose text is a label/validation
  // message ("Phone* Valid phone number is required"), not a number.
  for (const sel of [".phone-number", ".number", "[class*='phone']"]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const m = (el.textContent || "").match(PHONE_RE);
    if (m) return m[1].trim();
    if (el.href) {
      const num = decodeURIComponent(el.href.replace(/^tel:/, "")).trim();
      if (PHONE_RE.test(num)) return num;
    }
  }

  // Fallback to a body-text scan.
  const pageText = document.body ? document.body.textContent || "" : "";
  const phoneMatch = pageText.match(PHONE_RE);
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

// Map the on-screen property type to the dashboard's DB enum. Only "multifamily" -> "mfr"
// actually differs; the rest pass through. Mirrors property-dashboard/validation/property.js
// mapPropertyType (same table, same unknown -> "mfr" default) so the export URL carries the
// real enum instead of relying on the server to convert it.
function mapPropertyType(type) {
  const typeMap = {
    assisted: "assisted",
    business: "business",
    mixed_use: "mixed_use",
    multifamily: "mfr",
    rv_park: "rv_park",
    str: "str",
  };
  return typeMap[type] || "mfr";
}

// Pure business logic for data export - no DOM, no Chrome APIs.
// Returns null to REFUSE export when the price was defaulted (no real price found):
// a fabricated price would flow into NOI and silently land garbage in the dashboard.
export function createExportObjectCore(data, options = {}) {
  const {
    cachedEquity = null,
    currentDownPaymentPercent,
    currentInterestRateType = "dscr_residential",
    currentPriceDiscount = 0,
    currentPropertyType = "str",
    equitySource = "scraped",
    isUsingEstimatedCapRate = false,
    numberOfUnits = 4,
    priceWasDefaulted = false,
    windowLocation = "",
  } = options;

  if (priceWasDefaulted) return null;

  const exportData = {};

  // 1. Address
  if (data.name && data.name !== "Property Details" && data.name !== "Not found") {
    exportData.address = data.name;
  }

  // 2. Cap Rate - convert to decimal
  if (data.capRate && data.capRate !== "Loading..." && data.capRate !== "Not found") {
    const capMatch = data.capRate.match(/[\d.]+/);
    if (capMatch) {
      const numericValue = parseFloat(capMatch[0]);

      // If the original string contains %, it's a percentage that needs conversion
      // If it's already a small decimal (< 1), it's likely already in decimal format
      if (data.capRate.includes("%") || numericValue > 1) {
        // Percentage format - convert to decimal
        exportData.capRate = Math.round((numericValue / 100) * 1000000) / 1000000;
      } else {
        // Already in decimal format - use as-is
        exportData.capRate = Math.round(numericValue * 1000000) / 1000000;
      }
    }
  }

  // 3. Cap Rate Source
  exportData.capRateSource = isUsingEstimatedCapRate ? "estimated" : "scraped";

  // 4. Contact name
  if (data.contact && data.contact !== "Not found") {
    exportData.contact = data.contact;
  }

  // 5. Date Listed
  if (data.listingDate && data.listingDate !== "Not found") {
    exportData.dateListed = data.listingDate;
  }

  // 6. Price - calculate original price if discount applied
  if (data.price && data.price !== "Loading..." && data.price !== "Not found") {
    const priceMatch = data.price.match(/[\d,]+/);
    if (priceMatch) {
      const displayedPrice = parseFloat(priceMatch[0].replace(/,/g, ""));

      if (currentPriceDiscount > 0) {
        const discountDecimal = currentPriceDiscount / 100;
        const originalPrice = displayedPrice / (1 - discountDecimal);
        exportData.price = Math.round(originalPrice);
      } else {
        exportData.price = displayedPrice;
      }
    }
  }

  // 7. Down Payment Percent (user-controlled value)
  if (currentDownPaymentPercent !== undefined) {
    exportData.downPaymentPercent = Math.round((currentDownPaymentPercent / 100) * 1000000) / 1000000;
  }

  // 8. Equity Percent
  if (cachedEquity && cachedEquity !== "Loading...") {
    const equityMatch = cachedEquity.match(/[\d.]+/);
    if (equityMatch) {
      exportData.equityPercent = Math.round((parseFloat(equityMatch[0]) / 100) * 1000000) / 1000000;
    }
  }

  // 9. Equity Source
  exportData.equitySource = equitySource;

  // 10. Number of Units
  exportData.numberOfUnits = numberOfUnits;

  // 11. Phone number
  if (data.phone && data.phone !== "Not found") {
    exportData.phone = data.phone;
  }

  // 11. Price Discount Percent
  if (currentPriceDiscount > 0) {
    exportData.priceDiscountPercent = Math.round((currentPriceDiscount / 100) * 1000000) / 1000000;
  } else {
    exportData.priceDiscountPercent = 0;
  }

  // 12. Interest Rate Type
  exportData.interestRateType = currentInterestRateType;

  // 13. Property Type - mapped to the DB enum (multifamily -> mfr; rest pass through)
  exportData.propertyType = mapPropertyType(currentPropertyType);

  // 13. URL
  exportData.url = windowLocation;

  console.log("exportData", exportData);

  // Alphabetize keys
  const alphabetized = {};
  Object.keys(exportData).sort().forEach(key => {
    alphabetized[key] = exportData[key];
  });

  return alphabetized;
}

// Pure calculation functions
export function calculateOriginalPrice(displayedPrice, discountPercent) {
  if (discountPercent > 0) {
    const discountDecimal = discountPercent / 100;
    return displayedPrice / (1 - discountDecimal);
  }
  return displayedPrice;
}

export function convertCapRateToDecimal(capRateString) {
  if (!capRateString || capRateString === "Loading..." || capRateString === "Not found") {
    return null;
  }

  const capMatch = capRateString.match(/[\d.]+/);
  if (capMatch) {
    const numericValue = parseFloat(capMatch[0]);

    if (capRateString.includes("%") || numericValue > 1) {
      return Math.round((numericValue / 100) * 1000000) / 1000000;
    } else {
      return Math.round(numericValue * 1000000) / 1000000;
    }
  }

  return null;
}

export function formatDownPaymentPercent(percentage) {
  return Math.round((percentage / 100) * 1000000) / 1000000;
}

/**
 * DATE utilities
 */

const formatDate = (dateString, includeYear = true) => {
  if (!dateString) return "";

  // Detect if the string includes a timezone (Z or ±HH:MM)
  const hasTimezone = /[zZ]|([+\-]\d{2}:?\d{2})/.test(dateString);

  let date;
  if (hasTimezone) {
    date = new Date(dateString);
  } else {
    const [year, month, day] = dateString.split("T")[0].split("-").map(Number);
    date = new Date(year, month - 1, day);
  }

  if (isNaN(date)) return "";

  const options = includeYear
    ? { month: "short", day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric" };

  return date.toLocaleDateString("en-US", options);
};


export function calculateDOM(listingDateText, returnFormattedDate = true) {
  if (!listingDateText || listingDateText === "Not found") {
    return "Not found";
  }

  try {
    // Parse various date formats
    let listingDate;
    
    // Try parsing MM/DD/YYYY format
    const mmddyyyyMatch = listingDateText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mmddyyyyMatch) {
      const [, month, day, year] = mmddyyyyMatch;
      listingDate = new Date(year, month - 1, day);
    } else {
      // Try parsing other common date formats
      listingDate = new Date(listingDateText);
    }

    if (isNaN(listingDate.getTime())) {
      return "Invalid date";
    }

    // Calculate days difference
    const today = new Date();
    const diffTime = today - listingDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if(returnFormattedDate) {
      return `${diffDays} (${formatDate(listingDate)})`;
    }
    else {
      return diffDays;
    }
  } catch (error) {
    return "Calculation error";
  }
}


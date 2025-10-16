/**
 * DATE utilities
 */

export function formatDate(date) {
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

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


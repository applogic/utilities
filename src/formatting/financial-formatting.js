// Enhanced formatting for input fields
export const formatInputDisplay = (value, type) => {
  const num = parseFloat(value) || 0;
  const hasDecimals = num % 1 !== 0;
  
  switch (type) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2
      }).format(num);
    
    case 'percent':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: hasDecimals ? 1 : 0,
        maximumFractionDigits: 2
      }).format(num) + '%';
    
    case 'years':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: hasDecimals ? 1 : 0,
        maximumFractionDigits: 1
      }).format(num) + ' yrs.';
    
    case 'months':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(num) + ' mos.';
    
    case 'number':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: 2
      }).format(num);
    
    default:
      return value;
  }
};

export const parseNumericInput = (value) => {
  // Remove all non-numeric characters except decimal point and negative sign
  const cleaned = value.toString().replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
};
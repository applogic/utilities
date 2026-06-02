// Metrics that should have tooltips
export const TOOLTIP_ENABLED_METRICS = {
  "prop-down": {
    dynamic: true, // Content updates based on calculations
    calculate: "calculateDownPaymentTooltip"
  },
  "prop-cashflow": {
    dynamic: true,
    calculate: "calculateCashFlowTooltip"
  },
  "prop-cap": {
    dynamic: true,
    conditional: true, // Only shows when price is discounted
    calculate: "calculateCapRateTooltip"
  }
  // Add more as needed
};

// Static tooltips for clickable elements
export const CLICKABLE_TOOLTIPS = {
  "prop-price": "Click to adjust asking price discount",
  "prop-cap": "Click to adjust cap rate",
  "prop-down": "Click to decrease down payment by 10%"
};

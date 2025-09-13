// Simple CSS injection utilities - no duplication, just read CSS files and inject

// Import CSS files as strings (will be handled by build process)
import variablesCSS from "./variables.css?raw";
import footerCSS from "./footer.css?raw";
import dashboardCSS from "./dashboard.css?raw";

// Combined CSS strings
export const styles = {
  variables: variablesCSS,
  footer: footerCSS,
  dashboard: dashboardCSS,
  
  // Combined styles for different contexts
  extension: variablesCSS + footerCSS,
  dashboardApp: variablesCSS + dashboardCSS
};

// Simple injection function
export function injectStyles(cssString, id = "injected-styles") {
  if (typeof document === 'undefined') return null;
  
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  
  const style = document.createElement("style");
  style.id = id;
  style.textContent = cssString;
  document.head.appendChild(style);
  
  return style;
}

// Specific injection functions for each project
export function injectFooterStyles() {
  return injectStyles(styles.extension, "ln-footer-styles");
}

export function injectDashboardStyles() {
  return injectStyles(styles.dashboardApp, "dashboard-styles");
}
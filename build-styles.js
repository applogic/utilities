#!/usr/bin/env node

// Simple build script - no CSS variables, just clean CSS

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const stylesDir = join(__dirname, 'src/styles');

console.log('🔄 Building styles...');

try {
  // Read CSS files
  const variablesCSS = readFileSync(join(stylesDir, 'variables.css'), 'utf-8');
  const footerCSS = readFileSync(join(stylesDir, 'footer.css'), 'utf-8');
  const dashboardCSS = readFileSync(join(stylesDir, 'dashboard.css'), 'utf-8');

  // Generate browser-compatible module
  const browserModule = `// Auto-generated browser styles - DO NOT EDIT
// Generated from CSS files by build-styles.js

export const styles = {
  variables: ${JSON.stringify(variablesCSS)},
  footer: ${JSON.stringify(footerCSS)},
  dashboard: ${JSON.stringify(dashboardCSS)},
  
  // Combined styles
  extension: ${JSON.stringify(variablesCSS + footerCSS)},
  dashboardApp: ${JSON.stringify(variablesCSS + dashboardCSS)}
};

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

export function injectFooterStyles() {
  return injectStyles(styles.extension, "ln-footer-styles");
}

export function injectDashboardStyles() {
  return injectStyles(styles.dashboardApp, "dashboard-styles");
}
`;

  // Write the browser module
  writeFileSync(join(stylesDir, 'browser.js'), browserModule);

  console.log('✅ Browser styles generated successfully');
  console.log('📁 Generated: src/styles/browser.js');

} catch (error) {
  console.error('❌ Error building styles:', error);
  process.exit(1);
}
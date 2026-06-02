// Shared analysis-panel (footer) builder for the property analyzers.
//
// Extracted verbatim from each analyzer's dom-utils.js createFooter/createFooterElements.
// Per-platform values are injected so this module has no Chrome or global-state dependency:
//   - cssUrls: stylesheet hrefs (callers resolve chrome.runtime.getURL themselves)
//   - defaultPropertyType: which property-type <option> is pre-selected (loopnet "multifamily", zillow "str")
//   - callbacks.state / callbacks.updateState: the per-platform state singleton
//   - callbacks.onExportClick / onPropertyTypeChange / onInterestRateTypeChange: optional notifications
//     (today these are CustomEvent dispatches; callers that need them pass a handler, others omit)

const PROPERTY_TYPE_OPTIONS = [
  { value: "multifamily", label: "Multifamily" },
  { value: "str", label: "STR" },
  { value: "assisted", label: "Assisted/Co Living" },
  { value: "business", label: "Business" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "rv_park", label: "RV Park" }
];

function renderPropertyTypeOptions(defaultPropertyType) {
  return PROPERTY_TYPE_OPTIONS.map(({ value, label }) => {
    const selected = value === defaultPropertyType ? " selected" : "";
    return `<option value="${value}"${selected}>${label}</option>`;
  }).join("\n            ");
}

export function createPanel(config) {
  const { cssUrls = [], defaultPropertyType = "multifamily", callbacks = {} } = config || {};

  console.log("🎨 createPanel() called");

  const existing = document.getElementById("ln-footer");
  if (existing) {
    console.log("🗑️ Removing existing footer");
    existing.remove();
  }

  console.log("📦 Loading CSS files...");

  const links = cssUrls.map((href) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    return link;
  });

  // Wait for all stylesheets to load before creating footer
  let loadedCount = 0;
  const total = links.length;
  const onLoad = () => {
    loadedCount++;
    console.log(`📄 CSS file loaded (${loadedCount}/${total})`);
    if (loadedCount === total) {
      console.log("✨ All CSS loaded, creating footer elements");
      createPanelElements(defaultPropertyType, callbacks);
    }
  };

  links.forEach((link) => { link.onload = onLoad; });

  console.log("⏰ Setting 100ms fallback timeout");
  // Fallback - create footer after timeout even if shared CSS doesn't load
  setTimeout(() => {
    console.log("⚠️ Fallback timeout reached, creating footer elements anyway");
    createPanelElements(defaultPropertyType, callbacks);
  }, 100);

  links.forEach((link) => { document.head.appendChild(link); });
}

function createPanelElements(defaultPropertyType, callbacks) {
  // Prevent duplicate creation
  if (document.getElementById("ln-footer")) return;

  const { updateState } = callbacks;

  const footer = document.createElement("div");
  footer.id = "ln-footer";
  footer.className = "ext-footer";

  footer.innerHTML = `
    <div class="footer-container">
      <div class="footer-content">
        <div class="metrics-grid">
          <div class="metric-column">
            <div class="metric">
              <span class="metric-label">Address</span>
              <span id="prop-name" class="metric-value clickable prop-name">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Lead Status</span>
              <span id="prop-lead-status" class="metric-value prop-lead-status">Loading...</span>
            </div>
          </div>

          <div class="metric-column">
            <div class="metric">
              <span class="metric-label">Price</span>
              <span id="prop-price" class="metric-value triangle prop-price">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Cash Flow</span>
              <span id="prop-cashflow" class="metric-value weight-semibold prop-cashflow">Loading...</span>
            </div>
          </div>

          <div class="metric-column">
            <div class="metric">
              <span class="metric-label">Cap Rate</span>
              <span id="prop-cap" class="metric-value prop-cap">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">NOI</span>
              <span id="prop-noi" class="metric-value prop-noi">Loading...</span>
            </div>
          </div>

          <div class="metric-column">
            <div class="metric">
              <span class="metric-label">COCR (15%)</span>
              <span id="prop-cocr-15" class="metric-value prop-cocr-15">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">COCR (30%)</span>
              <span id="prop-cocr-30" class="metric-value prop-cocr-30">Loading...</span>
            </div>
          </div>

          <div class="metric-column">
            <div class="metric prop-dom-metric">
              <span class="metric-label">DOM</span>
              <span id="prop-dom" class="metric-value triangle prop-dom">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Equity</span>
              <span id="prop-equity" class="metric-value prop-equity">Loading...</span>
            </div>
          </div>

          <div class="metric-column">
            <div class="metric">
              <span class="metric-label">Seller FI (40%)</span>
              <span id="prop-seller-fi" class="metric-value prop-seller-fi">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Down (60%)</span>
              <span id="prop-down" class="metric-value triangle prop-down">Loading...</span>
            </div>
          </div>

          <div class="metric-column">
            <div class="metric">
              <span class="metric-label">DSCR (70%)</span>
              <span id="prop-dscr" class="metric-value prop-dscr">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">SF Payment</span>
              <span id="prop-sf" class="metric-value prop-sf">Loading...</span>
            </div>
          </div>

          <div class="metric-column">
            <div class="metric">
              <span class="metric-label">Contact</span>
              <span id="prop-contact" class="metric-value prop-contact">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Phone</span>
              <span id="prop-phone" class="metric-value prop-contact">Loading...</span>
            </div>
          </div>

          <div class="metric-column">
            <div class="metric">
              <span class="metric-label">Net to Buyer</span>
              <span id="prop-net" class="metric-value prop-net">Loading...</span>
            </div>
            <div class="metric">
              <span class="metric-label">Assignment</span>
              <span id="prop-assignment" class="metric-value prop-assignment">Loading...</span>
            </div>
          </div>
        </div>
      </div>
      <div class="footer-controls">
        <div class="footer-controls-col">
          <div class="units-input-row">
            <input type="number" id="ln-units-input" class="units-input" min="1" max="999" value="4">
            <span class="units-inline-label">units</span>
          </div>
          <button class="btn-discount" id="ln-discount-btn">85% of Asking</button>
        </div>
        <div class="footer-controls-col">
          <select class="dropdown" id="ln-property-type">
            ${renderPropertyTypeOptions(defaultPropertyType)}
          </select>
          <select class="dropdown" id="ln-interest-rate-type">
            <option value="dscr_residential" selected>DSCR Res (8%)</option>
            <option value="dscr_commercial">DSCR Com (10%)</option>
            <option value="commercial">Commercial (10%)</option>
            <option value="mixed_use">Mixed Use (10%)</option>
            <option value="rv_park">RV Park (11%)</option>
          </select>
          <button class="btn-primary" id="ln-export-btn" title="Open dashboard with property data">
            <svg class="icon" viewBox="0 0 24 24">
              <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
            </svg>
            Dashboard
          </button>
        </div>
      </div>
    </div>
  `;

  try {
    if (document.body) {
      document.body.appendChild(footer);
    } else if (document.documentElement) {
      document.documentElement.appendChild(footer);
    }
  } catch (error) {
    // Silent fail
  }

  const exportBtn = document.getElementById("ln-export-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      callbacks.onExportClick?.();
    });
  }

  const propertyTypeDropdown = document.getElementById("ln-property-type");
  if (propertyTypeDropdown) {
    propertyTypeDropdown.addEventListener("change", () => {
      callbacks.onPropertyTypeChange?.(propertyTypeDropdown.value);
    });
  }

  const interestRateTypeDropdown = document.getElementById("ln-interest-rate-type");
  if (interestRateTypeDropdown) {
    interestRateTypeDropdown.addEventListener("change", () => {
      updateState({ currentInterestRateType: interestRateTypeDropdown.value });
      callbacks.onInterestRateTypeChange?.(interestRateTypeDropdown.value);
    });
  }

  const unitsInput = document.getElementById("ln-units-input");
  if (unitsInput) {
    unitsInput.addEventListener("change", () => {
      const value = parseInt(unitsInput.value) || 4;
      updateState({ numberOfUnits: value });

      const irDropdown = document.getElementById("ln-interest-rate-type");
      if (irDropdown) {
        if (value > 11 && irDropdown.value !== "dscr_commercial") {
          irDropdown.value = "dscr_commercial";
          updateState({ currentInterestRateType: "dscr_commercial" });
          callbacks.onInterestRateTypeChange?.("dscr_commercial");
        } else if (value <= 11 && irDropdown.value === "dscr_commercial") {
          irDropdown.value = "dscr_residential";
          updateState({ currentInterestRateType: "dscr_residential" });
          callbacks.onInterestRateTypeChange?.("dscr_residential");
        }
      }
    });
  }

  return footer;
}

# CLAUDE.md

This file provides guidance specific to the @archerjessop/utilities repository. Shared ecosystem rules are in the parent `../CLAUDE.md`.

## Project Overview

@archerjessop/utilities is a shared NPM package containing business logic, financial calculations, constants, and utility functions used across all ArcherJessop property analysis tools.

### Critical Role

**Changes here affect ALL consuming projects.** When modifying:
- Financial calculations -> impacts all property analysis
- Constants -> impacts business rules everywhere
- Formatting -> impacts all UI displays

## Backward Compatibility

**Core Principle**: Backward compatibility is critical - breaking changes affect multiple projects.

- Don't change function signatures without considering all consumers
- Don't modify constant values without understanding business impact
- Add new exports, don't remove existing ones without deprecation
- Test in both browser and Node.js contexts
- New functions are safer than modifying existing ones

**Versioning:**
- Patch: Bug fixes, internal changes
- Minor: New features, new exports
- Major: Breaking changes (avoid when possible)

## Development Commands

### Development Workflow
```bash
npm run dev              # Build with watch mode (Rollup)
npm run build            # Build for production
npm test                 # Run tests with Vitest
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run lint             # Check for linting errors
npm run lint:fix         # Auto-fix linting errors
```

### Publishing
```bash
npm run release:patch    # Bug fix (1.0.0 → 1.0.1)
npm run release:minor    # New feature (1.0.0 → 1.1.0)
npm run release:major    # Breaking change (1.0.0 → 2.0.0)
```

The release scripts will:
1. Clean and rebuild
2. Run tests
3. Bump version
4. Git commit and tag
5. Push to remote
6. Publish to npm (public access)

## Architecture

### Source Structure

```
src/
├── index.js                      # Main entry - exports all public APIs
├── config/
│   ├── business.js               # Business constants (rates, URLs, percentages)
│   ├── financial.js              # Financial constants (loan rates, terms)
│   ├── loi-lookup.js             # LOI lookup configuration
│   └── property-types.js         # Property type definitions and rates
├── data/
│   └── extractors.js             # DOM extraction helpers (browser-only)
├── date/
│   └── utilities.js              # Date formatting, DOM calculation
├── environment/
│   └── utilities.js              # Environment detection (Node vs browser)
├── financial/
│   ├── calculations.js           # All financial calculation functions
│   └── formatters.js             # Currency/percentage/price formatting
├── formatting/
│   ├── financial-formatting.js   # Live input formatting, cursor positioning
│   └── text.js                   # Text normalization (whitespace)
├── services/
│   └── loi-lookup.js             # LOI lookup service
└── styles/
    └── base.css                  # Shared CSS styles
```

### Build Output

```
dist/
├── index.js          # Minified, tree-shakeable ESM bundle
└── styles/
    └── base.css      # Copied CSS files
```

### Key Exports

**Financial Calculations:**
- `calculatePMT()` - Monthly payment calculation
- `calculateNOIByType()` - NOI by property type (multifamily, STR, assisted)
- `calculateCOCRAtPercent()` - Cash on cash return at specific down payment
- `calculatePriceForCOCR()` - Price for target COCR (inverse calculation)
- `calculateAssignmentFee()` - Assignment fee calculation
- `calculateNetToBuyer()` - Net proceeds after costs
- `calculateCashFlow()` - Monthly cash flow
- `calculateBalloonBalance()` - Remaining balance at balloon
- `calculateAppreciatedValue()` - Compound appreciation
- `calculateCashOutAfterRefi()` - Cash available after refinance

**Formatters:**
- `formatCurrency()` - Format as $, with K/M abbreviations
- `formatPercentage()` - Format as percentage
- `formatPriceValue()` - Format price with decimals

**Input Formatting:**
- `formatLiveInput()` - Format during user input
- `parseNumericInput()` - Extract numbers from formatted strings
- `filterNumericInput()` - Remove non-numeric characters
- `extractNumericValue()` - Get number from display format
- `calculateCursorPosition()` - Adjust cursor after formatting

**Constants:**
- `FINANCIAL_CONSTANTS` - Loan rates, terms, default percentages
- `BUSINESS_CONSTANTS` - Commission rates, URLs, business rules
- `PROPERTY_TYPE_CONSTANTS` - Property-specific rates and defaults

**Utilities:**
- `normalizeWhitespace()` - Collapse whitespace, trim
- `formatDate()` - Format dates for display
- `calculateDOM()` - Days on market
- `extractPhoneNumber()` - DOM phone extraction (browser-only)
- `extractBedrooms()` - DOM bedroom extraction (browser-only)

## Environment Compatibility

Functions must work in BOTH environments:

**Node.js (Server):**
- Full Node APIs available
- CommonJS or ESM import
- Server-side calculations

**Browser (Extensions/Frontend):**
- No Node APIs
- ESM imports only
- DOM access for extractors

**Browser-Only Functions:**
- `extractPhoneNumber()` - Uses document.querySelector
- `extractBedrooms()` - Uses DOM text extraction

**Environment Detection:**
```javascript
import { isNodeEnvironment, isBrowserEnvironment, getEnvVar } from '@archerjessop/utilities';
```

## Testing Strategy

Tests mirror source structure in `tests/` directory:
- `tests/config/` - Constants tests
- `tests/financial/` - Calculation tests
- `tests/formatting/` - Formatting tests
- `tests/integration/` - Real-world scenario tests

Run tests with `npm test`. Uses Vitest.

**Repo-specific testing requirements:**
- Test edge cases: zero, negative, very large values
- Test both percentage and decimal inputs
- Test environment compatibility (Node + browser)
- Integration tests should use real-world property scenarios

## Build Configuration

**Rollup Configuration:**
- Input: `src/index.js`
- Output: `dist/index.js` (ESM)
- Plugins: node-resolve, terser (minification)
- Tree-shakeable output

**Package Configuration:**
- Type: `module` (ESM)
- Main: `dist/index.js`
- Exports CSS via path pattern
- `sideEffects: false` for tree-shaking

## Common Tasks

**Add a new calculation:**
1. Add function to `src/financial/calculations.js`
2. Export from `src/index.js`
3. Add tests in `tests/financial/`
4. Build and publish new version
5. Update consuming projects

**Add a new constant:**
1. Add to appropriate config file in `src/config/`
2. Export both individually and as part of constants object
3. Document the value and its purpose
4. Test default behavior

**Modify existing calculation:**
1. Check all consuming projects for usage
2. Ensure backward compatibility
3. Update tests
4. Consider if change needs major version bump

**Update for new property type:**
1. Add type to `src/config/property-types.js`
2. Update `calculateNOIByType()` in calculations
3. Add constants for the new type
4. Update tests

## Repo-Specific Code Style

**Function Patterns:**
- Optional parameters as object: `function(required, options = {})`
- Destructure options with defaults
- Return 0 or sensible default on invalid input
- Use JSDoc comments for complex functions

**Constants Pattern:**
- Export both full object and individual values
- Allows tree-shaking and destructuring
- Example:
```javascript
export const FINANCIAL_CONSTANTS = { ... };
export const { DSCR_INTEREST_RATE, DEFAULT_DOWN_PAYMENT } = FINANCIAL_CONSTANTS;
```

## Publishing Checklist

Before publishing a new version:

1. **Tests pass**: `npm test`
2. **Linting clean**: `npm run lint`
3. **Build succeeds**: `npm run build`
4. **Consider consumers**: Will this break loopnet-analyzer or property-dashboard?
5. **Version appropriately**: patch/minor/major
6. **Document breaking changes**: Update README if needed

After publishing:
1. Update consuming projects: `npm install @archerjessop/utilities@latest`
2. Test consuming projects
3. Rebuild and deploy consuming projects

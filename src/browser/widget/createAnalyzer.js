// The common analyzer engine — composition root. A site becomes a thin adapter; this wires the
// decomposed units (render / finance / services / export / pipeline / nav) over a single injected
// ctx and exposes the public surface. Each unit lives in its own module and is independently
// tested; this file just validates the adapter and connects the pieces in dependency order.
//
// Generalized from zillow-analyzer/content.js (the green SPA copy). The per-repo state /
// updateState / resetForNavigation singletons become an injected ctx (createAnalyzerState);
// extractData / isPropertyPage / getListingId become the adapter; the equity / STR / LOI fetches
// become agnostic service calls the engine orchestrates.
//
/* global chrome */
// adapter = {
//   matches(url): boolean,            // is this a listing page (was isPropertyPage)
//   getListingId(url): string|null,   // listing identity for the SPA watcher (was zpid)
//   scrape(): Listing,                // the Listing contract (see browser/index.js)
//   config: { defaultPropertyType, cssFiles, spa? },
// }

import { createAnalyzerState } from "./createAnalyzerState.js";
import { createExportOps } from "./exportOps.js";
import { createFinance } from "./finance.js";
import { createNav } from "./nav.js";
import { createPipeline } from "./pipeline.js";
import { createRender } from "./render.js";
import { createServices } from "./services.js";

export function createAnalyzer(adapter) {
  // Construction-validation: fail loud at wiring time, not deep in the pipeline.
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("createAnalyzer(adapter): adapter must be an object");
  }
  for (const fn of ["matches", "getListingId", "scrape"]) {
    if (typeof adapter[fn] !== "function") {
      throw new TypeError(`createAnalyzer(adapter): adapter.${fn} must be a function`);
    }
  }
  const config = adapter.config || {};

  const ctx = createAnalyzerState({ defaultPropertyType: config.defaultPropertyType });

  // Wire the units in dependency order: render (leaf) -> finance/services -> export -> pipeline -> nav.
  const render = createRender({ ctx });
  const finance = createFinance({ ctx, adapter, render });
  const services = createServices({ ctx });
  const exportOps = createExportOps({
    ctx,
    ensureDebtLoaded: services.ensureDebtLoaded,
    scrapeAndApply: finance.scrapeAndApply,
  });
  const pipeline = createPipeline({ adapter, config, ctx, exportOps, finance, render, resolveCssUrls, services });
  const nav = createNav({ adapter, config, ctx, runPipeline: pipeline.runPipeline });

  return {
    ctx,
    createExportObject: exportOps.createExportObject,
    handleNavigation: nav.handleNavigation,
    runPipeline: pipeline.runPipeline,
    start: nav.start,
  };
}

// chrome.runtime.getURL resolves extension-relative CSS paths at runtime; guard it so the
// engine is loadable under jsdom / Node (tests) where `chrome` is absent.
function resolveCssUrls(cssFiles = []) {
  const hasChrome = typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function";
  return cssFiles.map((f) => (hasChrome ? chrome.runtime.getURL(f) : f));
}

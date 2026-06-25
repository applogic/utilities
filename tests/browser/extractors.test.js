// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import { extractPhoneNumber } from "../../src/browser/data/extractors.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("extractPhoneNumber", () => {
  test("regression: a lead-form phone field must NOT shadow the broker's tel: link", () => {
    // WHY: this is the LoopNet bug. The lead-capture form has a `.phone-number` field whose text
    // is a validation message, and `[class*='phone']` matches it too. The old selector chain
    // returned that text verbatim ("Phone* Valid phone number is required") because it wasn't the
    // literal string "Call". The real number lives in the revealed tel: link and must win.
    document.body.innerHTML = `
      <div class="lead-form">
        <label class="phone-number">Phone* Valid phone number is required</label>
        <input class="phone-input" />
      </div>
      <a href="tel:+1 828-254-7253">Call</a>`;
    expect(extractPhoneNumber()).toBe("+1 828-254-7253");
  });

  test("prefers the tel: link even when its visible text is just a label", () => {
    document.body.innerHTML = `<a href="tel:5105022288">Call</a>`;
    expect(extractPhoneNumber()).toBe("5105022288");
  });

  test("reads a real phone number from element text when there is no tel: link", () => {
    document.body.innerHTML = `<span class="phone-number">(510) 502-2288</span>`;
    expect(extractPhoneNumber()).toBe("(510) 502-2288");
  });

  test("ignores non-phone text in a phone-classed element and falls back to body text", () => {
    document.body.innerHTML = `
      <div class="phone-help">Call us for phone support</div>
      <footer>Reach the broker at 828-254-7253 today</footer>`;
    expect(extractPhoneNumber()).toBe("828-254-7253");
  });

  test("returns 'Not found' when no phone is present anywhere", () => {
    document.body.innerHTML = `<div class="phone-number">Phone* Valid phone number is required</div>`;
    expect(extractPhoneNumber()).toBe("Not found");
  });
});

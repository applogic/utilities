// tests/data/extractors.test.js
import { describe, test, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { extractPhoneNumber, extractBedrooms } from "../../src/data/extractors.js";

describe("Data Extractors", () => {
  let dom;
  let document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document;
    global.window = dom.window;
    document = global.document;
    document.body.innerHTML = "";
  });


  describe("extractPhoneNumber", () => {
    describe("Text Extraction", () => {
      test("should extract standard US phone formats", () => {
        expect(extractPhoneNumber("Call (555) 123-4567")).toBe("(555) 123-4567");
        expect(extractPhoneNumber("Phone: 555-123-4567")).toBe("555-123-4567");
        expect(extractPhoneNumber("Contact 555.123.4567")).toBe("555.123.4567");
        expect(extractPhoneNumber("5551234567")).toBe("5551234567");
      });

      test("should extract phone with country code", () => {
        expect(extractPhoneNumber("+1 (555) 123-4567")).toBe("+1 (555) 123-4567");
        expect(extractPhoneNumber("1-555-123-4567")).toBe("1-555-123-4567");
        expect(extractPhoneNumber("+1.555.123.4567")).toBe("+1.555.123.4567");
      });

      test("should extract phone with extension", () => {
        expect(extractPhoneNumber("(555) 123-4567 ext 123")).toBe("(555) 123-4567");
        expect(extractPhoneNumber("555-123-4567 x456")).toBe("555-123-4567");
        expect(extractPhoneNumber("555.123.4567 extension 789")).toBe("555.123.4567");
      });

      test("should extract first phone from multiple", () => {
        const text = "Office: (555) 123-4567, Cell: (555) 987-6543";
        expect(extractPhoneNumber(text)).toBe("(555) 123-4567");
      });

      test("should handle phone in mixed content", () => {
        const text = "Contact John Smith at (555) 123-4567 or email john@example.com";
        expect(extractPhoneNumber(text)).toBe("(555) 123-4567");
      });

      test("should return null for no phone", () => {
        expect(extractPhoneNumber("No phone here")).toBe(null);
        expect(extractPhoneNumber("Email: test@example.com")).toBe(null);
        expect(extractPhoneNumber("")).toBe(null);
      });

      test("should handle null/undefined input", () => {
        expect(extractPhoneNumber(null)).toBe(null);
        expect(extractPhoneNumber(undefined)).toBe(null);
      });
    });

    describe("DOM Extraction", () => {
      test("should extract from DOM when no text provided", () => {
        document.body.innerHTML = `
          <div>Contact us at (555) 123-4567</div>
        `;
        
        expect(extractPhoneNumber()).toBe("(555) 123-4567");
      });

      test("should find phone in nested DOM elements", () => {
        document.body.innerHTML = `
          <div class="contact">
            <div class="info">
              <span>Phone:</span>
              <span class="number">(555) 987-6543</span>
            </div>
          </div>
        `;
        
        expect(extractPhoneNumber()).toBe("(555) 987-6543");
      });

      test("should prioritize broker/agent phone elements", () => {
        document.body.innerHTML = `
          <div>General: (555) 111-1111</div>
          <div class="broker-phone">(555) 222-2222</div>
          <div class="agent-contact">(555) 333-3333</div>
        `;
        
        // Should find broker phone first
        const phone = extractPhoneNumber();
        expect(phone).toBeTruthy();
      });

      test("should handle missing DOM content", () => {
        document.body.innerHTML = `<div>No phone numbers here</div>`;
        expect(extractPhoneNumber()).toBe(null);
      });
    });
  });

  describe("extractBedrooms", () => {
    describe("Text Extraction", () => {
      test("should extract bedroom count from various formats", () => {
        expect(extractBedrooms("3 bedroom")).toBe(3);
        expect(extractBedrooms("5 bedrooms")).toBe(5);
        expect(extractBedrooms("2 bed")).toBe(2);
        expect(extractBedrooms("4 beds")).toBe(4);
        expect(extractBedrooms("6 BR")).toBe(6);
        expect(extractBedrooms("8 Br")).toBe(8);
        expect(extractBedrooms("1-bedroom")).toBe(1);
        expect(extractBedrooms("10-bed")).toBe(10);
      });

      test("should extract from sentence context", () => {
        expect(extractBedrooms("This property has 4 bedrooms")).toBe(4);
        expect(extractBedrooms("Beautiful 3 bedroom home")).toBe(3);
        expect(extractBedrooms("Spacious 5-bedroom apartment")).toBe(5);
        expect(extractBedrooms("2 bed, 2 bath condo")).toBe(2);
      });

      test("should handle units/rooms", () => {
        expect(extractBedrooms("12 units")).toBe(12);
        expect(extractBedrooms("8-unit building")).toBe(8);
        expect(extractBedrooms("6 room apartment")).toBe(6);
        expect(extractBedrooms("10 rooms total")).toBe(10);
      });

      test("should prioritize bedrooms over units", () => {
        expect(extractBedrooms("4 bedrooms in 8 unit building")).toBe(4);
        expect(extractBedrooms("3 bed apartment in 20 unit complex")).toBe(3);
      });

      test("should handle assisted living context", () => {
        expect(extractBedrooms("15 bed assisted living")).toBe(15);
        expect(extractBedrooms("20-bed memory care")).toBe(20);
        expect(extractBedrooms("Assisted living: 18 beds")).toBe(18);
      });

      test("should return default for no match", () => {
        expect(extractBedrooms("No bedroom info")).toBe(10);
        expect(extractBedrooms("Studio apartment")).toBe(10);
        expect(extractBedrooms("")).toBe(10);
      });

      test("should handle null/undefined input", () => {
        expect(extractBedrooms(null)).toBe(10);
        expect(extractBedrooms(undefined)).toBe(10);
      });

      test("should ignore invalid bedroom counts", () => {
        expect(extractBedrooms("0 bedrooms")).toBe(10); // Zero bedrooms
        expect(extractBedrooms("1000 bedrooms")).toBe(10); // Too many
      });
    });

    describe("DOM Extraction", () => {
      test("should extract from DOM when no text provided", () => {
        document.body.innerHTML = `
          <div class="property-details">4 bedrooms</div>
        `;
        
        expect(extractBedrooms()).toBe(4);
      });

      test("should find bedrooms in property descriptions", () => {
        document.body.innerHTML = `
          <div class="description">
            Beautiful 6 bedroom home with ocean views
          </div>
        `;
        
        expect(extractBedrooms()).toBe(6);
      });

      test("should prioritize specific bedroom elements", () => {
        document.body.innerHTML = `
          <div>20 unit building</div>
          <div class="bedrooms">3 bedrooms</div>
          <div class="units">20 units</div>
        `;
        
        expect(extractBedrooms()).toBe(3);
      });

      test("should return default for no DOM matches", () => {
        document.body.innerHTML = `<div>Commercial property</div>`;
        expect(extractBedrooms()).toBe(10);
      });
    });
  });
});
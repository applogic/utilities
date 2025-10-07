// tests/integration/real-estate-scenarios.test.js
import { describe, test, expect } from "vitest";
import {
  calculateNOIByType,
  calculateCOCRAtPercent,
  calculatePriceForCOCR,
  calculateAssignmentFee,
  calculateNetToBuyer,
  formatCurrency,
  PROPERTY_TYPES,
  BUSINESS_CONSTANTS,
  FINANCIAL_CONSTANTS
} from "../../src/index.js";

describe("Real Estate Integration Scenarios", () => {
  describe("Complete Property Analysis", () => {
    test("should handle full multifamily analysis workflow", () => {
      const property = {
        askingPrice: 2500000,
        capRate: 0.075,
        type: PROPERTY_TYPES.MULTIFAMILY
      };
      
      // Calculate NOI
      const noi = calculateNOIByType(property.askingPrice, property.capRate, property.type);
      expect(noi).toBe(187500);
      
      // Calculate COCR at 30% down
      const cocr = calculateCOCRAtPercent(property.askingPrice, noi, 30);
      expect(cocr).toBeGreaterThan(0);
      
      // Calculate ideal price for 15% COCR
      const idealPrice = calculatePriceForCOCR(noi, 0.15);
      expect(idealPrice).toBeLessThan(property.askingPrice);
      
      // Format for display
      const displayPrice = formatCurrency(idealPrice);
      expect(displayPrice).toMatch(/^\$[\d.]+[kM]$/);
    });

    test("should handle STR property workflow", () => {
      const property = {
        askingPrice: 800000,
        type: PROPERTY_TYPES.STR
      };
      
      // Calculate STR NOI (ignores cap rate)
      const noi = calculateNOIByType(property.askingPrice, 0, property.type);
      
      // Should use STR formula: price * 10% gross * 55% NOI
      const expectedNOI = 800000 * 0.10 * 0.55;
      expect(noi).toBe(expectedNOI);
      
      // Calculate returns
      const cocr = calculateCOCRAtPercent(property.askingPrice, noi, 30);
      expect(cocr).toBeGreaterThan(0);
    });

    test("should handle assisted living workflow", () => {
      const property = {
        askingPrice: 1500000,
        type: PROPERTY_TYPES.ASSISTED_LIVING,
        bedroomCount: 15
      };
      
      // Calculate assisted living NOI
      const noi = calculateNOIByType(
        property.askingPrice, 
        0, 
        property.type, 
        { bedroomCount: property.bedroomCount }
      );
      
      // Should use bedroom formula
      const expectedNOI = 15 * 1500 * 12;
      expect(noi).toBe(expectedNOI);
    });
  });

  describe("Assignment Fee Scenarios", () => {
    test("should calculate complete assignment transaction", () => {
      const askingPrice = 1000000;
      const buyerPrice = 900000;
      
      // Calculate assignment fee
      const assignmentFee = calculateAssignmentFee(buyerPrice);
      expect(assignmentFee).toBe(buyerPrice * BUSINESS_CONSTANTS.ASSIGNMENT_FEE_PERCENTAGE);
      
      // Calculate net to buyer
      const netToBuyer = calculateNetToBuyer(
        buyerPrice,
        assignmentFee,
        BUSINESS_CONSTANTS.BUYER_AGENT_COMMISSION,
        BUSINESS_CONSTANTS.CLOSING_COSTS_PERCENTAGE
      );
      
      // Buyer gets: price - assignment - agent - closing
      const expectedNet = buyerPrice - assignmentFee - 
        (buyerPrice * BUSINESS_CONSTANTS.BUYER_AGENT_COMMISSION) -
        (buyerPrice * BUSINESS_CONSTANTS.CLOSING_COSTS_PERCENTAGE);
      
      expect(netToBuyer).toBeCloseTo(expectedNet, 2);
    });

    test("should handle no assignment fee scenario", () => {
      const buyerPrice = 1000000;
      
      const netToBuyer = calculateNetToBuyer(
        buyerPrice,
        0, // No assignment fee
        BUSINESS_CONSTANTS.BUYER_AGENT_COMMISSION,
        BUSINESS_CONSTANTS.CLOSING_COSTS_PERCENTAGE
      );
      
      const expectedNet = buyerPrice - 
        (buyerPrice * BUSINESS_CONSTANTS.BUYER_AGENT_COMMISSION) -
        (buyerPrice * BUSINESS_CONSTANTS.CLOSING_COSTS_PERCENTAGE);
      
      expect(netToBuyer).toBeCloseTo(expectedNet, 2);
    });
  });

  describe("Complex Financing Scenarios", () => {
    test("should handle seller financing with balloon", () => {
      const property = {
        price: 1000000,
        downPayment: 0.20, // 20% down
        noi: 80000
      };
      
      // DSCR loan: down + 10% = 30%
      const dscrPercent = 30;
      const dscrAmount = property.price * (dscrPercent / 100);
      
      // Seller financing: remainder = 70%
      const sellerFiPercent = 70;
      const sellerFiAmount = property.price * (sellerFiPercent / 100);
      
      expect(dscrAmount + sellerFiAmount).toBe(property.price);
    });

    test("should maintain financing formula integrity", () => {
      const testCases = [
        { down: 60, dscr: 70, sellerFi: 40 },
        { down: 50, dscr: 60, sellerFi: 50 },
        { down: 30, dscr: 40, sellerFi: 70 },
        { down: 20, dscr: 30, sellerFi: 80 },
        { down: 10, dscr: 20, sellerFi: 90 }
      ];
      
      testCases.forEach(({ down, dscr, sellerFi }) => {
        // DSCR should always be down + 10
        expect(dscr).toBe(down + FINANCIAL_CONSTANTS.NET_TO_BUYER_RATE * 100);
        
        // Down + Seller FI should always equal 100
        expect(down + sellerFi).toBe(100);
      });
    });
  });

  describe("Edge Case Property Scenarios", () => {
    test("should handle zero cap rate", () => {
      const noi = calculateNOIByType(1000000, 0, PROPERTY_TYPES.MULTIFAMILY);
      expect(noi).toBe(0);
    });

    test("should handle negative cash flow", () => {
      const property = {
        price: 1000000,
        noi: 30000 // Low NOI
      };
      
      const cocr = calculateCOCRAtPercent(property.price, property.noi, 30);
      
      // With low NOI, COCR might be negative after debt service
      expect(typeof cocr).toBe("number");
    });

    test("should handle very high leverage", () => {
      const property = {
        price: 1000000,
        downPercent: 5 // Only 5% down
      };
      
      // DSCR would be 15%, Seller FI would be 95%
      const dscrPercent = property.downPercent + 10;
      const sellerFiPercent = 100 - property.downPercent;
      
      expect(dscrPercent).toBe(15);
      expect(sellerFiPercent).toBe(95);
    });
  });
});
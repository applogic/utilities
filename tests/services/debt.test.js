import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchDebt } from "../../src/services/debt.js";

function mockFetch(impl) {
  global.fetch = vi.fn(impl);
}

afterEach(() => {
  vi.restoreAllMocks();
  delete global.fetch;
});

const BLUCHER = {
  address: "10521 Blucher Ave, Granada Hills, CA, 91344",
  estimatedMortgageBalance: 380084,
  currentMortgages: [{ amount: 440000, position: "First", loanType: "Conventional", lenderName: "Logix Fcu" }],
};

describe("fetchDebt", () => {
  test("normalizes a successful numeric response and marks source 'api'", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => BLUCHER }));
    const result = await fetchDebt("10521 Blucher Ave, Granada Hills, CA, 91344");
    expect(result.estimatedMortgageBalance).toBe(380084);
    expect(result.currentMortgages).toHaveLength(1);
    expect(result.address).toBe(BLUCHER.address);
    expect(result.source).toBe("api");
  });

  test("marks source 'estimated' when the service returns no numeric balance", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ address: "x", currentMortgages: [] }) }));
    const result = await fetchDebt("x");
    expect(result.estimatedMortgageBalance).toBeNull();
    expect(result.source).toBe("estimated");
  });

  test("defaults currentMortgages to an empty array when absent", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ estimatedMortgageBalance: 100 }) }));
    const result = await fetchDebt("y");
    expect(result.currentMortgages).toEqual([]);
  });

  test("throws on a non-OK response so the caller can use the estimated fallback", async () => {
    mockFetch(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    await expect(fetchDebt("z")).rejects.toThrow("HTTP error! status: 502");
  });

  test("hits the /debt endpoint with the encoded address and honors baseUrl", async () => {
    const spy = vi.fn(async () => ({ ok: true, status: 200, json: async () => BLUCHER }));
    mockFetch(spy);
    await fetchDebt("10521 Blucher Ave, Granada Hills, CA, 91344", { baseUrl: "http://localhost:3001" });
    expect(spy).toHaveBeenCalledWith(
      "http://localhost:3001/debt?address=10521%20Blucher%20Ave%2C%20Granada%20Hills%2C%20CA%2C%2091344",
      expect.objectContaining({ method: "GET" })
    );
  });
});

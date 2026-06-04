// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runReveals } from "../../src/browser/widget/runReveals.js";

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runReveals", () => {
  test("clicks the trigger and resolves once waitFor appears", async () => {
    document.body.innerHTML = `<button id="call" class="show-phone">Call</button>`;
    const btn = document.getElementById("call");
    // The click reveals the gated content (simulates the site swapping in a tel: link).
    btn.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = "tel:5105022288";
      a.className = "revealed";
      document.body.appendChild(a);
    });

    const promise = runReveals([
      { name: "phone", trigger: ".show-phone", waitFor: "a.revealed", timeout: 1500 },
    ]);
    await vi.runAllTimersAsync();
    await promise;

    expect(document.querySelector("a.revealed")).not.toBeNull();
  });

  test("is idempotent: skips the click when waitFor is already present", async () => {
    document.body.innerHTML = `
      <a class="revealed" href="tel:5105022288">(510) 502-2288</a>
      <button class="show-phone">Call</button>`;
    const onClick = vi.fn();
    document.querySelector(".show-phone").addEventListener("click", onClick);

    const promise = runReveals([
      { trigger: ".show-phone", waitFor: "a.revealed", timeout: 1500 },
    ]);
    await vi.runAllTimersAsync();
    await promise;

    expect(onClick).not.toHaveBeenCalled();
  });

  test("does nothing when the trigger is absent", async () => {
    const promise = runReveals([{ trigger: ".missing", waitFor: "a.revealed", timeout: 500 }]);
    await vi.runAllTimersAsync();
    await promise;
    expect(document.querySelector("a.revealed")).toBeNull();
  });

  test("resolves at the timeout when waitFor never appears (no hang)", async () => {
    document.body.innerHTML = `<button class="show-phone">Call</button>`;
    const onClick = vi.fn();
    document.querySelector(".show-phone").addEventListener("click", onClick);

    let settled = false;
    const promise = runReveals([
      { trigger: ".show-phone", waitFor: "a.never", timeout: 300 },
    ]).then(() => (settled = true));
    await vi.runAllTimersAsync();
    await promise;

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });

  test("clicks then waits a fixed delay when no waitFor is given", async () => {
    document.body.innerHTML = `<button class="show-phone">Call</button>`;
    const onClick = vi.fn();
    document.querySelector(".show-phone").addEventListener("click", onClick);

    const promise = runReveals([{ trigger: ".show-phone", timeout: 200 }]);
    await vi.runAllTimersAsync();
    await promise;

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("no-ops on an empty / non-array reveals list", async () => {
    await expect(runReveals(undefined)).resolves.toBeUndefined();
    await expect(runReveals([])).resolves.toBeUndefined();
  });

  test("runs multiple reveals in sequence", async () => {
    document.body.innerHTML = `
      <button class="show-phone">Call</button>
      <button class="show-email">Email</button>`;
    const phoneClick = vi.fn(() => {
      const a = document.createElement("a");
      a.href = "tel:5105022288";
      a.className = "rev-phone";
      document.body.appendChild(a);
    });
    const emailClick = vi.fn(() => {
      const span = document.createElement("span");
      span.className = "rev-email";
      document.body.appendChild(span);
    });
    document.querySelector(".show-phone").addEventListener("click", phoneClick);
    document.querySelector(".show-email").addEventListener("click", emailClick);

    const promise = runReveals([
      { name: "phone", trigger: ".show-phone", waitFor: "a.rev-phone", timeout: 1000 },
      { name: "email", trigger: ".show-email", waitFor: ".rev-email", timeout: 1000 },
    ]);
    await vi.runAllTimersAsync();
    await promise;

    expect(phoneClick).toHaveBeenCalledTimes(1);
    expect(emailClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a.rev-phone")).not.toBeNull();
    expect(document.querySelector(".rev-email")).not.toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { consumeWindowLimit } from "./rate-limit.server";

// Module state is a process-local singleton, so each test uses unique keys and a
// long window to avoid cross-test bleed and time-based rollover.
const WINDOW = 60_000;

describe("consumeWindowLimit", () => {
  it("allows up to max requests in a window, then throttles", () => {
    const key = `test-exhaust:${Math.random()}`;
    expect(consumeWindowLimit(key, 3, WINDOW)).toBe(0);
    expect(consumeWindowLimit(key, 3, WINDOW)).toBe(0);
    expect(consumeWindowLimit(key, 3, WINDOW)).toBe(0);
    // 4th call exceeds max -> returns a positive retry-after.
    expect(consumeWindowLimit(key, 3, WINDOW)).toBeGreaterThan(0);
  });

  it("isolates clients by key — one client's burst does not throttle another", () => {
    // Models the per-IP create-league keys: ipA exhausts its budget, ipB is fresh.
    const ipA = `create-league:${Math.random()}`;
    const ipB = `create-league:${Math.random()}`;

    for (let i = 0; i < 6; i++) consumeWindowLimit(ipA, 6, WINDOW);
    expect(consumeWindowLimit(ipA, 6, WINDOW)).toBeGreaterThan(0); // A throttled

    expect(consumeWindowLimit(ipB, 6, WINDOW)).toBe(0); // B unaffected
  });
});

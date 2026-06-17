import { describe, expect, it } from "vitest";
import { DECAY_GRACE_DAYS, applyDecay, decayPenalty, inactivityDays } from "./decay";

describe("inactivityDays", () => {
  it("counts whole days between dates, floored at 0", () => {
    expect(inactivityDays("2024-01-01", "2024-01-31")).toBe(30);
    expect(inactivityDays("2024-01-01", "2024-03-01")).toBe(60);
    // A future last-played (clock skew) never goes negative.
    expect(inactivityDays("2024-02-01", "2024-01-01")).toBe(0);
  });

  it("returns null for missing or unparseable dates", () => {
    expect(inactivityDays(null, "2024-01-01")).toBeNull();
    expect(inactivityDays("not-a-date", "2024-01-01")).toBeNull();
  });
});

describe("decayPenalty", () => {
  it("charges nothing within the grace window", () => {
    expect(decayPenalty(0)).toBe(0);
    expect(decayPenalty(DECAY_GRACE_DAYS)).toBe(0);
    expect(decayPenalty(null)).toBe(0);
  });

  it("grows linearly past the grace window", () => {
    expect(decayPenalty(50)).toBeCloseTo(0.1, 5); // (50-30)*0.005
    expect(decayPenalty(90)).toBeCloseTo(0.3, 5); // (90-30)*0.005
  });

  it("caps at DECAY_MAX", () => {
    expect(decayPenalty(10_000)).toBe(1.0);
  });
});

describe("applyDecay", () => {
  it("leaves a fresh rating untouched", () => {
    expect(applyDecay(5.4, 10)).toBe(5.4);
    expect(applyDecay(5.4, null)).toBe(5.4);
  });

  it("subtracts the penalty and rounds to one decimal", () => {
    expect(applyDecay(5.4, 90)).toBeCloseTo(5.1, 5); // 5.4 - 0.3
  });

  it("never falls below zero", () => {
    expect(applyDecay(0.4, 10_000)).toBe(0);
  });
});

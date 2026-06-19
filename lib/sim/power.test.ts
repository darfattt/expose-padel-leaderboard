import { describe, expect, it } from "vitest";
import type { Attributes } from "../archetype";
import { computeMatchEdge, overallAttribute, type PowerInput, staminaFor } from "./power";

const FLAT: Attributes = { attack: 50, defense: 50, consistency: 50, clutch: 50, win: 50 };

// A neutral, evenly-matched side; spread over fields to vary one signal at a time.
function input(over: Partial<PowerInput> = {}): PowerInput {
  return {
    attributes: FLAT,
    rank: 5,
    fieldSize: 10,
    experienceGames: 30,
    hasRacket: false,
    racketStyle: null,
    form: 0.5,
    morale: 0,
    ...over,
  };
}

describe("overallAttribute", () => {
  it("is the flat value for a flat radar and rises with a better radar", () => {
    expect(overallAttribute(FLAT)).toBeCloseTo(50, 5);
    expect(overallAttribute({ ...FLAT, win: 100, consistency: 100 })).toBeGreaterThan(50);
  });
});

describe("staminaFor", () => {
  it("climbs with consistency and with mileage, capped at 100", () => {
    expect(staminaFor(80, 100)).toBeGreaterThan(staminaFor(40, 100));
    expect(staminaFor(50, 400)).toBeGreaterThan(staminaFor(50, 0));
    expect(staminaFor(100, 100000)).toBeLessThanOrEqual(100);
  });
});

describe("computeMatchEdge", () => {
  it("leaves the base untouched when the two sides are identical", () => {
    const edge = computeMatchEdge(input(), input(), 0.5);
    expect(edge.baseTarget).toBe(0.5);
    expect(edge.target).toBeCloseTo(0.5, 6);
    expect(edge.factors).toHaveLength(0); // nothing separates them
  });

  it("preserves the base it was handed", () => {
    expect(computeMatchEdge(input(), input(), 0.73).baseTarget).toBe(0.73);
  });

  it("a sharper radar lifts A's win chance", () => {
    const edge = computeMatchEdge(input({ attributes: { ...FLAT, win: 95, attack: 90 } }), input(), 0.5);
    expect(edge.target).toBeGreaterThan(0.5);
    const attr = edge.factors.find((f) => f.key === "attributes");
    expect(attr?.delta).toBeGreaterThan(0);
  });

  it("owning a racket beats going bare", () => {
    const edge = computeMatchEdge(input({ hasRacket: true, racketStyle: "power" }), input(), 0.5);
    expect(edge.target).toBeGreaterThan(0.5);
    expect(edge.factors.find((f) => f.key === "gear")?.delta).toBeGreaterThan(0);
  });

  it("higher gear is more powerful: a better-rated frame out-guns a lesser one", () => {
    const gearDelta = (over: Partial<PowerInput>) =>
      computeMatchEdge(input({ hasRacket: true, ...over }), input({ hasRacket: true }), 0.5).factors.find(
        (f) => f.key === "gear"
      )?.delta ?? 0;
    // Both armed; quality climbs monotonically: top frame > mid frame > unrated.
    expect(gearDelta({ gearRating: 9.5 })).toBeGreaterThan(gearDelta({ gearRating: 7 }));
    expect(gearDelta({ gearRating: 7 })).toBeGreaterThan(gearDelta({})); // 7/10 frame beats an unrated one
    // A top-rated weapon lifts A's win chance outright over an identical bare-handed prior.
    expect(
      computeMatchEdge(input({ hasRacket: true, gearRating: 9.5 }), input({ hasRacket: true }), 0.5).target
    ).toBeGreaterThan(0.5);
  });

  it("more experience, hotter form and a fuller badge wall each favour A", () => {
    expect(computeMatchEdge(input({ experienceGames: 300 }), input({ experienceGames: 2 }), 0.5).target).toBeGreaterThan(0.5);
    expect(computeMatchEdge(input({ form: 1 }), input({ form: 0 }), 0.5).target).toBeGreaterThan(0.5);
    expect(computeMatchEdge(input({ morale: 12 }), input({ morale: -6 }), 0.5).target).toBeGreaterThan(0.5);
  });

  it("a better-equipped underdog can flip a coin-flip rating", () => {
    // Same rating prior (0.5), but B is the more complete player everywhere.
    const a = input();
    const b = input({
      attributes: { ...FLAT, win: 90, attack: 85, consistency: 80 },
      hasRacket: true,
      racketStyle: "control",
      experienceGames: 250,
      form: 0.9,
      morale: 10,
      rank: 1,
    });
    expect(computeMatchEdge(a, b, 0.5).target).toBeLessThan(0.5);
  });

  it("the combined swing is bounded — it can't fabricate a blowout from nowhere", () => {
    const monster = input({
      attributes: { attack: 100, defense: 100, consistency: 100, clutch: 100, win: 100 },
      hasRacket: true,
      racketStyle: "power",
      experienceGames: 100000,
      form: 1,
      morale: 100,
      rank: 1,
    });
    const minnow = input({
      attributes: { attack: 0, defense: 0, consistency: 0, clutch: 0, win: 0 },
      hasRacket: false,
      experienceGames: 0,
      form: 0,
      morale: -100,
      rank: 10,
    });
    const edge = computeMatchEdge(monster, minnow, 0.5);
    // MAX_SWING is 1.6 logit on top of base 0 → sigmoid(1.6) ≈ 0.832.
    expect(edge.target).toBeGreaterThan(0.7);
    expect(edge.target).toBeLessThanOrEqual(0.834);
  });

  it("orders factors by magnitude and reports them in win-percent points", () => {
    const edge = computeMatchEdge(input({ form: 1, morale: 12, hasRacket: true, racketStyle: "power" }), input({ form: 0 }), 0.5);
    expect(edge.factors.length).toBeGreaterThan(0);
    for (let i = 1; i < edge.factors.length; i++) {
      expect(Math.abs(edge.factors[i - 1].delta)).toBeGreaterThanOrEqual(Math.abs(edge.factors[i].delta));
    }
  });
});

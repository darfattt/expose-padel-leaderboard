import { describe, expect, it } from "vitest";
import type { Attributes } from "./archetype";
import { racketCriteria, racketLevel, racketPlayStyle } from "./racket-reco";

function attrs(partial: Partial<Attributes>): Attributes {
  return { attack: 50, defense: 50, consistency: 50, clutch: 50, win: 50, ...partial };
}

describe("racketLevel", () => {
  it("bands the rating onto the API's three levels", () => {
    expect(racketLevel(0)).toBe("beginner");
    expect(racketLevel(3.4)).toBe("beginner");
    expect(racketLevel(3.5)).toBe("intermediate");
    expect(racketLevel(6.4)).toBe("intermediate");
    expect(racketLevel(6.5)).toBe("advanced");
    expect(racketLevel(10)).toBe("advanced");
  });
});

describe("racketPlayStyle", () => {
  it("leans power when attack clears consistency", () => {
    expect(racketPlayStyle(attrs({ attack: 80, consistency: 40 }))).toBe("power");
  });

  it("leans control when consistency clears attack", () => {
    expect(racketPlayStyle(attrs({ attack: 40, consistency: 80 }))).toBe("control");
  });

  it("stays balanced for a near-tie", () => {
    expect(racketPlayStyle(attrs({ attack: 55, consistency: 50 }))).toBe("balanced");
    expect(racketPlayStyle(attrs({ attack: 50, consistency: 50 }))).toBe("balanced");
  });
});

describe("racketCriteria", () => {
  it("combines level and play style", () => {
    expect(racketCriteria(7.2, attrs({ attack: 85, consistency: 45 }))).toEqual({
      level: "advanced",
      playStyle: "power",
    });
  });
});

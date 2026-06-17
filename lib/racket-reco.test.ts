import { describe, expect, it } from "vitest";
import type { Attributes } from "./archetype";
import {
  ownedRacketContrast,
  playStyleBlurb,
  racketCriteria,
  racketLevel,
  racketPlayStyle,
  shapeToStyle,
} from "./racket-reco";

function attrs(partial: Partial<Attributes>): Attributes {
  return { attack: 50, defense: 50, consistency: 50, clutch: 50, win: 50, ...partial };
}

describe("racketLevel", () => {
  it("bands the rating onto the API's three levels", () => {
    expect(racketLevel(0)).toBe("beginner");
    expect(racketLevel(2.4)).toBe("beginner");
    expect(racketLevel(2.5)).toBe("intermediate");
    expect(racketLevel(4.9)).toBe("intermediate");
    expect(racketLevel(5)).toBe("advanced");
    expect(racketLevel(7)).toBe("advanced");
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

  it("lets above-average clutch tip a flat profile to power", () => {
    // Neutral attack/consistency, but a strong finisher → power frame.
    expect(racketPlayStyle(attrs({ attack: 50, consistency: 50, clutch: 90 }))).toBe("power");
  });

  it("does not let weak clutch force control", () => {
    // Below-average clutch is one-directional: it never subtracts.
    expect(racketPlayStyle(attrs({ attack: 50, consistency: 50, clutch: 0 }))).toBe("balanced");
  });
});

describe("shapeToStyle", () => {
  it("maps frame shapes onto the power/control axis", () => {
    expect(shapeToStyle("Diamond")).toBe("power");
    expect(shapeToStyle("Round")).toBe("control");
    expect(shapeToStyle("Teardrop")).toBe("balanced");
    expect(shapeToStyle("Hybrid")).toBe("balanced");
  });

  it("returns null for unknown or absent shapes", () => {
    expect(shapeToStyle(null)).toBeNull();
    expect(shapeToStyle("Oval")).toBeNull();
  });
});

describe("playStyleBlurb", () => {
  it("gives a distinct line per style", () => {
    const lines = new Set([
      playStyleBlurb("power"),
      playStyleBlurb("control"),
      playStyleBlurb("balanced"),
    ]);
    expect(lines.size).toBe(3);
  });
});

describe("ownedRacketContrast", () => {
  it("reassures when the owned frame matches the player's style", () => {
    expect(ownedRacketContrast("power", "power", "Adidas Metalbone")).toBe(
      "Your Adidas Metalbone already suits your power game."
    );
  });

  it("flags a mismatch and names both styles", () => {
    expect(ownedRacketContrast("control", "power", "Adidas Metalbone")).toBe(
      "You play control, but your Adidas Metalbone leans power — these picks fit your game better."
    );
  });

  it("stays silent when the owned frame's style is unknown", () => {
    expect(ownedRacketContrast("power", null, "Mystery Racket")).toBeNull();
  });
});

describe("racketCriteria", () => {
  it("combines level and play style", () => {
    expect(racketCriteria(5.5, attrs({ attack: 85, consistency: 45 }))).toEqual({
      level: "advanced",
      playStyle: "power",
    });
  });
});

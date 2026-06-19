import { describe, expect, it } from "vitest";
import type { Attributes } from "../archetype";
import { gearMoniker, type KudosKind, signatureKudos, teamSkills } from "./skills";

const FLAT: Attributes = { attack: 50, defense: 50, consistency: 50, clutch: 50, win: 50 };

describe("gearMoniker", () => {
  it("drops a redundant leading brand and keeps the model", () => {
    expect(gearMoniker("Bullpadel Vertex 04 Air", "Bullpadel")).toBe("Vertex 04");
    expect(gearMoniker("Nox AT10 Genius 18K", "Nox")).toBe("AT10 Genius");
  });

  it("keeps at most two tokens and survives a missing/odd brand", () => {
    expect(gearMoniker("Adidas Metalbone")).toBe("Adidas Metalbone");
    expect(gearMoniker("Solo", "Solo")).toBe("Solo"); // never empties out
    expect(gearMoniker("  Spaced   Name  ")).toBe("Spaced Name");
  });
});

describe("teamSkills personalisation", () => {
  it("personalises the racket move with the gear moniker", () => {
    const skills = teamSkills("power", "attack", { gearMoniker: "Vertex 04" });
    const racket = skills.find((s) => s.source === "racket");
    expect(racket?.name).toBe("Vertex 04 Smash");
    expect(racket?.fx).toBe("cannon");
  });

  it("maps each play-style suffix and falls back to the base name without gear", () => {
    expect(teamSkills("power", "attack").find((s) => s.source === "racket")?.name).toBe("Fire Serve");
    expect(teamSkills("control", "attack", { gearMoniker: "Wall" }).find((s) => s.source === "racket")?.name).toBe(
      "Wall Block"
    );
    expect(teamSkills("balanced", "attack", { gearMoniker: "Mid" }).find((s) => s.source === "racket")?.name).toBe(
      "Mid Return"
    );
  });

  it("adds a kudos signature skill carrying an fx token", () => {
    const skills = teamSkills("power", "attack", { kudos: "volley" });
    const kudos = skills.find((s) => s.source === "kudos");
    expect(kudos?.name).toBe("Net Storm");
    expect(kudos?.fx).toBe("volley");
    expect(kudos?.member).toBe(0);
  });

  it("does not duplicate a kudos move that repeats the racket move name", () => {
    // A control frame's fallback is "Great Wall"; a defense kudos is also "Great Wall".
    const skills = teamSkills("control", "attack", { kudos: "defense" });
    expect(skills.filter((s) => s.name === "Great Wall")).toHaveLength(1);
  });

  it("every skill carries a non-empty fx token", () => {
    const skills = teamSkills("power", "clutch", { gearMoniker: "X", kudos: "lob" });
    for (const s of skills) expect(s.fx.length).toBeGreaterThan(0);
  });
});

describe("signatureKudos", () => {
  it("is deterministic for the same grounded inputs", () => {
    expect(signatureKudos(FLAT, "attack", "power")).toBe(signatureKudos(FLAT, "attack", "power"));
  });

  it("covers each mandatory Reclub category from a plausible profile", () => {
    const got = new Set<KudosKind>();
    got.add(signatureKudos({ ...FLAT, defense: 80, attack: 50 }, "defense", "control")); // defense
    got.add(signatureKudos({ ...FLAT, consistency: 75 }, "consistency", "balanced")); // lob
    got.add(signatureKudos({ ...FLAT, consistency: 40 }, "consistency", "control")); // return
    got.add(signatureKudos({ ...FLAT, clutch: 60, consistency: 80 }, "win", "balanced")); // backhand
    got.add(signatureKudos({ ...FLAT, clutch: 80, consistency: 50 }, "win", "balanced")); // forehand
    got.add(signatureKudos(FLAT, "balanced", null)); // volley
    for (const k of ["defense", "lob", "return", "backhand", "forehand", "volley"] as KudosKind[]) {
      expect(got.has(k)).toBe(true);
    }
  });

  it("a power-frame attacker smashes; a clutch closer ices the big points", () => {
    expect(signatureKudos({ ...FLAT, attack: 85 }, "attack", "power")).toBe("smash");
    expect(signatureKudos({ ...FLAT, clutch: 90 }, "clutch", "balanced")).toBe("bandeja");
  });

  it("an overwhelming attacker graduates to a multi-ball signature", () => {
    // A dominant power attacker buries them under a barrage of balls...
    expect(signatureKudos({ ...FLAT, attack: 92, clutch: 78 }, "attack", "power")).toBe("barrage");
    // ...but a power attacker who isn't clutch enough still just smashes.
    expect(signatureKudos({ ...FLAT, attack: 92, clutch: 60 }, "attack", "power")).toBe("smash");
    // A devastating all-round finisher (no power frame) rains a meteor shower.
    expect(signatureKudos({ ...FLAT, attack: 85, clutch: 85 }, "win", "balanced")).toBe("meteor");
  });
});

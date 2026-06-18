import { describe, expect, it } from "vitest";
import type { Attributes } from "../archetype";
import { avatarFromName } from "./avatar";
import { teamSkills } from "./skills";
import { blendStats, buildTeam, powerInput, proFloor, type TeamPlayer } from "./team";

const FLAT: Attributes = { attack: 50, defense: 50, consistency: 50, clutch: 50, win: 50 };

describe("proFloor", () => {
  it("maps rank 1 → 100 and rank 90 → 55", () => {
    expect(proFloor(1)).toBeCloseTo(100, 5);
    expect(proFloor(90)).toBeCloseTo(55, 5);
  });

  it("is monotonic decreasing and clamps out-of-range ranks", () => {
    expect(proFloor(0)).toBe(proFloor(1));
    expect(proFloor(200)).toBe(proFloor(90));
    expect(proFloor(10)).toBeGreaterThan(proFloor(50));
  });
});

describe("blendStats", () => {
  it("is 70% player + 30% pro floor", () => {
    const s = blendStats({ ...FLAT, attack: 100 }, 1); // floor 100
    expect(s.attack).toBeCloseTo(0.7 * 100 + 0.3 * 100, 5); // 100
    expect(s.win).toBeCloseTo(0.7 * 50 + 0.3 * 100, 5); // 65
  });

  it("a weak pro still raises a weak player's floor", () => {
    const s = blendStats({ ...FLAT, attack: 0 }, 90); // floor 55
    expect(s.attack).toBeCloseTo(0.7 * 0 + 0.3 * 55, 5); // 16.5
    expect(s.attack).toBeGreaterThan(0);
  });

  it("exposes a stamina axis that climbs with match mileage", () => {
    const rookie = blendStats(FLAT, 45, 0);
    const veteran = blendStats(FLAT, 45, 400);
    expect(rookie.stamina).toBeGreaterThan(0);
    expect(veteran.stamina).toBeGreaterThan(rookie.stamina);
    expect(veteran.stamina).toBeLessThanOrEqual(100);
  });
});

describe("powerInput", () => {
  const base: TeamPlayer = {
    name: "Rich",
    rating: 4.0,
    attributes: { ...FLAT, attack: 80 },
    archetypePrimary: "attack",
    hasRacket: true,
    rank: 2,
    fieldSize: 20,
    experienceGames: 60,
    form: 0.8,
    morale: 5,
  };

  it("carries the rich fields through and derives a racket style", () => {
    const pi = powerInput(base);
    expect(pi.rank).toBe(2);
    expect(pi.fieldSize).toBe(20);
    expect(pi.experienceGames).toBe(60);
    expect(pi.form).toBe(0.8);
    expect(pi.morale).toBe(5);
    expect(pi.racketStyle).not.toBeNull();
  });

  it("defaults a bare player to neutral/unproven and drops the racket style", () => {
    const pi = powerInput({
      name: "Bare",
      rating: 3,
      attributes: FLAT,
      archetypePrimary: "balanced",
      hasRacket: false,
    });
    expect(pi.rank).toBeNull();
    expect(pi.experienceGames).toBe(0);
    expect(pi.form).toBe(0.5);
    expect(pi.morale).toBe(0);
    expect(pi.racketStyle).toBeNull();
  });
});

describe("teamSkills", () => {
  it("includes the racket skill when a style is given", () => {
    const skills = teamSkills("power", "attack");
    expect(skills.find((s) => s.source === "racket")?.name).toBe("Cannon Smash");
    expect(skills.find((s) => s.source === "pro")).toBeTruthy();
  });

  it("omits the racket skill when style is null (no gear set)", () => {
    const skills = teamSkills(null, "clutch");
    expect(skills.some((s) => s.source === "racket")).toBe(false);
    expect(skills.find((s) => s.source === "pro")?.name).toBe("Ice Bandeja");
  });
});

describe("avatarFromName", () => {
  it("is deterministic for a given name", () => {
    expect(avatarFromName("Ada Lovelace")).toEqual(avatarFromName("Ada Lovelace"));
  });

  it("honours a kit override but keeps other traits name-derived", () => {
    const base = avatarFromName("Grace Hopper");
    const tinted = avatarFromName("Grace Hopper", "#123456");
    expect(tinted.kit).toBe("#123456");
    expect(tinted.skin).toBe(base.skin);
    expect(tinted.stance).toBe(base.stance);
  });
});

describe("buildTeam", () => {
  const p: TeamPlayer = {
    name: "Local Hero",
    rating: 5.0,
    attributes: FLAT,
    archetypePrimary: "clutch",
    hasRacket: true,
  };

  it("picks a rank-appropriate pro and a valid rank", () => {
    const team = buildTeam(p, "A", "#003c33");
    expect(team.proName.length).toBeGreaterThan(0);
    expect(team.proRank).toBeGreaterThanOrEqual(1);
    expect(team.proRank).toBeLessThanOrEqual(90);
    expect(team.avatars).toHaveLength(2);
  });

  it("drops the racket skill when the player has no racket", () => {
    const team = buildTeam({ ...p, hasRacket: false }, "B", "#ff7759");
    expect(team.skills.some((s) => s.source === "racket")).toBe(false);
  });

  it("is deterministic for the same input", () => {
    expect(JSON.stringify(buildTeam(p, "A", "#003c33"))).toEqual(
      JSON.stringify(buildTeam(p, "A", "#003c33"))
    );
  });
});

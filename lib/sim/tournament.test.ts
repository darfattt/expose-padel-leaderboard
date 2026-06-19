import { describe, expect, it } from "vitest";
import type { Attributes } from "../archetype";
import {
  assignPros,
  buildTournament,
  pickOpponentIds,
  playMatch,
  seedTournament,
  type TournamentEntry,
} from "./tournament";

const FLAT: Attributes = { attack: 50, defense: 50, consistency: 50, clutch: 50, win: 50 };

// A field of eight entrants at descending ratings. Everyone has gear unless the
// individual test strips it. Ids are stable so seeding is reproducible.
function field(overrides: Partial<TournamentEntry>[] = []): TournamentEntry[] {
  return Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    rating: 5.5 - i * 0.4,
    attributes: { ...FLAT },
    archetypePrimary: "balanced" as const,
    hasRacket: true,
    rank: i + 1,
    fieldSize: 8,
    experienceGames: 40,
    form: 0.5,
    morale: 0,
    gender: "male" as const,
    ...overrides[i],
  }));
}

describe("assignPros", () => {
  it("never hands two entrants the same pro partner", () => {
    // Bunch everyone at one rating + archetype so they'd all draw the same top
    // candidate — de-dup must spread them across the candidate window instead.
    const same = field(Array.from({ length: 8 }, () => ({ rating: 4.0 })));
    const pros = assignPros(same);
    const names = [...pros.values()].map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("recovers a real FIP rank for each assigned pro", () => {
    const pros = assignPros(field());
    for (const p of pros.values()) {
      expect(p.rank).toBeGreaterThanOrEqual(1);
      expect(p.rank).toBeLessThanOrEqual(90);
    }
  });
});

describe("playMatch — gearless death", () => {
  const teams = seedTournament(field(), "p0", 1);
  const geared = teams[0];
  // A clone of slot 1 with the racket stripped.
  const bare = {
    ...teams[1],
    entry: { ...teams[1].entry, hasRacket: false },
  };

  it("a geared side shuts out a gearless one", () => {
    const { result } = playMatch(geared, bare, 7, "QF", 0, 1);
    expect(result.winner).toBe("A"); // geared side
    expect(result.gearlessSide).toBe("B");
    // Near-certain win → a blowout, not a squeaker.
    expect(result.games[0].a).toBeGreaterThan(result.games[0].b);
    expect(result.games[0].a - result.games[0].b).toBeGreaterThan(10);
  });

  it("the gearless side dies regardless of which slot it sits in", () => {
    const { result } = playMatch(bare, geared, 7, "QF", 0, 1);
    expect(result.winner).toBe("B"); // the geared side again
    expect(result.gearlessSide).toBe("A");
  });
});

describe("playMatch — best of three", () => {
  it("the final runs first-to-two games", () => {
    const teams = seedTournament(field(), "p0", 3);
    const { result } = playMatch(teams[0], teams[1], 5, "F", 0, 3);
    const total = result.gameWins.a + result.gameWins.b;
    expect(total).toBeGreaterThanOrEqual(2);
    expect(total).toBeLessThanOrEqual(3);
    expect(Math.max(result.gameWins.a, result.gameWins.b)).toBe(2);
    expect(result.games.length).toBe(total);
  });
});

describe("buildTournament", () => {
  it("you take slot 0 and stay on side A of every match you play", () => {
    const t = buildTournament(field(), "p0", 42);
    expect(t.teams[0].isYou).toBe(true);
    for (const round of t.rounds) {
      for (const m of round.matches) {
        if (m.isYours) expect(m.a.isYou).toBe(true);
      }
    }
  });

  it("produces a QF/SF/F shape (4 → 2 → 1 matches)", () => {
    const t = buildTournament(field(), "p0", 42);
    expect(t.rounds.map((r) => r.matches.length)).toEqual([4, 2, 1]);
    expect(t.rounds[2].matches[0].bestOf).toBe(3);
  });

  it("materialises scripts only for your matches", () => {
    const t = buildTournament(field(), "p0", 42);
    for (const round of t.rounds) {
      for (const m of round.matches) {
        if (m.isYours) expect(m.scripts && m.scripts.length).toBeGreaterThan(0);
        else expect(m.scripts).toBeUndefined();
      }
    }
  });

  it("is fully deterministic for a given seed", () => {
    const a = buildTournament(field(), "p0", 99);
    const b = buildTournament(field(), "p0", 99);
    expect(a.champion.entry.id).toBe(b.champion.entry.id);
    expect(a.teams.map((t) => t.entry.id)).toEqual(b.teams.map((t) => t.entry.id));
  });

  it("a different seed reshuffles the field", () => {
    const a = buildTournament(field(), "p0", 1);
    const b = buildTournament(field(), "p0", 2);
    // Slot 0 is always you; the rest should not be identical across seeds.
    const restA = a.teams.slice(1).map((t) => t.entry.id);
    const restB = b.teams.slice(1).map((t) => t.entry.id);
    expect(restA).not.toEqual(restB);
  });

  it("crowns the lone geared entrant when everyone else is barehanded", () => {
    // p0 (you) is the only one with a racket — everyone else dies, so you win it.
    const f = field(Array.from({ length: 8 }, (_, i) => ({ hasRacket: i === 0 })));
    const t = buildTournament(f, "p0", 7);
    expect(t.champion.isYou).toBe(true);
    expect(t.youWonIt).toBe(true);
  });
});

describe("pickOpponentIds", () => {
  const pool = [
    { id: "you", hasGear: true },
    { id: "g1", hasGear: true },
    { id: "g2", hasGear: true },
    { id: "b1", hasGear: false },
    { id: "b2", hasGear: false },
  ];

  it("prioritises geared players and excludes you", () => {
    const picked = pickOpponentIds(pool, "you", 5, 3);
    expect(picked).not.toContain("you");
    expect(picked).toContain("g1");
    expect(picked).toContain("g2");
    // Only two geared others exist, so the third slot falls to a barehanded one.
    expect(picked.length).toBe(3);
    expect(picked.some((id) => id === "b1" || id === "b2")).toBe(true);
  });

  it("is deterministic per seed", () => {
    expect(pickOpponentIds(pool, "you", 11, 3)).toEqual(pickOpponentIds(pool, "you", 11, 3));
  });
});

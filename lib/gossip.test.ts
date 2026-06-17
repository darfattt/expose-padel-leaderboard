import { describe, expect, it } from "vitest";
import {
  buildGossipFacts,
  h2hHook,
  hasGossipMaterial,
  partnerHook,
  rivalryHook,
  venueHook,
} from "./gossip";
import type { MatchHistoryEntry } from "./queries";
import type { PairRecord, PartnerChemistry, Rivalries } from "./relationships";

function rec(p: Partial<PairRecord> & { id: string; name: string }): PairRecord {
  return { games: 0, wins: 0, losses: 0, draws: 0, winRate: 0, pointDiff: 0, ...p };
}

function match(p: Partial<MatchHistoryEntry>): MatchHistoryEntry {
  return {
    matchId: "m",
    eventId: "e",
    eventTitle: "Event",
    location: null,
    playedOn: null,
    round: 1,
    court: 1,
    partner: null,
    partnerId: null,
    opponents: [],
    opponentIds: [],
    points: 0,
    conceded: 0,
    result: "W",
    ...p,
  };
}

describe("partnerHook", () => {
  it("names best and worst when both exist, with their win rates", () => {
    const c: PartnerChemistry = {
      partners: [],
      best: rec({ id: "a", name: "Ann", winRate: 0.8 }),
      worst: rec({ id: "b", name: "Bob", winRate: 0.2 }),
    };
    const hook = partnerHook(c)!;
    expect(hook).toContain("Ann");
    expect(hook).toContain("80%");
    expect(hook).toContain("Bob");
  });

  it("returns null when there's no standout partner", () => {
    expect(partnerHook({ partners: [], best: null, worst: null })).toBeNull();
  });
});

describe("rivalryHook", () => {
  it("calls out the nemesis", () => {
    const r: Rivalries = {
      opponents: [],
      nemesis: rec({ id: "n", name: "Nat", losses: 4, games: 5 }),
      favoriteVictim: null,
    };
    expect(rivalryHook(r)).toContain("Nat");
  });

  it("returns null when there's no rival", () => {
    expect(rivalryHook({ opponents: [], nemesis: null, favoriteVictim: null })).toBeNull();
  });
});

describe("venueHook", () => {
  it("describes the happy hunting ground", () => {
    expect(venueHook(rec({ id: "Court A", name: "Court A", winRate: 0.75 }))).toContain("Court A");
  });
  it("returns null without a venue", () => {
    expect(venueHook(null)).toBeNull();
  });
});

describe("h2hHook", () => {
  const r = (wins: number, losses: number) => rec({ id: "o", name: "Opp", wins, losses });
  it("reflects who leads", () => {
    expect(h2hHook("Me", "Opp", r(3, 1))).toContain("owns this rivalry");
    expect(h2hHook("Me", "Opp", r(1, 3))).toContain("upper hand");
    expect(h2hHook("Me", "Opp", r(2, 2))).toContain("Dead even");
  });
});

describe("hasGossipMaterial / buildGossipFacts", () => {
  // Three games with one fixed partner at one venue: enough to surface a best
  // partner and a happy hunting ground.
  const matches = [1, 2, 3].map((n) =>
    match({
      matchId: `m${n}`,
      round: n,
      location: "Court A",
      partner: "Ann",
      partnerId: "ann",
      opponents: ["Bob"],
      opponentIds: ["bob"],
      points: 6,
      conceded: 2,
      result: "W",
    })
  );

  it("is false with no games and true with relational signal", () => {
    expect(hasGossipMaterial([])).toBe(false);
    expect(hasGossipMaterial(matches)).toBe(true);
  });

  it("builds a grounded fact sheet naming the real partner and venue", () => {
    const facts = buildGossipFacts(matches);
    expect(facts).toContain("Ann");
    expect(facts).toContain("Court A");
  });
});

import { describe, expect, it } from "vitest";
import { type AchievementContext, WEEKLY_HABIT_WEEKS, computeAchievements } from "./achievements";
import type { MatchHistoryEntry } from "./queries";
import type { CareerStatRow } from "./types";

let seq = 0;
function match(p: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry {
  seq += 1;
  return {
    matchId: `m${seq}`,
    eventId: `e${seq}`,
    eventTitle: "Event",
    location: null,
    playedOn: "2024-01-01",
    round: 1,
    court: 1,
    partner: null,
    partnerId: null,
    opponents: [],
    opponentIds: [],
    points: 21,
    conceded: 10,
    result: "W",
    ...p,
  };
}

function career(partial: Partial<CareerStatRow> = {}): CareerStatRow {
  return {
    player_id: "self",
    name: "Self",
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points_for: 0,
    points_against: 0,
    point_diff: 0,
    close_games: 0,
    close_wins: 0,
    score_variance: 0,
    ...partial,
  };
}

function byKey(row: CareerStatRow, matches: MatchHistoryEntry[], ctx?: AchievementContext) {
  return new Map(computeAchievements(row, matches, ctx).map((a) => [a.key, a]));
}

describe("computeAchievements — count badges", () => {
  it("earns Half Century at 50 games and tracks progress before", () => {
    const earned = byKey(career({ games: 50 }), []).get("half-century")!;
    expect(earned.earned).toBe(true);
    expect(earned.progress).toEqual({ current: 50, target: 50 });

    const partial = byKey(career({ games: 20 }), []).get("half-century")!;
    expect(partial.earned).toBe(false);
    expect(partial.progress).toEqual({ current: 20, target: 50 });
  });

  it("clamps progress current to the target once earned", () => {
    const a = byKey(career({ games: 120 }), []).get("centurion")!;
    expect(a.progress).toEqual({ current: 100, target: 100 });
  });

  it("counts distinct events for Regular", () => {
    const matches = [
      match({ eventId: "x" }),
      match({ eventId: "x" }),
      match({ eventId: "y" }),
    ];
    expect(byKey(career(), matches).get("regular")!.progress).toEqual({ current: 2, target: 10 });
  });

  it("earns On Fire on a 10-game win streak", () => {
    const matches = Array.from({ length: 10 }, () => match({ result: "W" }));
    expect(byKey(career(), matches).get("on-fire")!.earned).toBe(true);
  });
});

describe("computeAchievements — binary badges", () => {
  it("earns Sharpshooter on a 10+ point win", () => {
    expect(byKey(career(), [match({ points: 21, conceded: 11 })]).get("sharpshooter")!.earned).toBe(true);
    expect(byKey(career(), [match({ points: 21, conceded: 12 })]).get("sharpshooter")!.earned).toBe(false);
  });

  it("earns Unbeaten Night only when a 3+ game event is swept", () => {
    const swept = [
      match({ eventId: "e", result: "W" }),
      match({ eventId: "e", result: "W" }),
      match({ eventId: "e", result: "W" }),
    ];
    expect(byKey(career(), swept).get("unbeaten")!.earned).toBe(true);

    const blemished = [...swept, match({ eventId: "e", result: "L" })];
    expect(byKey(career(), blemished).get("unbeaten")!.earned).toBe(false);
  });
});

describe("computeAchievements — field-relative badges", () => {
  const ctx: AchievementContext = {
    rank: 2,
    topRankIds: new Set(["star"]),
    ratingById: new Map([["self", 4.0], ["star", 6.5]]),
    selfRating: 4.0,
  };

  it("earns Giant Killer for beating a top-3 player", () => {
    const win = [match({ result: "W", opponentIds: ["star"], opponents: ["Star"] })];
    expect(byKey(career(), win, ctx).get("giant-killer")!.earned).toBe(true);
    // A loss to them doesn't count.
    const loss = [match({ result: "L", opponentIds: ["star"], opponents: ["Star"] })];
    expect(byKey(career(), loss, ctx).get("giant-killer")!.earned).toBe(false);
  });

  it("earns David for beating a far higher-rated opponent", () => {
    const win = [match({ result: "W", opponentIds: ["star"], opponents: ["Star"] })];
    expect(byKey(career(), win, ctx).get("david")!.earned).toBe(true);
  });

  it("earns Podium inside the top 3", () => {
    expect(byKey(career(), [], ctx).get("podium")!.earned).toBe(true);
    expect(byKey(career(), [], { ...ctx, rank: 7 }).get("podium")!.earned).toBe(false);
  });

  it("reports field-relative badges unearned without context", () => {
    const win = [match({ result: "W", opponentIds: ["star"], opponents: ["Star"] })];
    const m = byKey(career(), win);
    expect(m.get("giant-killer")!.earned).toBe(false);
    expect(m.get("david")!.earned).toBe(false);
    expect(m.get("podium")!.earned).toBe(false);
  });
});

describe("computeAchievements — named rivals", () => {
  it("earns Nemesis Slayer for beating Adhitia (name match is case/space-insensitive)", () => {
    const win = [match({ result: "W", opponents: ["adhitia   putra herawan"], opponentIds: ["x"] })];
    expect(byKey(career(), win).get("nemesis-slayer")!.earned).toBe(true);
    // Losing to them doesn't count.
    const loss = [match({ result: "L", opponents: ["Adhitia Putra Herawan"], opponentIds: ["x"] })];
    expect(byKey(career(), loss).get("nemesis-slayer")!.earned).toBe(false);
  });

  it("earns Better Than Econ when out-scoring Bang Econ in a shared event", () => {
    const ctx: AchievementContext = {
      rank: null,
      topRankIds: new Set(),
      ratingById: new Map(),
      selfRating: 5,
      selfId: "self",
      results: [
        { playerId: "self", name: "Self", points: 21, conceded: 10, won: true, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
        { playerId: "self", name: "Self", points: 18, conceded: 12, won: true, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
        { playerId: "econ", name: "Bang Econ", points: 15, conceded: 16, won: false, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
      ],
    };
    expect(byKey(career(), [], ctx).get("econ-beater")!.earned).toBe(true);
    // If Econ out-scores self, it's not earned.
    const loser = { ...ctx, results: ctx.results!.map((r) => (r.playerId === "self" ? { ...r, points: 1 } : r)) };
    expect(byKey(career(), [], loser).get("econ-beater")!.earned).toBe(false);
  });
});

describe("computeAchievements — badges of shame", () => {
  it("earns Off Day under 5 points and Donut at exactly 0", () => {
    const offDay = byKey(career(), [match({ points: 4, conceded: 21, result: "L" })]);
    expect(offDay.get("off-day")!.earned).toBe(true);
    expect(offDay.get("off-day")!.tone).toBe("bad");
    expect(offDay.get("donut")!.earned).toBe(false);

    const donut = byKey(career(), [match({ points: 0, conceded: 21, result: "L" })]);
    expect(donut.get("donut")!.earned).toBe(true);
    expect(donut.get("off-day")!.earned).toBe(true); // 0 is also under 5
  });

  it("does not earn shame badges for respectable scores", () => {
    const m = byKey(career(), [match({ points: 12, conceded: 21, result: "L" })]);
    expect(m.get("off-day")!.earned).toBe(false);
    expect(m.get("donut")!.earned).toBe(false);
  });
});

describe("computeAchievements — wins, points & skill", () => {
  it("tracks career-win milestones", () => {
    const m = byKey(career({ wins: 25 }), []);
    expect(m.get("winner")!.earned).toBe(true);
    expect(m.get("champion")!.earned).toBe(false);
    expect(m.get("champion")!.progress).toEqual({ current: 25, target: 50 });
  });

  it("tracks the 100-win Legend tier", () => {
    const m = byKey(career({ wins: 100 }), []);
    expect(m.get("legend")!.earned).toBe(true);
    expect(byKey(career({ wins: 80 }), []).get("legend")!.progress).toEqual({ current: 80, target: 100 });
  });

  it("tracks career-points tiers", () => {
    expect(byKey(career({ points_for: 1000 }), []).get("point-machine")!.earned).toBe(true);
    expect(byKey(career({ points_for: 1000 }), []).get("point-tycoon")!.earned).toBe(false);
    expect(byKey(career({ points_for: 5000 }), []).get("point-tycoon")!.earned).toBe(true);
  });

  it("earns In the Black only with a positive net diff over enough games", () => {
    expect(byKey(career({ games: 10, point_diff: 1 }), []).get("in-the-black")!.earned).toBe(true);
    // Positive but too few games.
    expect(byKey(career({ games: 5, point_diff: 200 }), []).get("in-the-black")!.earned).toBe(false);
    // Enough games but negative differential.
    expect(byKey(career({ games: 20, point_diff: -50 }), []).get("in-the-black")!.earned).toBe(false);
  });

  it("tracks Margin Merchant toward +400 net points, flooring negatives at 0", () => {
    expect(byKey(career({ point_diff: 400 }), []).get("margin-merchant")!.earned).toBe(true);
    expect(byKey(career({ point_diff: 100 }), []).get("margin-merchant")!.progress).toEqual({ current: 100, target: 400 });
    // A negative differential shows zero progress, not a negative bar.
    expect(byKey(career({ point_diff: -80 }), []).get("margin-merchant")!.progress).toEqual({ current: 0, target: 400 });
  });

  it("earns Certified once every reliability gate is cleared", () => {
    // Top gate (level 7) needs +1240 net points and 85 wins.
    expect(byKey(career({ point_diff: 1240, wins: 85 }), []).get("certified")!.earned).toBe(true);
    // One half short of the top gate → not certified.
    expect(byKey(career({ point_diff: 1240, wins: 84 }), []).get("certified")!.earned).toBe(false);
    expect(byKey(career({ point_diff: 1239, wins: 85 }), []).get("certified")!.earned).toBe(false);
  });

  it("earns Mr. Reliable for high consistency over enough games", () => {
    const ctxOf = (consistency: number): AchievementContext => ({
      rank: null,
      topRankIds: new Set(),
      ratingById: new Map(),
      selfRating: 5,
      consistency,
    });
    expect(byKey(career({ games: 10 }), [], ctxOf(75)).get("mr-reliable")!.earned).toBe(true);
    // Too few games, even at high consistency.
    expect(byKey(career({ games: 5 }), [], ctxOf(90)).get("mr-reliable")!.earned).toBe(false);
    // Enough games but not consistent enough.
    expect(byKey(career({ games: 20 }), [], ctxOf(60)).get("mr-reliable")!.earned).toBe(false);
    // No context → unearned.
    expect(byKey(career({ games: 20 }), []).get("mr-reliable")!.earned).toBe(false);
  });

  it("earns Clean Sheet for a win conceding zero", () => {
    expect(byKey(career(), [match({ result: "W", conceded: 0 })]).get("clean-sheet")!.earned).toBe(true);
    expect(byKey(career(), [match({ result: "W", conceded: 1 })]).get("clean-sheet")!.earned).toBe(false);
  });

  it("earns High Roller only with enough games at the win rate", () => {
    expect(byKey(career({ games: 20, wins: 15 }), []).get("high-roller")!.earned).toBe(true);
    expect(byKey(career({ games: 4, wins: 4 }), []).get("high-roller")!.earned).toBe(false);
  });
});

describe("computeAchievements — rank & rating context", () => {
  const ctx = (over: Partial<AchievementContext>): AchievementContext => ({
    rank: null,
    topRankIds: new Set(),
    ratingById: new Map(),
    selfRating: 5,
    ...over,
  });

  it("earns Apex at #1 and Podium in the top 3", () => {
    expect(byKey(career(), [], ctx({ rank: 1 })).get("apex")!.earned).toBe(true);
    expect(byKey(career(), [], ctx({ rank: 2 })).get("apex")!.earned).toBe(false);
  });

  it("earns Level Up at Advanced rating and above", () => {
    expect(byKey(career(), [], ctx({ selfRating: 7.0 })).get("level-up")!.earned).toBe(true);
    expect(byKey(career(), [], ctx({ selfRating: 3.0 })).get("level-up")!.earned).toBe(false);
  });

  it("earns Big Mover on a 1.0+ rating gain from the first event", () => {
    expect(byKey(career(), [], ctx({ ratingHistory: [3.0, 4.5] })).get("big-mover")!.earned).toBe(true);
    expect(byKey(career(), [], ctx({ ratingHistory: [3.0, 3.5] })).get("big-mover")!.earned).toBe(false);
  });
});

describe("computeAchievements — social & story", () => {
  it("earns Dynamic Duo for 5 wins with one partner", () => {
    const games = Array.from({ length: 5 }, () => match({ result: "W", partnerId: "p", partner: "P" }));
    expect(byKey(career(), games).get("dynamic-duo")!.earned).toBe(true);
  });

  it("earns Domination for 5 wins over one opponent", () => {
    const games = Array.from({ length: 5 }, () => match({ result: "W", opponentIds: ["o"], opponents: ["O"] }));
    expect(byKey(career(), games).get("domination")!.earned).toBe(true);
  });

  it("counts distinct venues for Globetrotter", () => {
    const games = [match({ location: "A" }), match({ location: "B" }), match({ location: "C" })];
    expect(byKey(career(), games).get("globetrotter")!.earned).toBe(true);
  });

  it("earns Marathoner for 8+ games in one event", () => {
    const games = Array.from({ length: 8 }, () => match({ eventId: "big" }));
    expect(byKey(career(), games).get("marathoner")!.earned).toBe(true);
  });

  it("earns Revenge only when the win follows the loss", () => {
    const revenge = [
      match({ result: "L", opponentIds: ["x"], opponents: ["X"], playedOn: "2024-01-01" }),
      match({ result: "W", opponentIds: ["x"], opponents: ["X"], playedOn: "2024-02-01" }),
    ];
    expect(byKey(career(), revenge).get("revenge")!.earned).toBe(true);

    const noRevenge = [
      match({ result: "W", opponentIds: ["x"], opponents: ["X"], playedOn: "2024-01-01" }),
      match({ result: "L", opponentIds: ["x"], opponents: ["X"], playedOn: "2024-02-01" }),
    ];
    expect(byKey(career(), noRevenge).get("revenge")!.earned).toBe(false);
  });

  it("earns Comeback Kid after a 60+ day gap", () => {
    const games = [match({ playedOn: "2024-01-01" }), match({ playedOn: "2024-04-01" })];
    expect(byKey(career(), games).get("comeback-kid")!.earned).toBe(true);
    const tight = [match({ playedOn: "2024-01-01" }), match({ playedOn: "2024-01-15" })];
    expect(byKey(career(), tight).get("comeback-kid")!.earned).toBe(false);
  });
});

describe("computeAchievements — events, venues & cadence", () => {
  it("tracks Veteran toward 25 events", () => {
    const matches = Array.from({ length: 12 }, (_, i) => match({ eventId: `e${i}` }));
    expect(byKey(career(), matches).get("veteran")!.progress).toEqual({ current: 12, target: 25 });
  });

  it("earns Event Champion for topping the points table in a 4+ player event", () => {
    const ctx: AchievementContext = {
      rank: null,
      topRankIds: new Set(),
      ratingById: new Map(),
      selfRating: 5,
      selfId: "self",
      results: [
        { playerId: "self", name: "Self", points: 30, conceded: 10, won: true, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
        { playerId: "a", name: "A", points: 21, conceded: 12, won: false, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
        { playerId: "b", name: "B", points: 18, conceded: 15, won: false, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
        { playerId: "c", name: "C", points: 15, conceded: 16, won: false, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
      ],
    };
    expect(byKey(career(), [], ctx).get("event-champion")!.earned).toBe(true);
    // Beaten on points → not champion.
    const second = { ...ctx, results: ctx.results!.map((r) => (r.playerId === "self" ? { ...r, points: 1 } : r)) };
    expect(byKey(career(), [], second).get("event-champion")!.earned).toBe(false);
    // Too few players for "winning" to count.
    const tiny = { ...ctx, results: ctx.results!.slice(0, 3) };
    expect(byKey(career(), [], tiny).get("event-champion")!.earned).toBe(false);
  });

  it("earns Home Turf for 10 wins at one venue", () => {
    const wins = Array.from({ length: 10 }, () => match({ result: "W", location: "Court Central" }));
    expect(byKey(career(), wins).get("home-turf")!.earned).toBe(true);
    // Spread across two venues → no single fortress.
    const spread = [
      ...Array.from({ length: 6 }, () => match({ result: "W", location: "A" })),
      ...Array.from({ length: 6 }, () => match({ result: "W", location: "B" })),
    ];
    expect(byKey(career(), spread).get("home-turf")!.earned).toBe(false);
  });

  it("tracks Road Warrior toward winning at 3 venues (a venue with no win doesn't count)", () => {
    const matches = [
      match({ result: "W", location: "A" }),
      match({ result: "W", location: "B" }),
      match({ result: "L", location: "C" }),
    ];
    expect(byKey(career(), matches).get("road-warrior")!.progress).toEqual({ current: 2, target: 3 });
    const allWon = [
      match({ result: "W", location: "A" }),
      match({ result: "W", location: "B" }),
      match({ result: "W", location: "C" }),
    ];
    expect(byKey(career(), allWon).get("road-warrior")!.earned).toBe(true);
  });

  it("earns Iron Week for two events within 7 days", () => {
    const busy = [
      match({ eventId: "e1", playedOn: "2024-03-01" }),
      match({ eventId: "e2", playedOn: "2024-03-06" }),
    ];
    expect(byKey(career(), busy).get("iron-week")!.earned).toBe(true);
    // Same span but 8 days apart → not a single week.
    const spaced = [
      match({ eventId: "e1", playedOn: "2024-03-01" }),
      match({ eventId: "e2", playedOn: "2024-03-09" }),
    ];
    expect(byKey(career(), spaced).get("iron-week")!.earned).toBe(false);
    // Two games of the SAME event don't count as two events.
    const oneEvent = [
      match({ eventId: "e1", playedOn: "2024-03-01" }),
      match({ eventId: "e1", playedOn: "2024-03-02" }),
    ];
    expect(byKey(career(), oneEvent).get("iron-week")!.earned).toBe(false);
  });

  it("counts distinct ISO weeks for Weekly Habit", () => {
    // Mon 2024-03-04 and Wed 2024-03-06 are the same ISO week; the next is a 2nd.
    const sameWeek = [
      match({ playedOn: "2024-03-04" }),
      match({ playedOn: "2024-03-06" }),
      match({ playedOn: "2024-03-11" }),
    ];
    expect(byKey(career(), sameWeek).get("weekly-habit")!.progress).toEqual({ current: 2, target: WEEKLY_HABIT_WEEKS });
  });
});

describe("computeAchievements — gear & setup", () => {
  const ctx = (gear: AchievementContext["gear"]): AchievementContext => ({
    rank: null,
    topRankIds: new Set(),
    ratingById: new Map(),
    selfRating: 5,
    gear,
  });
  const fullGear = {
    position: "Right" as const,
    racketSlug: "babolat-air-viper",
    racketName: "Air Viper",
    racketBrand: "Babolat",
    racketImage: null,
  };

  it("earns Geared Up once a racket is registered", () => {
    expect(byKey(career(), [], ctx(fullGear)).get("geared-up")!.earned).toBe(true);
    expect(byKey(career(), [], ctx({ ...fullGear, racketSlug: null })).get("geared-up")!.earned).toBe(false);
  });

  it("earns Take Your Side once a position is set", () => {
    expect(byKey(career(), [], ctx(fullGear)).get("take-your-side")!.earned).toBe(true);
    expect(byKey(career(), [], ctx({ ...fullGear, position: null })).get("take-your-side")!.earned).toBe(false);
  });

  it("earns Switch Hitter only for the Both position", () => {
    expect(byKey(career(), [], ctx({ ...fullGear, position: "Both" })).get("switch-hitter")!.earned).toBe(true);
    expect(byKey(career(), [], ctx(fullGear)).get("switch-hitter")!.earned).toBe(false);
  });

  it("earns Fully Kitted only when racket and position are both set", () => {
    expect(byKey(career(), [], ctx(fullGear)).get("fully-kitted")!.earned).toBe(true);
    expect(byKey(career(), [], ctx({ ...fullGear, position: null })).get("fully-kitted")!.earned).toBe(false);
    expect(byKey(career(), [], ctx({ ...fullGear, racketSlug: null })).get("fully-kitted")!.earned).toBe(false);
  });

  it("reports gear badges unearned without context", () => {
    const m = byKey(career(), []);
    expect(m.get("geared-up")!.earned).toBe(false);
    expect(m.get("fully-kitted")!.earned).toBe(false);
  });
});

describe("computeAchievements — more shame", () => {
  it("earns Blown Out on a 10+ point loss", () => {
    const a = byKey(career(), [match({ result: "L", points: 5, conceded: 21 })]).get("blown-out")!;
    expect(a.earned).toBe(true);
    expect(a.tone).toBe("bad");
  });

  it("earns Cold Streak on 5 consecutive losses", () => {
    const games = Array.from({ length: 5 }, (_, i) =>
      match({ result: "L", playedOn: `2024-01-0${i + 1}` })
    );
    expect(byKey(career(), games).get("cold-streak")!.earned).toBe(true);
  });

  it("earns Wooden Spoon for finishing last in a 4+ player event", () => {
    const ctx: AchievementContext = {
      rank: null,
      topRankIds: new Set(),
      ratingById: new Map(),
      selfRating: 5,
      selfId: "self",
      results: [
        { playerId: "self", name: "Self", points: 5, conceded: 21, won: false, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
        { playerId: "a", name: "A", points: 21, conceded: 5, won: true, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
        { playerId: "b", name: "B", points: 18, conceded: 12, won: true, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
        { playerId: "c", name: "C", points: 15, conceded: 16, won: false, isDraw: false, eventId: "e1", playedOn: "2024-01-01" },
      ],
    };
    expect(byKey(career(), [], ctx).get("wooden-spoon")!.earned).toBe(true);
    // Not last when someone else scored fewer.
    const notLast = { ...ctx, results: ctx.results!.map((r) => (r.playerId === "self" ? { ...r, points: 30 } : r)) };
    expect(byKey(career(), [], notLast).get("wooden-spoon")!.earned).toBe(false);
  });
});

describe("computeAchievements — On the Up", () => {
  const ctx = (ratingHistory: number[]): AchievementContext => ({
    rank: null,
    topRankIds: new Set(),
    ratingById: new Map(),
    selfRating: 5,
    ratingHistory,
  });

  it("earns when rating never drops and ends higher over 3+ events", () => {
    expect(byKey(career(), [], ctx([4.0, 4.5, 5.0])).get("on-the-up")!.earned).toBe(true);
    // A flat then up still counts (non-decreasing, net gain).
    expect(byKey(career(), [], ctx([4.0, 4.0, 5.0])).get("on-the-up")!.earned).toBe(true);
  });

  it("does not earn when the rating dips at any point", () => {
    expect(byKey(career(), [], ctx([4.0, 5.0, 4.5])).get("on-the-up")!.earned).toBe(false);
  });

  it("needs at least 3 events", () => {
    expect(byKey(career(), [], ctx([4.0, 5.0])).get("on-the-up")!.earned).toBe(false);
  });
});

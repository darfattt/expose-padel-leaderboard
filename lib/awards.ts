import type { EventPlayerResult } from "./queries";
import type { CareerStatRow } from "./types";

// Per-event "story" awards derived purely from one event's facts (plus, where an
// award needs cross-event context, the global rating field and career stats).
// Same read-time philosophy as the rest of lib/: nothing here is persisted.

// "Most Improved" compares a player's night to their usual level, so they need a
// track record *outside* this event to judge against.
export const MIN_BASELINE_GAMES = 3;

// A loss by this margin or less is a "close" game (matches the close_games gate
// in the SQL view). Heartbreak needs a few of these to count as a story.
const CLOSE_MARGIN = 3;
const MIN_HEARTBREAKS = 2;
// A win has to clear this margin to earn the "Demolition" tag — a 3–2 isn't a
// beatdown. Big enough that a one-point win never qualifies on any scale.
const MIN_DEMOLITION_MARGIN = 4;

// One award recipient: the player(s) honoured plus a short stat line. names and
// playerIds run in parallel so the UI can link each name to its profile.
export interface AwardWinner {
  playerIds: string[];
  names: string[];
  detail: string;
}

export interface EventAwards {
  mvp: AwardWinner | null; // best point differential on the night
  bestPartnership: AwardWinner | null; // duo that outscored opponents by the most
  biggestUpset: AwardWinner | null; // lowest-rated team that beat a higher-rated one
  mostImproved: AwardWinner | null; // night most above the player's usual level
  demolition: AwardWinner | null; // single biggest blowout win of the night
  heartbreak: AwardWinner | null; // most close losses (margin <= CLOSE_MARGIN)
}

export interface AwardContext {
  // Field-relative rating per player (from the global leaderboard). Needed for
  // Biggest Upset; omit and that award is skipped.
  ratingById?: Map<string, number>;
  // Career stats per player (across all events). Needed for Most Improved.
  careerById?: Map<string, CareerStatRow>;
}

// --- internal shapes -------------------------------------------------------

interface TeamSide {
  playerIds: string[];
  names: string[];
  score: number;
  won: boolean;
  isDraw: boolean;
}

interface MatchGroup {
  matchId: string;
  sides: TeamSide[]; // the two teams (team 1, team 2)
}

interface PlayerAgg {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  pointsFor: number;
  pointsAgainst: number;
}

function groupByMatch(rows: EventPlayerResult[]): MatchGroup[] {
  const byMatch = new Map<string, Map<number, TeamSide>>();
  for (const r of rows) {
    let teams = byMatch.get(r.matchId);
    if (!teams) {
      teams = new Map();
      byMatch.set(r.matchId, teams);
    }
    let side = teams.get(r.team);
    if (!side) {
      side = { playerIds: [], names: [], score: r.points, won: r.won, isDraw: r.isDraw };
      teams.set(r.team, side);
    }
    side.playerIds.push(r.playerId);
    side.names.push(r.name);
  }
  return [...byMatch.entries()].map(([matchId, teams]) => ({
    matchId,
    sides: [...teams.keys()].sort((a, b) => a - b).map((t) => teams.get(t)!),
  }));
}

function aggregateByPlayer(rows: EventPlayerResult[]): PlayerAgg[] {
  const acc = new Map<string, PlayerAgg>();
  for (const r of rows) {
    let a = acc.get(r.playerId);
    if (!a) {
      a = { playerId: r.playerId, name: r.name, games: 0, wins: 0, pointsFor: 0, pointsAgainst: 0 };
      acc.set(r.playerId, a);
    }
    a.games += 1;
    if (r.won) a.wins += 1;
    a.pointsFor += r.points;
    a.pointsAgainst += r.conceded;
  }
  return [...acc.values()];
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function record(wins: number, games: number): string {
  return `${wins}–${games - wins}`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// --- individual awards -----------------------------------------------------

function pickMvp(players: PlayerAgg[]): AwardWinner | null {
  const ranked = [...players].sort(
    (a, b) =>
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name)
  );
  const top = ranked[0];
  if (!top) return null;
  const diff = top.pointsFor - top.pointsAgainst;
  return {
    playerIds: [top.playerId],
    names: [top.name],
    detail: `${signed(diff)} pt diff · ${record(top.wins, top.games)}`,
  };
}

function pickBestPartnership(groups: MatchGroup[]): AwardWinner | null {
  interface PairAgg {
    ids: string[];
    names: string[];
    games: number;
    wins: number;
    pointDiff: number;
  }
  const acc = new Map<string, PairAgg>();
  for (const g of groups) {
    if (g.sides.length !== 2) continue;
    g.sides.forEach((side, i) => {
      if (side.playerIds.length !== 2) return; // only true doubles pairings
      const opp = g.sides[1 - i];
      const order = side.playerIds[0] < side.playerIds[1] ? [0, 1] : [1, 0];
      const ids = order.map((j) => side.playerIds[j]);
      const names = order.map((j) => side.names[j]);
      const key = ids.join("|");
      let p = acc.get(key);
      if (!p) {
        p = { ids, names, games: 0, wins: 0, pointDiff: 0 };
        acc.set(key, p);
      }
      p.games += 1;
      if (side.won) p.wins += 1;
      p.pointDiff += side.score - opp.score;
    });
  }
  const ranked = [...acc.values()].sort(
    (a, b) => b.pointDiff - a.pointDiff || b.wins - a.wins || a.names.join().localeCompare(b.names.join())
  );
  const top = ranked[0];
  if (!top) return null;
  const games = top.games > 1 ? ` · ${record(top.wins, top.games)}` : "";
  return {
    playerIds: top.ids,
    names: top.names,
    detail: `${signed(top.pointDiff)} together${games}`,
  };
}

function pickBiggestUpset(groups: MatchGroup[], ratingById?: Map<string, number>): AwardWinner | null {
  if (!ratingById) return null;
  let best: { winner: TeamSide; loser: TeamSide; gap: number } | null = null;
  for (const g of groups) {
    if (g.sides.length !== 2) continue;
    const [a, b] = g.sides;
    if (a.isDraw || b.isDraw) continue;
    const winner = a.won ? a : b;
    const loser = a.won ? b : a;
    const wr = winner.playerIds.map((id) => ratingById.get(id));
    const lr = loser.playerIds.map((id) => ratingById.get(id));
    if (wr.some((r) => r === undefined) || lr.some((r) => r === undefined)) continue;
    const gap = mean(lr as number[]) - mean(wr as number[]);
    if (gap > 0 && (best === null || gap > best.gap)) best = { winner, loser, gap };
  }
  if (!best) return null;
  return {
    playerIds: best.winner.playerIds,
    names: best.winner.names,
    detail: `beat ${best.loser.names.join(" & ")} · +${best.gap.toFixed(1)} rating gap`,
  };
}

function pickMostImproved(players: PlayerAgg[], careerById?: Map<string, CareerStatRow>): AwardWinner | null {
  if (!careerById) return null;
  let best: { agg: PlayerAgg; delta: number } | null = null;
  for (const agg of players) {
    const career = careerById.get(agg.playerId);
    if (!career) continue;
    const baselineGames = career.games - agg.games;
    if (baselineGames < MIN_BASELINE_GAMES) continue;
    const eventDiff = agg.pointsFor - agg.pointsAgainst;
    const eventDiffPg = eventDiff / agg.games;
    const baselineDiffPg = (career.point_diff - eventDiff) / baselineGames;
    const delta = eventDiffPg - baselineDiffPg;
    if (delta > 0 && (best === null || delta > best.delta)) best = { agg, delta };
  }
  if (!best) return null;
  return {
    playerIds: [best.agg.playerId],
    names: [best.agg.name],
    detail: `+${best.delta.toFixed(1)} pt diff/game vs usual`,
  };
}

// The single most lopsided win of the night — the headline beatdown.
function pickDemolition(groups: MatchGroup[]): AwardWinner | null {
  let best: { winner: TeamSide; loser: TeamSide; margin: number } | null = null;
  for (const g of groups) {
    if (g.sides.length !== 2) continue;
    const [a, b] = g.sides;
    if (a.isDraw || b.isDraw) continue;
    const winner = a.won ? a : b;
    const loser = a.won ? b : a;
    const margin = winner.score - loser.score;
    if (margin >= MIN_DEMOLITION_MARGIN && (best === null || margin > best.margin)) {
      best = { winner, loser, margin };
    }
  }
  if (!best) return null;
  return {
    playerIds: best.winner.playerIds,
    names: best.winner.names,
    detail: `won ${best.winner.score}–${best.loser.score} · +${best.margin} margin`,
  };
}

// Most close losses on the night — so near, so often.
function pickHeartbreak(rows: EventPlayerResult[]): AwardWinner | null {
  const acc = new Map<string, { id: string; name: string; count: number }>();
  for (const r of rows) {
    if (r.won || r.isDraw) continue;
    const margin = r.conceded - r.points;
    if (margin > 0 && margin <= CLOSE_MARGIN) {
      const e = acc.get(r.playerId) ?? { id: r.playerId, name: r.name, count: 0 };
      e.count += 1;
      acc.set(r.playerId, e);
    }
  }
  const ranked = [...acc.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const top = ranked[0];
  if (!top || top.count < MIN_HEARTBREAKS) return null;
  return {
    playerIds: [top.id],
    names: [top.name],
    detail: `${top.count} losses by ≤${CLOSE_MARGIN} — so close`,
  };
}

// Compute every award for an event. Each is null when the data can't support it
// (no players, no doubles pairings, missing ratings/career context, no genuine
// upset / improvement / blowout / run of near-misses), so the UI only renders
// awards that have a story.
export function computeEventAwards(rows: EventPlayerResult[], ctx: AwardContext = {}): EventAwards {
  const groups = groupByMatch(rows);
  const players = aggregateByPlayer(rows);
  return {
    mvp: pickMvp(players),
    bestPartnership: pickBestPartnership(groups),
    biggestUpset: pickBiggestUpset(groups, ctx.ratingById),
    mostImproved: pickMostImproved(players, ctx.careerById),
    demolition: pickDemolition(groups),
    heartbreak: pickHeartbreak(rows),
  };
}

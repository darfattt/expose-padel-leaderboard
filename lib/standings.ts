import type { RankedPlayer } from "./leaderboard";
import type { CareerStatRow } from "./types";

// One match-player fact pulled raw from the DB (no aggregation). The leaderboard
// views aggregate this in SQL; we re-aggregate the same shape in TS so a board
// can be scoped to an arbitrary slice of results (a single month, or "everything
// before the latest event" for rank-change arrows).
export interface RawResult {
  playerId: string;
  name: string;
  points: number;
  conceded: number;
  won: boolean;
  isDraw: boolean;
  eventId: string;
  playedOn: string | null; // ISO date (yyyy-mm-dd) or null when the event is undated
}

// Aggregate raw results into per-player career rows, mirroring the
// player_career_stats view (see supabase/migrations/0001_init.sql) so a board
// built from this matches one built from the SQL view.
export function aggregateResults(results: RawResult[]): CareerStatRow[] {
  const byPlayer = new Map<string, RawResult[]>();
  for (const r of results) {
    const list = byPlayer.get(r.playerId) ?? [];
    list.push(r);
    byPlayer.set(r.playerId, list);
  }

  const rows: CareerStatRow[] = [];
  for (const [playerId, rs] of byPlayer) {
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let pointsFor = 0;
    let pointsAgainst = 0;
    let closeGames = 0;
    let closeWins = 0;
    const ownPoints: number[] = [];
    for (const r of rs) {
      pointsFor += r.points;
      pointsAgainst += r.conceded;
      if (r.isDraw) draws += 1;
      else if (r.won) wins += 1;
      else losses += 1;
      if (Math.abs(r.points - r.conceded) <= 3) {
        closeGames += 1;
        if (r.won) closeWins += 1;
      }
      ownPoints.push(r.points);
    }
    rows.push({
      player_id: playerId,
      name: rs[0].name,
      games: rs.length,
      wins,
      losses,
      draws,
      points_for: pointsFor,
      points_against: pointsAgainst,
      point_diff: pointsFor - pointsAgainst,
      close_games: closeGames,
      close_wins: closeWins,
      score_variance: variancePop(ownPoints),
    });
  }
  return rows;
}

// Distinct months (yyyy-mm) that have at least one dated result, newest first.
export function monthsFromResults(results: RawResult[]): string[] {
  const months = new Set<string>();
  for (const r of results) {
    if (r.playedOn) months.add(r.playedOn.slice(0, 7));
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

export function filterByMonth(results: RawResult[], month: string): RawResult[] {
  return results.filter((r) => r.playedOn?.slice(0, 7) === month);
}

// The most-recent dated game per player — the input to the inactivity (rust)
// overlay (see lib/decay.ts). Undated games are ignored; players with only undated
// games are omitted (treated as fresh downstream).
export function lastPlayedByPlayer(results: RawResult[]): Map<string, string> {
  const byPlayer = new Map<string, string>();
  for (const r of results) {
    if (!r.playedOn) continue;
    const prev = byPlayer.get(r.playerId);
    if (!prev || r.playedOn > prev) byPlayer.set(r.playerId, r.playedOn);
  }
  return byPlayer;
}

// The most recent event in the set, by date (undated events never count as
// "latest"). Returns null when fewer than two distinct events exist — there's
// nothing to measure movement against.
export function latestEventId(results: RawResult[]): string | null {
  const eventDate = new Map<string, string | null>();
  for (const r of results) {
    if (!eventDate.has(r.eventId)) eventDate.set(r.eventId, r.playedOn);
  }
  if (eventDate.size < 2) return null;

  let bestId: string | null = null;
  let bestDate: string | null = null;
  for (const [id, date] of eventDate) {
    if (bestId === null || cmpPlayedOn(date, bestDate) > 0 || (cmpPlayedOn(date, bestDate) === 0 && id > bestId)) {
      bestId = id;
      bestDate = date;
    }
  }
  // A latest event with no date is meaningless to compare against.
  return bestDate === null ? null : bestId;
}

// Everything except the single most-recent event — the field as it stood
// *before* that event, used to diff ranks. Returns null when there's no
// well-defined latest event to exclude.
export function resultsBeforeLatest(results: RawResult[]): RawResult[] | null {
  const latest = latestEventId(results);
  if (latest === null) return null;
  return results.filter((r) => r.eventId !== latest);
}

// A leaderboard entry annotated with its movement since the previous standings.
export interface RankedPlayerWithChange extends RankedPlayer {
  rankDelta: number | null; // positive = climbed; 0 = held; null = no comparison
  isNew: boolean; // ranked now, but absent/provisional in the previous standings
}

// Diff a current ranked board against a previous one. delta is previousRank −
// currentRank, so a player who went from #5 to #2 gets +3 (moved up 3).
export function withRankChange(
  current: RankedPlayer[],
  previous: RankedPlayer[] | null
): RankedPlayerWithChange[] {
  if (previous === null) {
    return current.map((p) => ({ ...p, rankDelta: null, isNew: false }));
  }
  const prevRank = new Map<string, number>();
  for (const p of previous) {
    if (p.rank !== null) prevRank.set(p.row.player_id, p.rank);
  }
  return current.map((p) => {
    if (p.rank === null) return { ...p, rankDelta: null, isNew: false };
    const before = prevRank.get(p.row.player_id);
    if (before === undefined) return { ...p, rankDelta: null, isNew: true };
    return { ...p, rankDelta: before - p.rank, isNew: false };
  });
}

// "2026-06" -> "Jun 2026". Pure (no Date/locale dependence) so it's stable.
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatMonth(month: string): string {
  const [year, mm] = month.split("-");
  const idx = Number(mm) - 1;
  const name = MONTH_NAMES[idx] ?? mm;
  return `${name} ${year}`;
}

// dated > undated; two dated compared as ISO strings; two undated equal.
function cmpPlayedOn(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a.localeCompare(b);
}

// Population variance, matching var_pop() in the career-stats view.
function variancePop(xs: number[]): number {
  if (!xs.length) return 0;
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length;
}

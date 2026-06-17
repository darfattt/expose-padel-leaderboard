import { type Archetype, type Attributes, type ArchetypeField, computeAttributes, pickArchetype } from "./archetype";
import { type PlayerMetrics, computeMetrics, fieldStats } from "./stats";
import { type RatingField, computeRating, isProvisional } from "./rating";
import {
  type RankedPlayerWithChange,
  type RawResult,
  aggregateResults,
  filterByMonth,
  monthsFromResults,
  resultsBeforeLatest,
  withRankChange,
} from "./standings";
import { createReadClient } from "./supabase/server";
import type { CareerStatRow } from "./types";

// One fully-enriched leaderboard entry: raw stats + field-relative rating,
// attributes, and archetype, all computed in TS on read.
export interface RankedPlayer {
  rank: number | null; // null while provisional (below the min-games threshold)
  row: CareerStatRow;
  metrics: PlayerMetrics;
  rating: number;
  attributes: Attributes;
  archetype: Archetype;
  provisional: boolean;
}

// Pull career stats for the whole field. When clubId is given, stats are scoped
// to that club (player_club_stats); otherwise they aggregate every club
// (player_career_stats). Returns [] when Supabase isn't configured or the table
// is empty, so pages can render an empty state.
export async function fetchCareerStats(clubId?: string): Promise<CareerStatRow[]> {
  try {
    const supabase = createReadClient();
    const query = clubId
      ? supabase.from("player_club_stats").select("*").eq("club_id", clubId)
      : supabase.from("player_career_stats").select("*");
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CareerStatRow[];
  } catch {
    return [];
  }
}

function buildRatingField(metrics: PlayerMetrics[]): RatingField {
  return {
    winRate: fieldStats(metrics.map((m) => m.winRate)),
    diffPg: fieldStats(metrics.map((m) => m.diffPg)),
    ppg: fieldStats(metrics.map((m) => m.ppg)),
  };
}

function buildArchetypeField(metrics: PlayerMetrics[]): ArchetypeField {
  return {
    ppg: fieldStats(metrics.map((m) => m.ppg)),
    concededPg: fieldStats(metrics.map((m) => m.concededPg)),
    variance: fieldStats(metrics.map((m) => m.variance)),
    closeWinRate: fieldStats(metrics.map((m) => m.closeWinRate)),
    winRate: fieldStats(metrics.map((m) => m.winRate)),
  };
}

// Enrich + rank a field of career rows. Only players with at least one game
// contribute to the field normalization (and appear in the result). Ranked
// players (>= MIN_GAMES_RANKED) sort by rating desc and get a rank number;
// provisional players sort after them and carry rank = null.
export function rankPlayers(rows: CareerStatRow[]): RankedPlayer[] {
  const played = rows.filter((r) => r.games > 0);
  const metrics = played.map(computeMetrics);
  const ratingField = buildRatingField(metrics);
  const archetypeField = buildArchetypeField(metrics);

  const enriched = played.map((row, i): Omit<RankedPlayer, "rank"> => {
    const m = metrics[i];
    return {
      row,
      metrics: m,
      rating: computeRating(m, ratingField, { score: row.point_diff, wins: row.wins }),
      attributes: computeAttributes(m, archetypeField),
      archetype: pickArchetype(m, archetypeField),
      provisional: isProvisional(row.games),
    };
  });

  enriched.sort((a, b) => {
    if (a.provisional !== b.provisional) return a.provisional ? 1 : -1;
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.metrics.winRate !== a.metrics.winRate) return b.metrics.winRate - a.metrics.winRate;
    return b.row.point_diff - a.row.point_diff;
  });

  let rank = 0;
  return enriched.map((e) => ({
    ...e,
    rank: e.provisional ? null : ++rank,
  }));
}

// clubId scopes the board to a single club; omit it for the global board.
export async function getLeaderboard(clubId?: string): Promise<RankedPlayer[]> {
  return rankPlayers(await fetchCareerStats(clubId));
}

// The field normalization used by computeRating, built from the whole field.
// Exposed so a player's per-event rating history can be measured against the
// same field that produces the headline rating (see lib/rating-history.ts).
export async function getRatingField(): Promise<RatingField> {
  const metrics = (await fetchCareerStats()).filter((r) => r.games > 0).map(computeMetrics);
  return buildRatingField(metrics);
}

// Enriched entry for a single player, computed against the full field so the
// rating/archetype match the leaderboard exactly.
export async function getRankedPlayer(playerId: string): Promise<RankedPlayer | null> {
  const board = await getLeaderboard();
  return board.find((p) => p.row.player_id === playerId) ?? null;
}

// Raw, un-aggregated match-player facts (one row per game played), optionally
// scoped to a club. Re-aggregated in TS (see lib/standings.ts) so a board can be
// sliced by time. Returns [] when Supabase isn't configured or has no data.
export async function fetchRawResults(clubId?: string): Promise<RawResult[]> {
  try {
    const supabase = createReadClient();
    let query = supabase
      .from("match_players")
      .select(
        "player_id, points, conceded, won, is_draw, players!inner(name), matches!inner(event_id, events!inner(played_on, club_id))"
      );
    if (clubId) query = query.eq("matches.events.club_id", clubId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((r) => {
      const player = Array.isArray(r.players) ? r.players[0] : r.players;
      const match = Array.isArray(r.matches) ? r.matches[0] : r.matches;
      const ev = Array.isArray(match.events) ? match.events[0] : match.events;
      return {
        playerId: r.player_id as string,
        name: (player as { name: string }).name,
        points: r.points as number,
        conceded: r.conceded as number,
        won: r.won as boolean,
        isDraw: r.is_draw as boolean,
        eventId: match.event_id as string,
        playedOn: (ev as { played_on: string | null })?.played_on ?? null,
      };
    });
  } catch {
    return [];
  }
}

export interface LeaderboardView {
  board: RankedPlayerWithChange[];
  months: string[]; // yyyy-mm with at least one dated game, newest first
  period: string; // resolved period: "all" or a yyyy-mm month
}

// The leaderboard for a club + time period, with rank-change arrows.
//   period "all" (default): the full field, each row diffed against the
//     standings *before the most recent event* (the up/down indicator).
//   period "yyyy-mm": only that month's games; no movement arrows (a month is a
//     standalone board, not a continuation of the all-time one).
// An unknown/undated period silently falls back to "all".
export async function getLeaderboardView(clubId?: string, period?: string): Promise<LeaderboardView> {
  const results = await fetchRawResults(clubId);
  const months = monthsFromResults(results);
  const resolved = period && months.includes(period) ? period : "all";

  if (resolved !== "all") {
    const current = rankPlayers(aggregateResults(filterByMonth(results, resolved)));
    return { board: withRankChange(current, null), months, period: resolved };
  }

  const current = rankPlayers(aggregateResults(results));
  const before = resultsBeforeLatest(results);
  const previous = before === null ? null : rankPlayers(aggregateResults(before));
  return { board: withRankChange(current, previous), months, period: "all" };
}

import { type Archetype, type Attributes, type ArchetypeField, computeAttributes, pickArchetype } from "./archetype";
import { type PlayerMetrics, computeMetrics, fieldStats } from "./stats";
import { type RatingField, computeRating, isProvisional } from "./rating";
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

// Pull career stats for the whole field. Returns [] when Supabase isn't
// configured or the table is empty, so pages can render an empty state.
export async function fetchCareerStats(): Promise<CareerStatRow[]> {
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase.from("player_career_stats").select("*");
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
      rating: computeRating(m, ratingField),
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

export async function getLeaderboard(): Promise<RankedPlayer[]> {
  return rankPlayers(await fetchCareerStats());
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

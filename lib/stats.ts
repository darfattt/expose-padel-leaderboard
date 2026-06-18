import type { CareerStatRow } from "./types";

export interface PlayerMetrics {
  winRate: number; // 0..1
  ppg: number; // points scored per game
  concededPg: number; // points conceded per game
  diffPg: number; // point differential per game
  closeWinRate: number; // wins in close games / close games (0.5 if none)
  variance: number; // variance of own per-game points
}

export function computeMetrics(row: CareerStatRow): PlayerMetrics {
  const g = Math.max(row.games, 1);
  // Per-game rates are field-relative (z-scored downstream), so they read the
  // scoring-basis-normalized aggregates when present — that keeps events on
  // different point scales comparable. Falls back to the raw field (factor 1)
  // for hand-built rows / pre-normalization data. Win rate is count-based, so
  // it's already scale-free. See lib/scoring.ts.
  const pointsFor = row.norm_points_for ?? row.points_for;
  const pointsAgainst = row.norm_points_against ?? row.points_against;
  const pointDiff = row.norm_point_diff ?? row.point_diff;
  const closeGames = row.norm_close_games ?? row.close_games;
  const closeWins = row.norm_close_wins ?? row.close_wins;
  const variance = row.norm_score_variance ?? row.score_variance;
  return {
    winRate: row.wins / g,
    ppg: pointsFor / g,
    concededPg: pointsAgainst / g,
    diffPg: pointDiff / g,
    closeWinRate: closeGames > 0 ? closeWins / closeGames : 0.5,
    variance,
  };
}

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stddev(xs: number[], mu = mean(xs)): number {
  if (xs.length < 2) return 0;
  const v = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

export interface FieldStats {
  mean: number;
  std: number;
}

export function fieldStats(xs: number[]): FieldStats {
  const mu = mean(xs);
  return { mean: mu, std: stddev(xs, mu) };
}

// z-score; returns 0 when the field has no spread.
export function z(value: number, f: FieldStats): number {
  if (f.std === 0) return 0;
  return (value - f.mean) / f.std;
}

// Map a z-score into a bounded 0..100 attribute/rating scale.
export function scaleFromZ(zScore: number, gain = 0.85): number {
  return Math.round(Math.min(100, Math.max(0, 50 + 50 * Math.tanh(zScore * gain))));
}

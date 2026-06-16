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
  const close = row.close_games;
  return {
    winRate: row.wins / g,
    ppg: row.points_for / g,
    concededPg: row.points_against / g,
    diffPg: row.point_diff / g,
    closeWinRate: close > 0 ? row.close_wins / close : 0.5,
    variance: row.score_variance,
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

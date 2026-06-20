import { getRankedPlayer } from "@/lib/leaderboard";
import { getPlayerGear, getPlayerMatchHistory, type MatchHistoryEntry } from "@/lib/queries";
import { formatMonth } from "@/lib/standings";
import type { CareerStatRow } from "@/lib/types";
import type { WrappedInput } from "@/lib/wrapped";

// Shared server-side loader for Padel Wrapped, used by both the page and the LLM
// intro action so they agree on exactly what's being summarised. Not a Server
// Action — just an async helper composing existing read paths.

export interface WrappedLoad {
  input: Omit<WrappedInput, "intro">;
  months: string[]; // yyyy-mm the player has games in, newest first
  period: string; // resolved: "all" or a yyyy-mm month
}

function playerMonths(matches: MatchHistoryEntry[]): string[] {
  const set = new Set<string>();
  for (const m of matches) if (m.playedOn) set.add(m.playedOn.slice(0, 7));
  return [...set].sort((a, b) => b.localeCompare(a));
}

function variancePop(xs: number[]): number {
  if (!xs.length) return 0;
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length;
}

// A CareerStatRow scoped to a slice of one player's matches (norm_* omitted —
// callers fall back to the raw fields). Used for the period record panel.
function scopedRow(playerId: string, name: string, matches: MatchHistoryEntry[]): CareerStatRow {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let pf = 0;
  let pa = 0;
  let closeGames = 0;
  let closeWins = 0;
  const own: number[] = [];
  for (const m of matches) {
    pf += m.points;
    pa += m.conceded;
    if (m.result === "D") draws += 1;
    else if (m.result === "W") wins += 1;
    else losses += 1;
    if (Math.abs(m.points - m.conceded) <= 3) {
      closeGames += 1;
      if (m.result === "W") closeWins += 1;
    }
    own.push(m.points);
  }
  return {
    player_id: playerId,
    name,
    games: matches.length,
    wins,
    losses,
    draws,
    points_for: pf,
    points_against: pa,
    point_diff: pf - pa,
    close_games: closeGames,
    close_wins: closeWins,
    score_variance: variancePop(own),
  };
}

export async function loadWrappedInput(
  playerId: string,
  periodParam?: string
): Promise<WrappedLoad | null> {
  const [player, allMatches, gear] = await Promise.all([
    getRankedPlayer(playerId),
    getPlayerMatchHistory(playerId),
    getPlayerGear(playerId),
  ]);
  if (!player) return null;

  const months = playerMonths(allMatches);
  const period = periodParam && months.includes(periodParam) ? periodParam : "all";

  const matches = period === "all" ? allMatches : allMatches.filter((m) => m.playedOn?.slice(0, 7) === period);
  // All-time keeps the real (normalized) career row; a month uses a scoped row.
  const careerRow = period === "all" ? player.row : scopedRow(player.row.player_id, player.row.name, matches);
  const periodLabel = period === "all" ? "all time" : formatMonth(period);

  return {
    input: {
      player,
      matches,
      careerRow,
      gender: gear.gender,
      periodLabel,
      racket: {
        name: gear.racketName,
        brand: gear.racketBrand,
        image: gear.racketImage,
        position: gear.position,
      },
    },
    months,
    period,
  };
}

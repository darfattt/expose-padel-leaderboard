import { rankPlayers } from "./leaderboard";
import { type RawResult, aggregateResults, monthsFromResults } from "./standings";

// A player's leaderboard rank at the end of every month with dated games — the
// "spaghetti plot" of who climbed and who slid across a season. Each month's
// board is the standings *as of* that month (all dated results up to and including
// it), ranked exactly like the live board. The inactivity (rust) overlay is left
// off on purpose: trajectory is about earned standing over time, not who's cold
// right now. Pure (no DB, no clock) so it's unit-testable like the rest of lib/.

export interface TrajectoryPoint {
  month: string; // yyyy-mm
  rank: number | null; // null when provisional or not yet on the board that month
}

export interface TrajectorySeries {
  id: string;
  name: string;
  points: TrajectoryPoint[]; // one per month, ascending
  finalRank: number | null; // rank in the most recent month
}

export interface RankTrajectory {
  months: string[]; // ascending
  series: TrajectorySeries[]; // sorted by final rank (ranked first)
}

export function buildRankTrajectory(results: RawResult[]): RankTrajectory {
  const dated = results.filter((r) => r.playedOn);
  const months = monthsFromResults(dated).sort(); // ascending
  if (months.length === 0) return { months: [], series: [] };

  const rankByMonth = new Map<string, Map<string, number | null>>();
  const names = new Map<string, string>();
  for (const month of months) {
    const upto = dated.filter((r) => r.playedOn!.slice(0, 7) <= month);
    const board = rankPlayers(aggregateResults(upto));
    const ranks = new Map<string, number | null>();
    for (const p of board) {
      ranks.set(p.row.player_id, p.rank);
      names.set(p.row.player_id, p.row.name);
    }
    rankByMonth.set(month, ranks);
  }

  const finalBoard = rankByMonth.get(months[months.length - 1])!;
  const series: TrajectorySeries[] = [...names.keys()].map((id) => ({
    id,
    name: names.get(id)!,
    points: months.map((month) => ({ month, rank: rankByMonth.get(month)!.get(id) ?? null })),
    finalRank: finalBoard.get(id) ?? null,
  }));

  // Most relevant first: by final rank, ranked players ahead of provisional ones.
  series.sort((a, b) => {
    if (a.finalRank === null && b.finalRank === null) return a.name.localeCompare(b.name);
    if (a.finalRank === null) return 1;
    if (b.finalRank === null) return -1;
    return a.finalRank - b.finalRank;
  });

  return { months, series };
}

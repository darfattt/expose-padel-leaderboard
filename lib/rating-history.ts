import type { MatchHistoryEntry } from "./queries";
import { type RatingField, computeRating } from "./rating";
import { normFactor } from "./scoring";
import { computeMetrics } from "./stats";
import type { CareerStatRow } from "./types";

export interface RatingHistoryPoint {
  eventId: string;
  eventTitle: string;
  playedOn: string | null;
  rating: number;
  games: number; // cumulative games played after this event
}

// Reconstruct the player's rating after each event they played, oldest first.
// Stats accumulate game-by-game and the rating is computed against the *current*
// field (the same field that produces the headline rating), so the final point
// equals the player's displayed rating. The rating itself depends only on win
// rate, point differential, and points-per-game (see computeRating), but we
// build a full cumulative CareerStatRow so each snapshot is faithful and matches
// the player_career_stats view definition (see supabase/migrations/0001_init.sql).
export function buildRatingHistory(
  matches: MatchHistoryEntry[],
  field: RatingField,
  player: { id: string; name: string }
): RatingHistoryPoint[] {
  if (!matches.length) return [];

  // Group games by event, preserving first-seen order as a stable tiebreaker.
  const order: string[] = [];
  const byEvent = new Map<
    string,
    { title: string; playedOn: string | null; games: MatchHistoryEntry[] }
  >();
  for (const m of matches) {
    let g = byEvent.get(m.eventId);
    if (!g) {
      g = { title: m.eventTitle, playedOn: m.playedOn, games: [] };
      byEvent.set(m.eventId, g);
      order.push(m.eventId);
    }
    g.games.push(m);
  }

  // Chronological: dated events ascending, undated events last in first-seen order.
  const events = [...byEvent.entries()].sort(([aId, a], [bId, b]) => {
    if (a.playedOn && b.playedOn) return a.playedOn.localeCompare(b.playedOn);
    if (a.playedOn) return -1;
    if (b.playedOn) return 1;
    return order.indexOf(aId) - order.indexOf(bId);
  });

  let games = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  let closeGames = 0;
  let closeWins = 0;
  const ownPoints: number[] = [];
  // Scoring-basis-normalized parallels so each snapshot's rating matches the
  // (normalized) headline rating, even across events on different point scales.
  // Mirrors aggregateResults / the SQL views (see lib/scoring.ts).
  let normPointsFor = 0;
  let normPointsAgainst = 0;
  let normCloseGames = 0;
  let normCloseWins = 0;
  const normOwnPoints: number[] = [];
  const history: RatingHistoryPoint[] = [];

  for (const [eventId, ev] of events) {
    for (const m of ev.games) {
      games += 1;
      pointsFor += m.points;
      pointsAgainst += m.conceded;
      if (m.result === "W") wins += 1;
      else if (m.result === "L") losses += 1;
      else draws += 1;
      if (Math.abs(m.points - m.conceded) <= 3) {
        closeGames += 1;
        if (m.result === "W") closeWins += 1;
      }
      ownPoints.push(m.points);

      const f = normFactor(m.pointsPerGame);
      const np = m.points * f;
      const nc = m.conceded * f;
      normPointsFor += np;
      normPointsAgainst += nc;
      if (Math.abs(np - nc) <= 3) {
        normCloseGames += 1;
        if (m.result === "W") normCloseWins += 1;
      }
      normOwnPoints.push(np);
    }
    const row: CareerStatRow = {
      player_id: player.id,
      name: player.name,
      games,
      wins,
      losses,
      draws,
      points_for: pointsFor,
      points_against: pointsAgainst,
      point_diff: pointsFor - pointsAgainst,
      close_games: closeGames,
      close_wins: closeWins,
      score_variance: variancePop(ownPoints),
      norm_points_for: normPointsFor,
      norm_points_against: normPointsAgainst,
      norm_point_diff: normPointsFor - normPointsAgainst,
      norm_close_games: normCloseGames,
      norm_close_wins: normCloseWins,
      norm_score_variance: variancePop(normOwnPoints),
    };
    history.push({
      eventId,
      eventTitle: ev.title,
      playedOn: ev.playedOn,
      rating: computeRating(computeMetrics(row), field, { score: normPointsFor - normPointsAgainst, wins }),
      games,
    });
  }

  return history;
}

// Population variance, matching var_pop() in the career-stats view.
function variancePop(xs: number[]): number {
  if (!xs.length) return 0;
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length;
}

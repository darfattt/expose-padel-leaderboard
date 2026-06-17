import { getLeaderboardView } from "./leaderboard";
import { getPlayerRackets, type PlayerRacket } from "./queries";
import type { RankedPlayerWithChange } from "./standings";

// A leaderboard row carrying the racket the player has set on their profile.
export interface RacketPlayer extends RankedPlayerWithChange {
  racket: PlayerRacket;
}

// One racket brand and every ranked player using it, plus brand-level stats so
// brands can be ranked against each other.
export interface BrandGroup {
  brand: string;
  players: RacketPlayer[]; // preserves board order (rating desc, provisional last)
  playerCount: number;
  avgRating: number; // mean rating across the brand's players
  topRating: number;
  topPlayer: string; // strongest player on the brand
}

export interface RacketBrandLeaderboard {
  groups: BrandGroup[]; // sorted by avgRating desc, then by playerCount desc
  months: string[];
  period: string;
  unassigned: number; // players on the board with no racket set
}

// Rank racket brands by the strength of the players who use them. Reuses the
// main leaderboard view (so club/period filters and rank-change arrows match the
// home board exactly), then joins each player to the racket on their profile and
// groups by brand. Brands are ordered by their players' average rating.
export async function getRacketBrandLeaderboard(
  clubId?: string,
  period?: string
): Promise<RacketBrandLeaderboard> {
  const [{ board, months, period: resolved }, rackets] = await Promise.all([
    getLeaderboardView(clubId, period),
    getPlayerRackets(),
  ]);

  const byBrand = new Map<string, RacketPlayer[]>();
  let unassigned = 0;
  for (const p of board) {
    const racket = rackets.get(p.row.player_id);
    if (!racket) {
      unassigned += 1;
      continue;
    }
    const list = byBrand.get(racket.brand) ?? [];
    list.push({ ...p, racket });
    byBrand.set(racket.brand, list);
  }

  const groups: BrandGroup[] = [...byBrand.entries()].map(([brand, players]) => {
    const avgRating = players.reduce((sum, p) => sum + p.rating, 0) / players.length;
    // players keep board order, so the first is the strongest.
    const top = players[0];
    return {
      brand,
      players,
      playerCount: players.length,
      avgRating,
      topRating: top.rating,
      topPlayer: top.row.name,
    };
  });

  groups.sort((a, b) => b.avgRating - a.avgRating || b.playerCount - a.playerCount);

  return { groups, months, period: resolved, unassigned };
}

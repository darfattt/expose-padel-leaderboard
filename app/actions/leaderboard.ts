"use server";

import { getLeaderboardPage } from "@/lib/leaderboard";
import { resolveAvatars } from "@/lib/queries";
import type { RankedPlayerWithChange } from "@/lib/standings";

// One page of ranked rows for the leaderboard's infinite scroll, with the
// Reclub avatars for just that slice resolved server-side. Everything returned
// is plain serializable data so it crosses the Server Action boundary cleanly.
export interface LeaderboardPagePayload {
  rows: RankedPlayerWithChange[];
  avatars: Record<string, string | null>;
  nextOffset: number;
  hasMore: boolean;
}

export async function loadLeaderboardPage(
  clubId: string | undefined,
  period: string | undefined,
  offset: number
): Promise<LeaderboardPagePayload> {
  const { rows, nextOffset, hasMore } = await getLeaderboardPage(clubId, period, offset);
  const avatars = await resolveAvatars(rows.map((p) => p.row.player_id));
  return { rows, avatars, nextOffset, hasMore };
}

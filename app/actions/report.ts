"use server";

import { revalidatePath } from "next/cache";
import type { AchievementContext } from "@/lib/achievements";
import { fetchRawResults, getLeaderboard, getRatingField } from "@/lib/leaderboard";
import { getPlayerGear, getPlayerMatchHistory, getPlayerRackets } from "@/lib/queries";
import { buildRatingHistory } from "@/lib/rating-history";
import { racketPlayStyle } from "@/lib/racket-reco";
import {
  buildReportFacts,
  generatePlayerReport,
  type ReportInput,
  reportInputHash,
  reportModel,
  reportsEnabled,
  type ProComparison,
} from "@/lib/report";
import { createServiceClient } from "@/lib/supabase/server";

export interface PlayerReportView {
  headline: string | null;
  content: string;
  tags: string[];
  similarPros: ProComparison[];
  model: string | null;
  cached: boolean;
}

// Career-scope report for a player. Serves the cached row when its input_hash
// still matches the current stats; otherwise generates, caches, and returns it.
// Returns null when reports are disabled or the player can't be ranked.
export async function getOrCreatePlayerReport(
  playerId: string,
  force = false
): Promise<PlayerReportView | null> {
  // The full field gives us both the player (rated against everyone) and the
  // context the field-relative badges need (top-3 ids, every rating, results).
  const board = await getLeaderboard();
  const player = board.find((p) => p.row.player_id === playerId);
  if (!player) return null;

  const [matches, ratingField, results, gear, fieldRacketMap] = await Promise.all([
    getPlayerMatchHistory(playerId),
    getRatingField(),
    fetchRawResults(),
    getPlayerGear(playerId),
    getPlayerRackets(),
  ]);
  const fieldRackets = [...fieldRacketMap].map(([id, rk]) => ({
    playerId: id,
    brand: rk.brand,
    name: rk.name,
    slug: rk.slug,
  }));

  const ratingHistory = buildRatingHistory(matches, ratingField, {
    id: player.row.player_id,
    name: player.row.name,
  });
  const context: AchievementContext = {
    rank: player.rank,
    topRankIds: new Set(
      board.filter((p) => p.rank !== null && p.rank <= 3).map((p) => p.row.player_id)
    ),
    ratingById: new Map(board.map((p) => [p.row.player_id, p.rating])),
    selfRating: player.rating,
    ratingHistory: ratingHistory.map((h) => h.rating),
    selfId: player.row.player_id,
    results,
    consistency: player.attributes.consistency,
    gear,
    fieldRackets,
    playStyle: racketPlayStyle(player.attributes),
  };

  const reportInput: ReportInput = { player, matches, context, gear };
  const facts = buildReportFacts(reportInput);

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    supabase = null;
  }

  const currentHash = reportInputHash(facts, reportModel());

  // Serve cache if fresh.
  if (supabase && !force) {
    const { data } = await supabase
      .from("player_reports")
      .select("headline, content, tags, pro_comparisons, model, input_hash")
      .eq("player_id", playerId)
      .eq("scope", "career")
      .is("event_id", null)
      .maybeSingle();
    if (data && data.input_hash === currentHash) {
      return {
        headline: data.headline as string | null,
        content: data.content as string,
        tags: (data.tags as string[]) ?? [],
        similarPros: (data.pro_comparisons as ProComparison[]) ?? [],
        model: data.model as string | null,
        cached: true,
      };
    }
  }

  if (!reportsEnabled()) return null;

  let generated;
  try {
    generated = await generatePlayerReport(reportInput);
  } catch {
    return null;
  }
  if (!generated) return null;

  // Cache it (delete-then-insert avoids coalesce-based upsert targeting).
  if (supabase) {
    await supabase
      .from("player_reports")
      .delete()
      .eq("player_id", playerId)
      .eq("scope", "career")
      .is("event_id", null);
    await supabase.from("player_reports").insert({
      player_id: playerId,
      event_id: null,
      scope: "career",
      headline: generated.report.headline,
      content: generated.report.report,
      tags: generated.report.tags,
      pro_comparisons: generated.report.similarPros,
      model: generated.model,
      input_hash: generated.inputHash,
    });
  }

  return {
    headline: generated.report.headline,
    content: generated.report.report,
    tags: generated.report.tags,
    similarPros: generated.report.similarPros,
    model: generated.model,
    cached: false,
  };
}

// Used by the "regenerate" button on the profile.
export async function regeneratePlayerReport(playerId: string): Promise<PlayerReportView | null> {
  const res = await getOrCreatePlayerReport(playerId, true);
  revalidatePath(`/players/${playerId}`);
  return res;
}

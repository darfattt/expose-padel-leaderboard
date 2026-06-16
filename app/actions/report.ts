"use server";

import { revalidatePath } from "next/cache";
import { getRankedPlayer } from "@/lib/leaderboard";
import { getPlayerMatchHistory } from "@/lib/queries";
import {
  buildReportFacts,
  generatePlayerReport,
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
  const player = await getRankedPlayer(playerId);
  if (!player) return null;

  const matches = await getPlayerMatchHistory(playerId);
  const facts = buildReportFacts({ player, matches });

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
    generated = await generatePlayerReport({ player, matches });
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

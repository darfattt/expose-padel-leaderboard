"use server";

import { revalidatePath } from "next/cache";
import {
  buildGossipFacts,
  generateGossipSummary,
  gossipEnabled,
  gossipInputHash,
  gossipModel,
  hasGossipMaterial,
} from "@/lib/gossip";
import { getPlayerMatchHistory } from "@/lib/queries";
import { createServiceClient } from "@/lib/supabase/server";

export interface GossipView {
  summary: string;
  vibe: string | null;
  model: string | null;
  cached: boolean;
}

// Career-scope gossip summary for a player. Serves the cached row while its
// input_hash still matches the current relationship facts; otherwise generates,
// caches, and returns it. Cached in player_reports under scope 'gossip' (summary
// in content, vibe in headline). Returns null when there's nothing to say or
// reports are disabled and there's no fresh cache.
export async function getOrCreateGossip(
  playerId: string,
  force = false
): Promise<GossipView | null> {
  const matches = await getPlayerMatchHistory(playerId);
  if (!hasGossipMaterial(matches)) return null;

  const facts = buildGossipFacts(matches);
  const currentHash = gossipInputHash(facts, gossipModel());

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    supabase = null;
  }

  // Serve cache if fresh.
  if (supabase && !force) {
    const { data } = await supabase
      .from("player_reports")
      .select("headline, content, model, input_hash")
      .eq("player_id", playerId)
      .eq("scope", "gossip")
      .is("event_id", null)
      .maybeSingle();
    if (data && data.input_hash === currentHash) {
      return {
        summary: data.content as string,
        vibe: data.headline as string | null,
        model: data.model as string | null,
        cached: true,
      };
    }
  }

  if (!gossipEnabled()) return null;

  let generated;
  try {
    generated = await generateGossipSummary(matches);
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
      .eq("scope", "gossip")
      .is("event_id", null);
    await supabase.from("player_reports").insert({
      player_id: playerId,
      event_id: null,
      scope: "gossip",
      headline: generated.summary.vibe,
      content: generated.summary.summary,
      model: generated.model,
      input_hash: generated.inputHash,
    });
  }

  return {
    summary: generated.summary.summary,
    vibe: generated.summary.vibe,
    model: generated.model,
    cached: false,
  };
}

// Used by the "regenerate" button on the profile.
export async function regenerateGossip(playerId: string): Promise<GossipView | null> {
  const res = await getOrCreateGossip(playerId, true);
  revalidatePath(`/players/${playerId}`);
  return res;
}

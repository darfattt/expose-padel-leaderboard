import crypto from "node:crypto";
import { createServiceClient } from "./supabase/server";

// Read/write helpers for the `narratives` table (migration 0010) — the cache
// behind LLM copy that isn't tied to a single player: Match Night recaps, the
// Power Rankings column, Padel Wrapped season blurbs. Mirrors the player_reports
// pattern: a row is served only while its input_hash matches the current facts.
//
// Server-only (uses the service client). Every call degrades to a no-op / null
// when Supabase isn't configured, so features work without a database.

export type NarrativeKind = "event_recap" | "power_rankings" | "wrapped";

// Hash the prompt version + model + grounded facts. Bump the version string in a
// feature's action to invalidate its cache after a prompt/schema change.
export function narrativeHash(version: string, model: string, facts: string): string {
  return crypto.createHash("sha256").update(`${version}\n${model}\n${facts}`).digest("hex");
}

function serviceClient() {
  try {
    return createServiceClient();
  } catch {
    return null;
  }
}

// Returns the cached content only when its stored hash matches `hash`.
export async function readNarrative<T>(
  kind: NarrativeKind,
  refId: string,
  hash: string
): Promise<T | null> {
  const supabase = serviceClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("narratives")
    .select("content, input_hash")
    .eq("kind", kind)
    .eq("ref_id", refId)
    .maybeSingle();
  if (data && data.input_hash === hash) return data.content as T;
  return null;
}

// Delete-then-insert (avoids upsert targeting on the composite key).
export async function writeNarrative(
  kind: NarrativeKind,
  refId: string,
  hash: string,
  model: string,
  content: unknown
): Promise<void> {
  const supabase = serviceClient();
  if (!supabase) return;
  await supabase.from("narratives").delete().eq("kind", kind).eq("ref_id", refId);
  await supabase
    .from("narratives")
    .insert({ kind, ref_id: refId, content, model, input_hash: hash });
}

"use server";

import { revalidatePath } from "next/cache";
import { resolveReclubAvatar } from "@/lib/reclub-avatar";
import { normalizeReclubUrl } from "@/lib/reclub";
import { createServiceClient } from "@/lib/supabase/server";

export interface ReclubUpdateResult {
  ok: boolean;
  error?: string;
  url?: string | null; // canonical URL that was stored (null when cleared)
  avatarUrl?: string | null; // resolved avatar, if any
}

// Persist (or clear) a player's Reclub profile link, then resolve and cache the
// avatar off that profile page. Pass null/"" to remove the link. The URL is
// normalized + validated server-side; an unrecognized URL is rejected without
// touching the row. Avatar resolution failing is non-fatal — the link is still
// saved (the UI shows initials until it resolves).
export async function updateReclubProfile(
  playerId: string,
  rawUrl: string | null
): Promise<ReclubUpdateResult> {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Clearing the link.
  if (rawUrl === null || rawUrl.trim() === "") {
    const { error } = await supabase
      .from("players")
      .update({ reclub_url: null, reclub_avatar_url: null })
      .eq("id", playerId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/players/${playerId}`);
    revalidatePath("/");
    return { ok: true, url: null, avatarUrl: null };
  }

  const url = normalizeReclubUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      error: "That doesn't look like a Reclub profile (e.g. https://reclub.co/id/players/@darfat-41).",
    };
  }

  const avatarUrl = await resolveReclubAvatar(url);
  const { error } = await supabase
    .from("players")
    .update({ reclub_url: url, reclub_avatar_url: avatarUrl })
    .eq("id", playerId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/players/${playerId}`);
  revalidatePath("/");
  return { ok: true, url, avatarUrl };
}

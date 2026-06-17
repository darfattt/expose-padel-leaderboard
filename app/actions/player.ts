"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import type { PlayerPosition, RacketOption } from "@/lib/types";

const PADELFUL_BASE = "https://www.padelful.com";

// Shape of a racket as returned by GET /api/v1/rackets (only fields we use).
interface PadelfulRacket {
  slug: string;
  model?: string;
  title?: string;
  brand?: string;
  image?: string | null;
  shape?: string | null;
  rating?: string | number | null;
}

function toAbsoluteImage(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${PADELFUL_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function toRacketOption(r: PadelfulRacket): RacketOption {
  return {
    slug: r.slug,
    name: r.model ?? r.title ?? r.slug,
    brand: r.brand ?? "",
    image: toAbsoluteImage(r.image),
    shape: r.shape ?? null,
    rating: r.rating != null ? String(r.rating) : null,
  };
}

// Live racket search against the Padelful catalogue. Runs server-side so the
// browser never hits the third-party API directly (avoids CORS). Returns [] on
// any failure so the picker degrades to an empty result list.
export async function searchRackets(query: string): Promise<RacketOption[]> {
  const q = query.trim();
  const params = new URLSearchParams({ limit: "12" });
  if (q) params.set("query", q);
  try {
    const res = await fetch(`${PADELFUL_BASE}/api/v1/rackets?${params.toString()}`, {
      headers: { accept: "application/json" },
      // Catalogue is stable; cache for a day to keep keystroke search snappy.
      next: { revalidate: 86_400 },
    });
    if (!res.ok) throw new Error(`Padelful API ${res.status}`);
    const json = (await res.json()) as { data?: { rackets?: PadelfulRacket[] } };
    return (json.data?.rackets ?? []).map(toRacketOption);
  } catch {
    return [];
  }
}

export interface UpdateResult {
  ok: boolean;
  error?: string;
}

// Persist (or clear) a player's racket. Pass null to remove the gear.
export async function updatePlayerRacket(
  playerId: string,
  racket: RacketOption | null
): Promise<UpdateResult> {
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { error } = await supabase
    .from("players")
    .update({
      racket_slug: racket?.slug ?? null,
      racket_name: racket?.name ?? null,
      racket_brand: racket?.brand ?? null,
      racket_image: racket?.image ?? null,
    })
    .eq("id", playerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/players/${playerId}`);
  return { ok: true };
}

// Persist (or clear) a player's on-court position.
export async function updatePlayerPosition(
  playerId: string,
  position: PlayerPosition | null
): Promise<UpdateResult> {
  if (position !== null && !["Right", "Left", "Both"].includes(position)) {
    return { ok: false, error: "Invalid position." };
  }
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { error } = await supabase
    .from("players")
    .update({ position })
    .eq("id", playerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/players/${playerId}`);
  return { ok: true };
}

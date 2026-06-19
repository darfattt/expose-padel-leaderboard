"use server";

import { revalidatePath, unstable_cache } from "next/cache";
import type { Attributes } from "@/lib/archetype";
import { racketCriteria, type RacketCriteria, type RacketRecommendation } from "@/lib/racket-reco";
import { createServiceClient } from "@/lib/supabase/server";
import type { Gender, PlayerPosition, RacketOption } from "@/lib/types";

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

// Shape of a pick from POST /api/v1/recommendations (only fields we use).
interface PadelfulRecommendation {
  slug: string;
  model?: string;
  title?: string;
  brand?: string;
  shape?: string | null;
  feel?: string | null;
  rating?: string | number | null;
  pvp?: number | null;
  url?: string | null;
  matchReason?: string;
}

function toAbsoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${PADELFUL_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function toRecommendation(r: PadelfulRecommendation): RacketRecommendation {
  return {
    slug: r.slug,
    model: r.model ?? r.title ?? r.slug,
    brand: r.brand ?? "",
    shape: r.shape ?? null,
    feel: r.feel ?? null,
    rating: r.rating != null ? String(r.rating) : null,
    price: typeof r.pvp === "number" ? r.pvp : null,
    image: null, // filled in by enrichWithImage — the reco endpoint omits it
    url: toAbsoluteUrl(r.url),
    matchReason: r.matchReason ?? "",
  };
}

// The recommendations endpoint omits the product shot (and a player's own racket
// stores no shape), so look both up per slug from GET /api/v1/rackets/{slug}.
// Cached (stable catalogue); returns nulls on any miss so callers degrade.
interface RacketDetail {
  image: string | null;
  shape: string | null;
  rating: number | null; // Padelful's 0–10 review score
}

// Coerce the catalogue's rating (string | number) to a finite number, or null.
function parseRating(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

const fetchRacketDetail = unstable_cache(
  async (slug: string): Promise<RacketDetail> => {
    try {
      const res = await fetch(`${PADELFUL_BASE}/api/v1/rackets/${encodeURIComponent(slug)}`, {
        headers: { accept: "application/json" },
        next: { revalidate: 86_400 },
      });
      if (!res.ok) return { image: null, shape: null, rating: null };
      const json = (await res.json()) as {
        data?: { racket?: { image?: string | null; shape?: string | null; rating?: string | number | null } };
      };
      return {
        image: toAbsoluteImage(json.data?.racket?.image),
        shape: json.data?.racket?.shape ?? null,
        rating: parseRating(json.data?.racket?.rating),
      };
    } catch {
      return { image: null, shape: null, rating: null };
    }
  },
  ["racket-detail"],
  { revalidate: 86_400 }
);

// Shape ("Diamond" | "Round" | "Teardrop" | …) for a single racket slug, so a
// player's own racket can be classified power/control on the profile. Null on
// any miss (the contrast line simply isn't drawn).
export async function getRacketShape(slug: string): Promise<string | null> {
  return (await fetchRacketDetail(slug)).shape;
}

// Padelful's 0–10 review score for a single racket slug, so a player's own frame
// can be weighed in the match sim — a better-rated weapon out-guns a budget
// paddle (see lib/sim/power.ts). Null on any miss, so the gear edge falls back to
// simply owning a racket.
export async function getRacketRating(slug: string): Promise<number | null> {
  return (await fetchRacketDetail(slug)).rating;
}

// POST is not cached by Next's fetch Data Cache, so cache the result ourselves
// keyed by the (level, playStyle) criteria — only nine combinations exist, and
// the catalogue is stable. Throws on failure so a transient error is never
// cached; getRacketRecommendations swallows it into [].
const fetchRecommendations = unstable_cache(
  async (criteria: RacketCriteria): Promise<RacketRecommendation[]> => {
    const res = await fetch(`${PADELFUL_BASE}/api/v1/recommendations`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...criteria, locale: "en" }),
    });
    if (!res.ok) throw new Error(`Padelful API ${res.status}`);
    const json = (await res.json()) as {
      data?: { recommendations?: PadelfulRecommendation[] };
    };
    const recs = (json.data?.recommendations ?? []).map(toRecommendation);
    return Promise.all(
      recs.map(async (r) => ({ ...r, image: (await fetchRacketDetail(r.slug)).image }))
    );
  },
  ["racket-recommendations"],
  { revalidate: 86_400 }
);

// Racket recommendations for a player's current rating + attributes. Returns []
// on any failure so the card degrades gracefully (mirrors searchRackets).
export async function getRacketRecommendations(
  rating: number,
  attributes: Attributes
): Promise<RacketRecommendation[]> {
  try {
    return await fetchRecommendations(racketCriteria(rating, attributes));
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

// Persist (or clear) a player's gender. Drives which FIP ranking the "plays
// like" pro comparison is drawn from (see lib/pros.ts); no effect on ratings.
export async function updatePlayerGender(
  playerId: string,
  gender: Gender | null
): Promise<UpdateResult> {
  if (gender !== null && !["male", "female"].includes(gender)) {
    return { ok: false, error: "Invalid gender." };
  }
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const { error } = await supabase
    .from("players")
    .update({ gender })
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

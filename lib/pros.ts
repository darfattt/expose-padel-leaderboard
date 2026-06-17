import ranking from "@/data/fip_men_ranking_top90.json";
import type { AttributeKey } from "./archetype";

// Pro padel reference data — shared by the server (report generation) and the
// client (ReportCard photo rendering), so this module must stay free of any
// server-only imports (no "ai", node:crypto, etc.).
//
// Source of truth is the live FIP men's top-90 ranking (data/fip_men_…json),
// which carries each pro's official rank + headshot URL. We pick comparison
// candidates by RANK: a player's 0–7 rating maps onto the rank ladder, so the
// best local players get compared to the world's #1-caliber pros and weaker
// players to lower-ranked pros. The archetype then rotates *which* slice of that
// rank band is offered, so two players at the same rating but different styles
// get different (still rank-appropriate) combinations.

interface RankingFile {
  players: { rank: number; name: string; photo: string }[];
}

interface Pro {
  rank: number;
  name: string;
  photo?: string; // undefined when the source only had a placeholder image
}

// FIP uses a shared placeholder for players without an official headshot.
const PLACEHOLDER = "placeholder-table";

// Rank-sorted, best first. Photos that are just the FIP placeholder are dropped
// so those pros fall back to a generated initials avatar in the UI.
const PROS: Pro[] = (ranking as RankingFile).players
  .map((p) => ({
    rank: p.rank,
    name: p.name,
    photo: p.photo.includes(PLACEHOLDER) ? undefined : p.photo,
  }))
  .sort((a, b) => a.rank - b.rank);

const PHOTO_BY_NAME = new Map<string, string | undefined>();
for (const p of PROS) if (!PHOTO_BY_NAME.has(p.name)) PHOTO_BY_NAME.set(p.name, p.photo);

export function proPhoto(name: string): string | undefined {
  return PHOTO_BY_NAME.get(name) ?? PHOTO_BY_NAME.get(name.trim());
}

// Playstyle flavor per archetype — used only to colour the model's reasoning,
// since the rank-90 source carries no style metadata.
const ARCHETYPE_NOTES: Record<AttributeKey | "balanced", string> = {
  attack: "explosive finishers who win points outright with the smash",
  defense: "elite retrievers who give opponents almost nothing",
  consistency: "metronomic, low-error anchors who never beat themselves",
  clutch: "ice-cold competitors who thrive on the decisive points",
  win: "relentless winners who find a way regardless of how the points fall",
  balanced: "complete, all-court players with no exploitable weakness",
};

// Distinct rotation offset per archetype, so the candidate combination varies by
// playstyle while staying inside the rating-derived rank band.
const ARCHETYPE_SEED: Record<AttributeKey | "balanced", number> = {
  attack: 0,
  defense: 2,
  consistency: 4,
  clutch: 1,
  win: 3,
  balanced: 5,
};

export interface ProCandidates {
  pros: string[];
  note: string;
  rankLow: number; // best (numerically lowest) rank offered
  rankHigh: number; // lowest rank offered
}

const WINDOW = 8; // pros considered around the rating-mapped rank
const PICKS = 4; // how many candidates we actually hand to the model

// Candidate pros for a player, chosen by rating→rank. rating 7 → top of the
// ladder (rank ~1); rating 0 → bottom of the top-90. The archetype rotates which
// PICKS pros within the window are offered.
export function proCandidates(
  rating: number,
  archetypeKey: AttributeKey | "balanced"
): ProCandidates {
  const n = PROS.length;
  const clamped = Math.min(7, Math.max(0, rating));
  const center = Math.round((1 - clamped / 7) * (n - 1));
  const size = Math.min(WINDOW, n);
  const start = Math.min(Math.max(center - Math.floor(size / 2), 0), n - size);
  const window = PROS.slice(start, start + size);

  const seed = ARCHETYPE_SEED[archetypeKey] ?? 0;
  const picked: Pro[] = [];
  for (let i = 0; i < Math.min(PICKS, window.length); i++) {
    picked.push(window[(i + seed) % window.length]);
  }

  // De-dup, then present in rank order for a clean, readable candidate list.
  const uniq = [...new Map(picked.map((p) => [p.name, p])).values()].sort(
    (a, b) => a.rank - b.rank
  );
  const ranks = uniq.map((p) => p.rank);
  return {
    pros: uniq.map((p) => p.name),
    note: ARCHETYPE_NOTES[archetypeKey],
    rankLow: Math.min(...ranks),
    rankHigh: Math.max(...ranks),
  };
}

// Up to two initials from a player name, for the avatar fallback.
export function proInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const AVATAR_PALETTE = ["#ff7759", "#2f9e44", "#1863dc", "#f08c00", "#7048e8", "#e8590c"];

// Deterministic accent color for a name, so a given pro always gets the same
// avatar background.
export function proAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

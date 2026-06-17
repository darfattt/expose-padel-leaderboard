import { createReadClient } from "./supabase/server";
import type { Club } from "./types";

export const DEFAULT_CLUB_SLUG = "expose-padel";

// All clubs, ordered with the default ("Expose Padel") first, then by name.
// Returns [] when Supabase isn't configured so pages can render without one.
export async function getClubs(): Promise<Club[]> {
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase
      .from("clubs")
      .select("id, name, slug")
      .order("created_at", { ascending: true });
    if (error) throw error;
    const clubs = (data ?? []) as Club[];
    return clubs.sort((a, b) => {
      if (a.slug === DEFAULT_CLUB_SLUG) return -1;
      if (b.slug === DEFAULT_CLUB_SLUG) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export function defaultClub(clubs: Club[]): Club | null {
  return clubs.find((c) => c.slug === DEFAULT_CLUB_SLUG) ?? clubs[0] ?? null;
}

"use server";

import { revalidatePath } from "next/cache";
import { slugify } from "@/lib/slug";
import { createServiceClient } from "@/lib/supabase/server";

export interface RegisterClubResult {
  ok: boolean;
  clubId?: string;
  slug?: string;
  error?: string;
}

// Register a new club. Gated behind the global super-admin password
// (UPLOAD_PASSWORD) so only the operator can mint clubs. Each club gets its own
// admin password, which lets a club admin upload events for that club without
// the super-admin password (see saveScoresheet).
export async function registerClub(formData: FormData): Promise<RegisterClubResult> {
  const superPassword = process.env.UPLOAD_PASSWORD;
  if (!superPassword) {
    return { ok: false, error: "Club registration is disabled — UPLOAD_PASSWORD is not configured." };
  }
  if ((formData.get("superPassword") as string | null)?.trim() !== superPassword) {
    return { ok: false, error: "Incorrect super-admin password." };
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (!name) return { ok: false, error: "Club name is required." };

  const adminPassword = (formData.get("adminPassword") as string | null)?.trim() ?? "";
  if (!adminPassword) return { ok: false, error: "Set an admin password for the club." };

  const baseSlug = slugify(name);
  if (!baseSlug) return { ok: false, error: "Club name must contain letters or numbers." };

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Find a free slug: base, base-2, base-3, …
  const { data: existing, error: existErr } = await supabase
    .from("clubs")
    .select("slug")
    .like("slug", `${baseSlug}%`);
  if (existErr) return { ok: false, error: `Could not check existing clubs: ${existErr.message}` };
  const taken = new Set((existing ?? []).map((c) => c.slug as string));
  let slug = baseSlug;
  for (let n = 2; taken.has(slug); n++) slug = `${baseSlug}-${n}`;

  const { data, error } = await supabase
    .from("clubs")
    .insert({ name, slug, admin_password: adminPassword })
    .select("id, slug")
    .single();
  if (error || !data) {
    return { ok: false, error: `Failed to create club: ${error?.message}` };
  }

  revalidatePath("/upload");
  return { ok: true, clubId: data.id as string, slug: data.slug as string };
}

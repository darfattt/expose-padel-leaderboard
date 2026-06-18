"use server";

import { revalidatePath } from "next/cache";
import { parseScoresheet } from "@/lib/parse-scoresheet";
import { normalizeName, scoresheetHash } from "@/lib/normalize";
import { createServiceClient } from "@/lib/supabase/server";
import type { ParsedScoresheet } from "@/lib/types";

export interface PreviewResult {
  ok: boolean;
  parsed?: ParsedScoresheet;
  contentHash?: string;
  duplicate?: boolean;
  error?: string;
}

export interface SaveResult {
  ok: boolean;
  eventId?: string;
  duplicate?: boolean;
  error?: string;
}

async function readPdf(formData: FormData): Promise<Uint8Array | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "No PDF file provided." };
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "File must be a PDF." };
  }
  return new Uint8Array(await file.arrayBuffer());
}

// Step 1: parse + validate the uploaded PDF and report whether it's a dup.
// Does not write anything.
export async function previewScoresheet(formData: FormData): Promise<PreviewResult> {
  const bytes = await readPdf(formData);
  if ("error" in bytes) return { ok: false, error: bytes.error };

  let parsed: ParsedScoresheet;
  try {
    const name = (formData.get("file") as File).name;
    parsed = await parseScoresheet(bytes, name);
  } catch (e) {
    return { ok: false, error: `Could not parse PDF: ${(e as Error).message}` };
  }
  if (!parsed.matches.length) {
    return { ok: false, error: "No matches found in this PDF — is it a Reclub scoresheet?" };
  }

  const contentHash = scoresheetHash(parsed);
  let duplicate = false;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("events")
      .select("id")
      .eq("content_hash", contentHash)
      .maybeSingle();
    duplicate = !!data;
  } catch {
    // No DB configured — let the preview through; save will surface the error.
  }

  return { ok: true, parsed, contentHash, duplicate };
}

// Step 2: re-parse and persist. Re-parses server-side (don't trust client) and
// inserts event → players (deduped) → matches → match_players atomically enough
// for this app. Blocks duplicates via content_hash.
export async function saveScoresheet(formData: FormData): Promise<SaveResult> {
  const bytes = await readPdf(formData);
  if ("error" in bytes) return { ok: false, error: bytes.error };

  // Club the scoresheet belongs to (selected in the preview form).
  const clubId = (formData.get("clubId") as string | null)?.trim() || null;

  // Verify the upload password. Two ways in: the global super-admin password
  // (UPLOAD_PASSWORD) works for any club, or the selected club's own
  // admin_password works for that club only.
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const password = (formData.get("password") as string | null)?.trim() ?? "";
  const superPassword = process.env.UPLOAD_PASSWORD;
  let authorized = !!superPassword && password === superPassword;
  if (!authorized && password && clubId) {
    const { data: club } = await supabase
      .from("clubs")
      .select("admin_password")
      .eq("id", clubId)
      .maybeSingle();
    authorized = !!club?.admin_password && password === club.admin_password;
  }
  if (!authorized) {
    if (!superPassword) {
      return { ok: false, error: "Uploads are disabled — UPLOAD_PASSWORD is not configured." };
    }
    return { ok: false, error: "Incorrect password." };
  }

  let parsed: ParsedScoresheet;
  try {
    const name = (formData.get("file") as File).name;
    parsed = await parseScoresheet(bytes, name);
  } catch (e) {
    return { ok: false, error: `Could not parse PDF: ${(e as Error).message}` };
  }

  // Apply user-edited event title / date from the preview form, if provided.
  const editedTitle = (formData.get("title") as string | null)?.trim();
  if (editedTitle) parsed.event.title = editedTitle;
  const editedDate = (formData.get("playedOn") as string | null)?.trim();
  if (editedDate) parsed.event.playedOn = editedDate;

  // Scoring basis (points per game) — detected by the parser, confirmable/
  // overridable in the preview form. Drives rating normalization (lib/scoring.ts).
  const editedPpg = Number((formData.get("pointsPerGame") as string | null)?.trim());
  if (Number.isFinite(editedPpg) && editedPpg > 0) parsed.event.pointsPerGame = editedPpg;

  const contentHash = scoresheetHash(parsed);

  // Duplicate guard.
  const { data: existing } = await supabase
    .from("events")
    .select("id")
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (existing) return { ok: false, duplicate: true, eventId: existing.id as string };

  // 1) Event.
  const { event } = parsed;
  const { data: eventRow, error: eventErr } = await supabase
    .from("events")
    .insert({
      title: event.title,
      raw_title: event.rawTitle,
      played_on: event.playedOn,
      location: event.location,
      format: event.format,
      num_courts: event.numCourts,
      num_players: event.numPlayers,
      points_per_game: event.pointsPerGame ?? 21,
      club_id: clubId,
      source_filename: (formData.get("file") as File).name,
      content_hash: contentHash,
    })
    .select("id")
    .single();
  if (eventErr || !eventRow) {
    return { ok: false, error: `Failed to create event: ${eventErr?.message}` };
  }
  const eventId = eventRow.id as string;

  // 2) Players — dedupe by normalized_name. Upsert all unique names, then map.
  const nameByNorm = new Map<string, string>();
  for (const m of parsed.matches) {
    for (const n of [...m.team1, ...m.team2]) {
      const norm = normalizeName(n);
      if (!nameByNorm.has(norm)) nameByNorm.set(norm, n);
    }
  }
  const playerUpserts = [...nameByNorm.entries()].map(([normalized_name, name]) => ({
    name,
    normalized_name,
  }));
  const { error: upsertErr } = await supabase
    .from("players")
    .upsert(playerUpserts, { onConflict: "normalized_name", ignoreDuplicates: true });
  if (upsertErr) {
    await supabase.from("events").delete().eq("id", eventId);
    return { ok: false, error: `Failed to upsert players: ${upsertErr.message}` };
  }
  const { data: playerRows, error: selErr } = await supabase
    .from("players")
    .select("id, normalized_name")
    .in("normalized_name", [...nameByNorm.keys()]);
  if (selErr || !playerRows) {
    await supabase.from("events").delete().eq("id", eventId);
    return { ok: false, error: `Failed to load players: ${selErr?.message}` };
  }
  const idByNorm = new Map<string, string>();
  for (const r of playerRows) idByNorm.set(r.normalized_name as string, r.id as string);

  // 3) Matches.
  const matchInserts = parsed.matches.map((m) => ({
    event_id: eventId,
    round: m.round,
    court: m.court,
    team1_score: m.team1Score,
    team2_score: m.team2Score,
  }));
  const { data: matchRows, error: matchErr } = await supabase
    .from("matches")
    .insert(matchInserts)
    .select("id, round, court");
  if (matchErr || !matchRows) {
    await supabase.from("events").delete().eq("id", eventId);
    return { ok: false, error: `Failed to insert matches: ${matchErr?.message}` };
  }
  const matchIdByKey = new Map<string, string>();
  for (const r of matchRows) matchIdByKey.set(`${r.round}:${r.court}`, r.id as string);

  // 4) match_players — 4 rows per match.
  const mpInserts: {
    match_id: string;
    player_id: string;
    team: number;
    points: number;
    conceded: number;
    won: boolean;
    is_draw: boolean;
  }[] = [];
  for (const m of parsed.matches) {
    const matchId = matchIdByKey.get(`${m.round}:${m.court}`);
    if (!matchId) continue;
    const isDraw = m.team1Score === m.team2Score;
    const team1Won = m.team1Score > m.team2Score;
    for (const n of m.team1) {
      const pid = idByNorm.get(normalizeName(n));
      if (!pid) continue;
      mpInserts.push({
        match_id: matchId,
        player_id: pid,
        team: 1,
        points: m.team1Score,
        conceded: m.team2Score,
        won: !isDraw && team1Won,
        is_draw: isDraw,
      });
    }
    for (const n of m.team2) {
      const pid = idByNorm.get(normalizeName(n));
      if (!pid) continue;
      mpInserts.push({
        match_id: matchId,
        player_id: pid,
        team: 2,
        points: m.team2Score,
        conceded: m.team1Score,
        won: !isDraw && !team1Won,
        is_draw: isDraw,
      });
    }
  }
  const { error: mpErr } = await supabase.from("match_players").insert(mpInserts);
  if (mpErr) {
    await supabase.from("events").delete().eq("id", eventId);
    return { ok: false, error: `Failed to insert match players: ${mpErr.message}` };
  }

  revalidatePath("/");
  revalidatePath(`/events/${eventId}`);
  return { ok: true, eventId };
}

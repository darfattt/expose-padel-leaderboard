import { createReadClient } from "./supabase/server";

export interface PlayerRow {
  id: string;
  name: string;
}

export interface MatchHistoryEntry {
  matchId: string;
  eventId: string;
  eventTitle: string;
  playedOn: string | null;
  round: number;
  court: number;
  partner: string | null;
  opponents: string[];
  points: number;
  conceded: number;
  result: "W" | "L" | "D";
}

export interface EventRow {
  id: string;
  title: string;
  raw_title: string | null;
  played_on: string | null;
  location: string | null;
  format: string | null;
  num_courts: number | null;
  num_players: number | null;
  source_filename: string | null;
  created_at: string;
}

export interface EventMatch {
  matchId: string;
  round: number;
  court: number;
  team1: string[];
  team1Score: number;
  team2: string[];
  team2Score: number;
}

export async function getPlayer(id: string): Promise<PlayerRow | null> {
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase.from("players").select("id, name").eq("id", id).single();
    if (error) throw error;
    return data as PlayerRow;
  } catch {
    return null;
  }
}

// Full match history for a player: each game with partner, opponents, score,
// and result, newest event first. Two queries + in-memory grouping (no N+1).
export async function getPlayerMatchHistory(id: string): Promise<MatchHistoryEntry[]> {
  try {
    const supabase = createReadClient();
    const { data: mine, error: e1 } = await supabase
      .from("match_players")
      .select(
        "match_id, team, points, conceded, won, is_draw, matches!inner(id, round, court, event_id, events!inner(title, played_on))"
      )
      .eq("player_id", id);
    if (e1) throw e1;
    if (!mine?.length) return [];

    const matchIds = mine.map((r) => r.match_id as string);
    const { data: participants, error: e2 } = await supabase
      .from("match_players")
      .select("match_id, team, player_id, players!inner(name)")
      .in("match_id", matchIds);
    if (e2) throw e2;

    const byMatch = new Map<string, { team: number; name: string }[]>();
    for (const p of participants ?? []) {
      const list = byMatch.get(p.match_id as string) ?? [];
      // Supabase types the joined relation as an array; it's a single row here.
      const player = Array.isArray(p.players) ? p.players[0] : p.players;
      list.push({ team: p.team as number, name: (player as { name: string }).name });
      byMatch.set(p.match_id as string, list);
    }

    const entries: MatchHistoryEntry[] = mine.map((r) => {
      const match = Array.isArray(r.matches) ? r.matches[0] : r.matches;
      const m = match as {
        id: string;
        round: number;
        court: number;
        event_id: string;
        events: { title: string; played_on: string | null } | { title: string; played_on: string | null }[];
      };
      const ev = Array.isArray(m.events) ? m.events[0] : m.events;
      const others = (byMatch.get(r.match_id as string) ?? []).filter(
        (o) => o.name !== undefined
      );
      const myTeam = r.team as number;
      // partner = same team, but not me (best-effort by team membership)
      const sameTeam = others.filter((o) => o.team === myTeam);
      const oppTeam = others.filter((o) => o.team !== myTeam);
      const partner = sameTeam.find((o) => o.name)?.name ?? null;
      const result: "W" | "L" | "D" = r.is_draw ? "D" : r.won ? "W" : "L";
      return {
        matchId: m.id,
        eventId: m.event_id,
        eventTitle: ev?.title ?? "Event",
        playedOn: ev?.played_on ?? null,
        round: m.round,
        court: m.court,
        partner,
        opponents: oppTeam.map((o) => o.name),
        points: r.points as number,
        conceded: r.conceded as number,
        result,
      };
    });

    entries.sort((a, b) => {
      const d = (b.playedOn ?? "").localeCompare(a.playedOn ?? "");
      if (d !== 0) return d;
      return a.round - b.round || a.court - b.court;
    });
    return entries;
  } catch {
    return [];
  }
}

export async function getEvent(id: string): Promise<EventRow | null> {
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase.from("events").select("*").eq("id", id).single();
    if (error) throw error;
    return data as EventRow;
  } catch {
    return null;
  }
}

export async function getEventResults(eventId: string): Promise<EventMatch[]> {
  try {
    const supabase = createReadClient();
    const { data: matches, error } = await supabase
      .from("matches")
      .select("id, round, court, team1_score, team2_score")
      .eq("event_id", eventId)
      .order("round")
      .order("court");
    if (error) throw error;
    if (!matches?.length) return [];

    const matchIds = matches.map((m) => m.id as string);
    const { data: participants, error: e2 } = await supabase
      .from("match_players")
      .select("match_id, team, players!inner(name)")
      .in("match_id", matchIds);
    if (e2) throw e2;

    const byMatch = new Map<string, { team: number; name: string }[]>();
    for (const p of participants ?? []) {
      const player = Array.isArray(p.players) ? p.players[0] : p.players;
      const list = byMatch.get(p.match_id as string) ?? [];
      list.push({ team: p.team as number, name: (player as { name: string }).name });
      byMatch.set(p.match_id as string, list);
    }

    return matches.map((m) => {
      const people = byMatch.get(m.id as string) ?? [];
      return {
        matchId: m.id as string,
        round: m.round as number,
        court: m.court as number,
        team1: people.filter((p) => p.team === 1).map((p) => p.name),
        team1Score: m.team1_score as number,
        team2: people.filter((p) => p.team === 2).map((p) => p.name),
        team2Score: m.team2_score as number,
      };
    });
  } catch {
    return [];
  }
}

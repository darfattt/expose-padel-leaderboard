import type { ParticipantRow } from "./h2h-matrix";
import { createReadClient } from "./supabase/server";
import type { PlayerGear, PlayerPosition } from "./types";

export interface PlayerRow {
  id: string;
  name: string;
}

export interface MatchHistoryEntry {
  matchId: string;
  eventId: string;
  eventTitle: string;
  location: string | null;
  playedOn: string | null;
  round: number;
  court: number;
  partner: string | null;
  partnerId: string | null;
  opponents: string[];
  opponentIds: string[];
  points: number;
  conceded: number;
  result: "W" | "L" | "D";
  pointsPerGame?: number | null; // event scoring basis, for rating normalization (lib/scoring.ts); absent → canonical
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
  club_id: string | null;
  club_name: string | null;
}

// Supabase rows before flattening the embedded clubs relation.
type RawEventRow = Omit<EventRow, "club_name"> & {
  clubs: { name: string } | { name: string }[] | null;
};

function flattenEvent(row: RawEventRow): EventRow {
  const { clubs, ...rest } = row;
  const club = Array.isArray(clubs) ? clubs[0] : clubs;
  return { ...rest, club_name: club?.name ?? null };
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

// A player's editable gear/position. Returns empty fields when Supabase isn't
// configured or the player has no row yet, so the editor renders an empty state.
export async function getPlayerGear(id: string): Promise<PlayerGear> {
  const empty: PlayerGear = {
    position: null,
    racketSlug: null,
    racketName: null,
    racketBrand: null,
    racketImage: null,
  };
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase
      .from("players")
      .select("position, racket_slug, racket_name, racket_brand, racket_image")
      .eq("id", id)
      .single();
    if (error) throw error;
    return {
      position: (data.position as PlayerPosition | null) ?? null,
      racketSlug: (data.racket_slug as string | null) ?? null,
      racketName: (data.racket_name as string | null) ?? null,
      racketBrand: (data.racket_brand as string | null) ?? null,
      racketImage: (data.racket_image as string | null) ?? null,
    };
  } catch {
    return empty;
  }
}

// The racket each player has set on their profile, keyed by player id. Players
// who haven't picked a racket are omitted. Returns an empty map when Supabase
// isn't configured, so the racket leaderboard renders an empty state.
export interface PlayerRacket {
  brand: string;
  name: string | null;
  slug: string | null;
  image: string | null;
}

export async function getPlayerRackets(): Promise<Map<string, PlayerRacket>> {
  const byPlayer = new Map<string, PlayerRacket>();
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase
      .from("players")
      .select("id, racket_brand, racket_name, racket_slug, racket_image")
      .not("racket_brand", "is", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const brand = ((row.racket_brand as string | null) ?? "").trim();
      if (!brand) continue;
      byPlayer.set(row.id as string, {
        brand,
        name: (row.racket_name as string | null) ?? null,
        slug: (row.racket_slug as string | null) ?? null,
        image: (row.racket_image as string | null) ?? null,
      });
    }
    return byPlayer;
  } catch {
    return byPlayer;
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
        "match_id, team, points, conceded, won, is_draw, matches!inner(id, round, court, event_id, events!inner(title, played_on, location, points_per_game))"
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

    const byMatch = new Map<string, { team: number; playerId: string; name: string }[]>();
    for (const p of participants ?? []) {
      const list = byMatch.get(p.match_id as string) ?? [];
      // Supabase types the joined relation as an array; it's a single row here.
      const player = Array.isArray(p.players) ? p.players[0] : p.players;
      list.push({
        team: p.team as number,
        playerId: p.player_id as string,
        name: (player as { name: string }).name,
      });
      byMatch.set(p.match_id as string, list);
    }

    const entries: MatchHistoryEntry[] = mine.map((r) => {
      const match = Array.isArray(r.matches) ? r.matches[0] : r.matches;
      const m = match as {
        id: string;
        round: number;
        court: number;
        event_id: string;
        events:
          | { title: string; played_on: string | null; location: string | null; points_per_game: number | null }
          | { title: string; played_on: string | null; location: string | null; points_per_game: number | null }[];
      };
      const ev = Array.isArray(m.events) ? m.events[0] : m.events;
      // Everyone in the match except the player whose history this is.
      const others = (byMatch.get(r.match_id as string) ?? []).filter(
        (o) => o.name !== undefined && o.playerId !== id
      );
      const myTeam = r.team as number;
      const sameTeam = others.filter((o) => o.team === myTeam);
      const oppTeam = others.filter((o) => o.team !== myTeam);
      const partnerEntry = sameTeam.find((o) => o.name);
      const partner = partnerEntry?.name ?? null;
      const result: "W" | "L" | "D" = r.is_draw ? "D" : r.won ? "W" : "L";
      return {
        matchId: m.id,
        eventId: m.event_id,
        eventTitle: ev?.title ?? "Event",
        location: ev?.location ?? null,
        playedOn: ev?.played_on ?? null,
        round: m.round,
        court: m.court,
        partner,
        partnerId: partnerEntry?.playerId ?? null,
        opponents: oppTeam.map((o) => o.name),
        opponentIds: oppTeam.map((o) => o.playerId),
        points: r.points as number,
        conceded: r.conceded as number,
        result,
        pointsPerGame: ev?.points_per_game ?? null,
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

// All events, newest first. Returns [] when Supabase isn't configured or the
// table is empty, so the events page can render an empty state.
export async function getEvents(): Promise<EventRow[]> {
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase
      .from("events")
      .select("*, clubs(name)")
      .order("played_on", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as RawEventRow[]).map(flattenEvent);
  } catch {
    return [];
  }
}

export async function getEvent(id: string): Promise<EventRow | null> {
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase
      .from("events")
      .select("*, clubs(name)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return flattenEvent(data as RawEventRow);
  } catch {
    return null;
  }
}

// One per-player row for every game in an event (4 rows per match). Unlike
// getEventResults (team-level, names only) this carries player ids + per-player
// points, so per-event awards (lib/awards.ts) can aggregate by player and by
// pairing. Two queries + in-memory join (no N+1).
export interface EventPlayerResult {
  matchId: string;
  round: number;
  court: number;
  team: number; // 1 or 2
  playerId: string;
  name: string;
  points: number; // own team's score
  conceded: number; // opponent team's score
  won: boolean;
  isDraw: boolean;
}

export async function getEventPlayerResults(eventId: string): Promise<EventPlayerResult[]> {
  try {
    const supabase = createReadClient();
    const { data: matches, error } = await supabase
      .from("matches")
      .select("id, round, court")
      .eq("event_id", eventId);
    if (error) throw error;
    if (!matches?.length) return [];

    const meta = new Map(
      matches.map((m) => [m.id as string, { round: m.round as number, court: m.court as number }])
    );
    const matchIds = matches.map((m) => m.id as string);
    const { data: mps, error: e2 } = await supabase
      .from("match_players")
      .select("match_id, team, player_id, points, conceded, won, is_draw, players!inner(name)")
      .in("match_id", matchIds);
    if (e2) throw e2;

    return (mps ?? []).map((r) => {
      const player = Array.isArray(r.players) ? r.players[0] : r.players;
      const m = meta.get(r.match_id as string)!;
      return {
        matchId: r.match_id as string,
        round: m.round,
        court: m.court,
        team: r.team as number,
        playerId: r.player_id as string,
        name: (player as { name: string }).name,
        points: r.points as number,
        conceded: r.conceded as number,
        won: r.won as boolean,
        isDraw: r.is_draw as boolean,
      };
    });
  } catch {
    return [];
  }
}

// Every match-player fact across all events, flattened to the shape the
// head-to-head matrix consumes (one row per player-in-a-game, with the player's
// name and score line). Single query, no N+1. Returns [] when Supabase isn't
// configured, so the matrix page renders an empty state.
export async function getAllParticipants(): Promise<ParticipantRow[]> {
  try {
    const supabase = createReadClient();
    const { data, error } = await supabase
      .from("match_players")
      .select("match_id, team, player_id, points, conceded, won, is_draw, players!inner(name)");
    if (error) throw error;
    return (data ?? []).map((r) => {
      const player = Array.isArray(r.players) ? r.players[0] : r.players;
      return {
        matchId: r.match_id as string,
        team: r.team as number,
        playerId: r.player_id as string,
        name: (player as { name: string }).name,
        won: r.won as boolean,
        isDraw: r.is_draw as boolean,
        points: r.points as number,
        conceded: r.conceded as number,
      };
    });
  } catch {
    return [];
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

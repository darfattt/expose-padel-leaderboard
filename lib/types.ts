// Normalized payload emitted by the PDF parser.
export interface ParsedMatch {
  round: number;
  court: number;
  team1: string[]; // 2 player names
  team1Score: number;
  team2: string[]; // 2 player names
  team2Score: number;
}

export interface ParsedEvent {
  title: string;
  rawTitle: string;
  playedOn: string | null; // ISO date (yyyy-mm-dd) when derivable
  location: string | null;
  format: string | null;
  numCourts: number | null;
  numPlayers: number | null;
}

export interface ParsedScoresheet {
  event: ParsedEvent;
  matches: ParsedMatch[];
  warnings: string[];
}

// A padel club / community that owns uploaded events.
export interface Club {
  id: string;
  name: string;
  slug: string;
}

// On-court playing position.
export type PlayerPosition = "Right" | "Left" | "Both";

// A racket from the Padelful catalogue (https://docs.padelful.com/api/rackets),
// trimmed to the fields we display and persist.
export interface RacketOption {
  slug: string;
  name: string;
  brand: string;
  image: string | null; // absolute URL
  shape: string | null;
  rating: string | null;
}

// A player's editable gear/profile, as stored on the players row.
export interface PlayerGear {
  position: PlayerPosition | null;
  racketSlug: string | null;
  racketName: string | null;
  racketBrand: string | null;
  racketImage: string | null;
}

// Aggregate row from the player_career_stats view (raw, pre-rating).
// When scoped to a club (player_club_stats) club_id is also present.
export interface CareerStatRow {
  player_id: string;
  name: string;
  club_id?: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  points_for: number;
  points_against: number;
  point_diff: number; // points_for - points_against
  close_games: number; // games decided by margin <= 3
  close_wins: number;
  score_variance: number; // variance of own per-game points
}

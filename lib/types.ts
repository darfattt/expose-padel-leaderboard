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
  pointsPerGame: number | null; // detected scoring basis (e.g. 21, or 5 for a fixed-sum "to 5"); see lib/scoring.ts
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
  // Scoring-basis-normalized aggregates (every game scaled to a 21-point
  // equivalent; see lib/scoring.ts). The rating layer reads these so events on
  // different scales (e.g. "to 5" vs "to 21") are comparable; the raw fields
  // above stay verbatim for display. Optional — absent for hand-built rows and
  // pre-normalization data, where callers fall back to the raw field (factor 1).
  norm_points_for?: number;
  norm_points_against?: number;
  norm_point_diff?: number; // cumulative normalized net points (feeds the reliability gate)
  norm_close_games?: number;
  norm_close_wins?: number;
  norm_score_variance?: number;
}

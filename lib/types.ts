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

// Aggregate row from the player_career_stats view (raw, pre-rating).
export interface CareerStatRow {
  player_id: string;
  name: string;
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

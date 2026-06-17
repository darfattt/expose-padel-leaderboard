// Field-wide head-to-head: every player's record against every other player,
// built in one pass from raw match-player facts (no N+1). Powers the matchup
// heatmap (/matrix). Pure and field-free like the rest of lib/ — one row per
// player-in-a-game, opponents are whoever shared that match on the other team.
//
// A doubles game counts as one head-to-head meeting against *each* opponent on
// the far team, matching opponentRecords() in lib/relationships.ts.

export interface ParticipantRow {
  matchId: string;
  team: number; // 1 or 2
  playerId: string;
  name: string;
  won: boolean;
  isDraw: boolean;
  points: number; // own team's score
  conceded: number; // opponent team's score
}

export interface H2HCell {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number; // wins / games (draws count as non-wins)
  pointDiff: number; // own points minus conceded across these meetings
}

export interface H2HMatrix {
  ids: string[]; // every player with at least one recorded meeting
  nameById: Map<string, string>;
  records: Map<string, Map<string, H2HCell>>; // a → b → a's record vs b
}

interface Acc {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  pointDiff: number;
}

export function buildH2HMatrix(rows: ParticipantRow[]): H2HMatrix {
  const byMatch = new Map<string, ParticipantRow[]>();
  for (const r of rows) {
    const list = byMatch.get(r.matchId) ?? [];
    list.push(r);
    byMatch.set(r.matchId, list);
  }

  const nameById = new Map<string, string>();
  const acc = new Map<string, Map<string, Acc>>();
  const add = (a: ParticipantRow, oppId: string) => {
    let row = acc.get(a.playerId);
    if (!row) {
      row = new Map();
      acc.set(a.playerId, row);
    }
    let c = row.get(oppId);
    if (!c) {
      c = { games: 0, wins: 0, losses: 0, draws: 0, pointDiff: 0 };
      row.set(oppId, c);
    }
    c.games += 1;
    if (a.isDraw) c.draws += 1;
    else if (a.won) c.wins += 1;
    else c.losses += 1;
    c.pointDiff += a.points - a.conceded;
  };

  for (const parts of byMatch.values()) {
    for (const a of parts) {
      nameById.set(a.playerId, a.name);
      for (const b of parts) {
        if (a.team === b.team) continue; // teammates aren't opponents
        add(a, b.playerId);
      }
    }
  }

  const records = new Map<string, Map<string, H2HCell>>();
  for (const [aId, row] of acc) {
    const fin = new Map<string, H2HCell>();
    for (const [bId, c] of row) {
      fin.set(bId, { ...c, winRate: c.games > 0 ? c.wins / c.games : 0 });
    }
    records.set(aId, fin);
  }

  return { ids: [...acc.keys()], nameById, records };
}

// a's record against b, or null when they've never met.
export function h2hCell(m: H2HMatrix, a: string, b: string): H2HCell | null {
  return m.records.get(a)?.get(b) ?? null;
}

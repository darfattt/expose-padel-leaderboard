import type { MatchHistoryEntry } from "./queries";

// "Gossip stats" derived purely from a player's match history: who they win with
// (partner chemistry), who they win/lose against (rivalries + head-to-head), and
// how they're trending (form). All field-free — these only need one player's
// games — so they're computed on read like the rest of lib/ (cf. rating-history).

// Superlatives (best/worst partner, nemesis, favourite victim) need enough shared
// games to be meaningful; a 1-game 100% partner is noise. Mirrors MIN_GAMES_RANKED.
export const MIN_SHARED_GAMES = 3;
// How many recent results the form strip shows.
export const FORM_WINDOW = 5;

// An aggregated record against (or alongside) one other player. Used for both
// partners and opponents. winRate counts draws as non-wins (wins / games), and
// pointDiff is this player's own points minus conceded across those games.
export interface PairRecord {
  id: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  pointDiff: number;
}

export interface FormSummary {
  recent: ("W" | "L" | "D")[]; // most recent first, up to FORM_WINDOW
  currentStreak: { result: "W" | "L" | "D"; length: number } | null;
  longestWinStreak: number;
}

export interface PartnerChemistry {
  partners: PairRecord[]; // every partner, most games first
  best: PairRecord | null; // highest win rate among eligible partners
  worst: PairRecord | null; // lowest win rate among eligible partners
}

export interface Rivalries {
  opponents: PairRecord[]; // every opponent faced, most games first
  nemesis: PairRecord | null; // loses to them most (losing record, gated)
  favoriteVictim: PairRecord | null; // beats them most (winning record, gated)
}

export interface HeadToHead {
  record: PairRecord;
  games: MatchHistoryEntry[]; // shared games, most recent first
}

// --- internal accumulation -------------------------------------------------

interface Acc {
  id: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  pointDiff: number;
}

function addGame(acc: Map<string, Acc>, id: string, name: string, m: MatchHistoryEntry): void {
  let a = acc.get(id);
  if (!a) {
    a = { id, name, games: 0, wins: 0, losses: 0, draws: 0, pointDiff: 0 };
    acc.set(id, a);
  }
  a.games += 1;
  if (m.result === "W") a.wins += 1;
  else if (m.result === "L") a.losses += 1;
  else a.draws += 1;
  a.pointDiff += m.points - m.conceded;
}

function finalize(a: Acc): PairRecord {
  return {
    id: a.id,
    name: a.name,
    games: a.games,
    wins: a.wins,
    losses: a.losses,
    draws: a.draws,
    winRate: a.games > 0 ? a.wins / a.games : 0,
    pointDiff: a.pointDiff,
  };
}

function byGamesThenName(a: PairRecord, b: PairRecord): number {
  return b.games - a.games || a.name.localeCompare(b.name);
}

// Most-recent-first. getPlayerMatchHistory sorts events newest-first but rounds
// *ascending* within an event, so the array is NOT reverse-chronological at the
// game level — re-sort before reading "last N" / streaks. Undated games sort last.
function chronoDesc(a: MatchHistoryEntry, b: MatchHistoryEntry): number {
  const d = (b.playedOn ?? "").localeCompare(a.playedOn ?? "");
  if (d !== 0) return d;
  if (b.round !== a.round) return b.round - a.round;
  return b.court - a.court;
}

// --- public API ------------------------------------------------------------

export function partnerChemistry(matches: MatchHistoryEntry[]): PartnerChemistry {
  const acc = new Map<string, Acc>();
  for (const m of matches) {
    if (!m.partnerId) continue; // formats with no fixed partner / odd player counts
    addGame(acc, m.partnerId, m.partner ?? "Unknown", m);
  }
  const partners = [...acc.values()].map(finalize).sort(byGamesThenName);

  // Rank eligible partners by win rate; best is the top, worst is the bottom.
  // Worst is only shown when there are at least two eligible partners, so the
  // same person never appears as both best and worst.
  const ranked = partners
    .filter((p) => p.games >= MIN_SHARED_GAMES)
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name));
  const best = ranked[0] ?? null;
  const worst = ranked.length >= 2 ? ranked[ranked.length - 1] : null;

  return { partners, best, worst };
}

export function opponentRecords(matches: MatchHistoryEntry[]): PairRecord[] {
  const acc = new Map<string, Acc>();
  for (const m of matches) {
    m.opponentIds.forEach((id, i) => addGame(acc, id, m.opponents[i] ?? "Unknown", m));
  }
  return [...acc.values()].map(finalize).sort(byGamesThenName);
}

// Win/loss record per venue (using the event location as the key). Lets us find
// a player's happy hunting ground — where they win most.
export function venueRecords(matches: MatchHistoryEntry[]): PairRecord[] {
  const acc = new Map<string, Acc>();
  for (const m of matches) {
    const loc = m.location?.trim();
    if (!loc) continue;
    addGame(acc, loc, loc, m);
  }
  return [...acc.values()].map(finalize).sort(byGamesThenName);
}

// The venue with the highest win rate among those with enough games, or null.
export function bestVenue(matches: MatchHistoryEntry[]): PairRecord | null {
  const eligible = venueRecords(matches).filter((v) => v.games >= MIN_SHARED_GAMES);
  return (
    eligible.sort(
      (a, b) => b.winRate - a.winRate || b.games - a.games || a.name.localeCompare(b.name)
    )[0] ?? null
  );
}

export function rivalries(matches: MatchHistoryEntry[]): Rivalries {
  const opponents = opponentRecords(matches);
  const eligible = opponents.filter((o) => o.games >= MIN_SHARED_GAMES);

  // Nemesis: a losing record against them, ranked by losses then dominance.
  const nemesis =
    eligible
      .filter((o) => o.losses > o.wins)
      .sort((a, b) => b.losses - a.losses || a.winRate - b.winRate || a.name.localeCompare(b.name))[0] ??
    null;
  // Favourite victim: a winning record against them, ranked by wins then dominance.
  const favoriteVictim =
    eligible
      .filter((o) => o.wins > o.losses)
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name))[0] ??
    null;

  return { opponents, nemesis, favoriteVictim };
}

export function computeForm(matches: MatchHistoryEntry[]): FormSummary {
  const results = [...matches].sort(chronoDesc).map((m) => m.result);
  if (!results.length) return { recent: [], currentStreak: null, longestWinStreak: 0 };

  const recent = results.slice(0, FORM_WINDOW);

  // Current streak: the run of identical results from the most recent game.
  const head = results[0];
  let length = 0;
  for (const r of results) {
    if (r !== head) break;
    length += 1;
  }

  // Longest win streak: the longest run of consecutive wins anywhere (a draw or
  // loss breaks it), consistent with win rate treating draws as non-wins.
  let longestWinStreak = 0;
  let run = 0;
  for (const r of results) {
    if (r === "W") {
      run += 1;
      if (run > longestWinStreak) longestWinStreak = run;
    } else {
      run = 0;
    }
  }

  return { recent, currentStreak: { result: head, length }, longestWinStreak };
}

// A compact, grounded paragraph of the player's relational patterns — fed into
// the LLM report fact sheet so the scouting report can mention chemistry, rivals,
// and form. Pure text; only includes lines the data actually supports.
export function relationshipSummary(matches: MatchHistoryEntry[]): string {
  const form = computeForm(matches);
  const { best, worst } = partnerChemistry(matches);
  const { nemesis, favoriteVictim } = rivalries(matches);
  const rec = (r: PairRecord) =>
    `${r.wins}W-${r.losses}L over ${r.games} (${Math.round(r.winRate * 100)}% win)`;

  const lines: string[] = [];
  if (form.recent.length) {
    const parts = [`recent ${form.recent.join(" ")}`];
    if (form.currentStreak) parts.push(`on a ${form.currentStreak.length}${form.currentStreak.result} streak`);
    if (form.longestWinStreak > 1) parts.push(`longest win streak ${form.longestWinStreak}`);
    lines.push(`Form (newest first): ${parts.join("; ")}.`);
  }
  if (best) lines.push(`Best partner: ${best.name} — ${rec(best)}.`);
  if (worst) lines.push(`Toughest pairing: ${worst.name} — ${rec(worst)}.`);
  if (nemesis) lines.push(`Nemesis: ${nemesis.name} — lost ${nemesis.losses} of ${nemesis.games} meetings.`);
  if (favoriteVictim)
    lines.push(`Favourite victim: ${favoriteVictim.name} — won ${favoriteVictim.wins} of ${favoriteVictim.games}.`);

  return lines.length ? lines.join("\n") : "(not enough games yet for partner/rivalry patterns)";
}

export function headToHead(matches: MatchHistoryEntry[], opponentId: string): HeadToHead {
  const shared = matches.filter((m) => m.opponentIds.includes(opponentId));
  const acc = new Map<string, Acc>();
  for (const m of shared) {
    const idx = m.opponentIds.indexOf(opponentId);
    addGame(acc, opponentId, m.opponents[idx] ?? "Unknown", m);
  }
  const a = acc.get(opponentId);
  const record: PairRecord = a
    ? finalize(a)
    : { id: opponentId, name: "", games: 0, wins: 0, losses: 0, draws: 0, winRate: 0, pointDiff: 0 };
  return { record, games: [...shared].sort(chronoDesc) };
}

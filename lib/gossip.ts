import type { PairRecord, PartnerChemistry, Rivalries } from "./relationships";

// Punchy "gossip stats" one-liners derived from the relationship data. These are
// the hooks shown above each section — fun in tone but strictly grounded: every
// number and name comes from the data, and a hook returns null when there's
// nothing worth saying (the section just shows its table instead).

const pct = (r: PairRecord) => Math.round(r.winRate * 100);

export function partnerHook(c: PartnerChemistry): string | null {
  const { best, worst } = c;
  if (best && worst)
    return `🔥 ${best.name} brings out your A-game (${pct(best)}% together) — but ${worst.name}? It's complicated (${pct(worst)}%).`;
  if (best) return `🔥 You and ${best.name} are a problem for everyone — ${pct(best)}% as a duo.`;
  return null;
}

export function rivalryHook(r: Rivalries): string | null {
  const { nemesis, favoriteVictim } = r;
  if (nemesis && favoriteVictim)
    return `😤 ${nemesis.name} has your number (${nemesis.losses} losses) — but ${favoriteVictim.name} dreads you (${favoriteVictim.wins} wins).`;
  if (nemesis) return `👀 ${nemesis.name} keeps beating you — ${nemesis.losses} times and counting.`;
  if (favoriteVictim)
    return `😎 ${favoriteVictim.name} can't catch a break — you've won ${favoriteVictim.wins} of your meetings.`;
  return null;
}

export function venueHook(best: PairRecord | null): string | null {
  if (!best) return null;
  return `🏆 ${best.name} is your happy hunting ground — ${pct(best)}% wins there.`;
}

// H2H is from `player`'s perspective; `record` is their W/L against `opponent`.
export function h2hHook(playerName: string, opponentName: string, record: PairRecord): string {
  const { wins, losses } = record;
  if (wins > losses) return `😎 ${playerName} owns this rivalry — ${wins}–${losses}.`;
  if (losses > wins) return `😬 ${opponentName} has the upper hand — ${wins}–${losses} from ${playerName}'s side.`;
  return `🤝 Dead even at ${wins}–${losses}. Someone has to break the tie.`;
}

import crypto from "node:crypto";
import { generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import type { MatchHistoryEntry } from "./queries";
import { bestVenue, relationshipSummary } from "./relationships";
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

// --- LLM gossip summary ----------------------------------------------------
//
// A short, fun "gossip column" paragraph the model writes from the SAME grounded
// relationship facts the deterministic hooks use. Mirrors the Player Report
// pipeline (lib/report.ts): grounded fact sheet → generateObject via Groq, cache
// keyed by an input hash, reuse the same enable/model env switches. Bump
// GOSSIP_PROMPT_VERSION when the prompt/schema changes to invalidate caches.
const GOSSIP_PROMPT_VERSION = "v1-gossip";

// Same enable/model switches as the Player Report (lib/report.ts), kept local so
// gossip.ts stays free of report.ts's server-only dependency chain (pros/leaderboard).
export function gossipEnabled(): boolean {
  return process.env.REPORTS_ENABLED !== "false" && !!process.env.GROQ_API_KEY;
}

export function gossipModel(): string {
  return process.env.REPORT_MODEL || "llama-3.3-70b-versatile";
}

export const gossipSummarySchema = z.object({
  summary: z
    .string()
    .describe(
      "A fun, gossip-column-style 1-2 sentence read on this player's partnerships, rivalries and current form. Written in the second person ('you'). Strictly grounded — only use names, numbers and streaks present in the facts."
    ),
  vibe: z
    .string()
    .describe("A short, playful 2-4 word lowercase label for the player's on-court social vibe."),
});
export type GossipSummary = z.infer<typeof gossipSummarySchema>;

// Whether there's enough relational signal to bother generating a summary.
export function hasGossipMaterial(matches: MatchHistoryEntry[]): boolean {
  return matches.length > 0 && relationshipSummary(matches).startsWith("(") === false;
}

// A compact, fully-grounded fact sheet — the model is told to use ONLY this.
export function buildGossipFacts(matches: MatchHistoryEntry[]): string {
  const venue = bestVenue(matches);
  const lines = [relationshipSummary(matches)];
  if (venue) {
    lines.push(
      `Happy hunting ground: ${venue.name} — ${Math.round(venue.winRate * 100)}% wins over ${venue.games} games there.`
    );
  }
  return lines.join("\n");
}

export function gossipInputHash(facts: string, model: string): string {
  return crypto.createHash("sha256").update(`${GOSSIP_PROMPT_VERSION}\n${model}\n${facts}`).digest("hex");
}

const GOSSIP_SYSTEM_PROMPT = `You are a witty padel "gossip columnist" writing a one-liner about a recreational league player's social and competitive dynamics.
Rules:
- Use ONLY the supplied facts. Never invent partners, rivals, scores, streaks, venues, or numbers.
- Be playful and punchy, like a sports-locker-room rumour — but every claim must be backed by the facts.
- Keep "summary" to 1-2 sentences, in the second person ("you").
- If the facts are thin, keep it light and don't overstate; never fabricate to fill space.`;

// Generate the gossip summary. Returns null when reports are disabled/unconfigured.
export async function generateGossipSummary(
  matches: MatchHistoryEntry[]
): Promise<{ summary: GossipSummary; model: string; inputHash: string } | null> {
  if (!gossipEnabled()) return null;
  const model = gossipModel();
  const facts = buildGossipFacts(matches);
  const inputHash = gossipInputHash(facts, model);

  const { object } = await generateObject({
    model: groq(model),
    schema: gossipSummarySchema,
    system: GOSSIP_SYSTEM_PROMPT,
    prompt: `Write the gossip line for this player.\n\n${facts}`,
  });

  return { summary: object, model, inputHash };
}

import crypto from "node:crypto";
import { generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import type { RankedPlayer } from "./leaderboard";
import { levelForRating } from "./levels";
import { proCandidates } from "./pros";
import type { MatchHistoryEntry } from "./queries";
import { relationshipSummary } from "./relationships";

// Bump when the prompt/schema changes so cached reports regenerate.
const PROMPT_VERSION = "v7-relationships";

export const proComparisonSchema = z.object({
  name: z.string().describe("Full name of a real professional padel player."),
  reason: z
    .string()
    .describe("One short clause tying this player's stats/archetype to that pro's style."),
});
export type ProComparison = z.infer<typeof proComparisonSchema>;

export const reportSchema = z.object({
  headline: z.string().describe("A short, punchy 3-6 word scouting headline."),
  report: z.string().describe("A 2-4 sentence padel Player Report, factual and energetic."),
  tags: z.array(z.string()).describe("2-4 lowercase descriptor tags, e.g. 'high-scoring', 'clutch'."),
  similarPros: z
    .array(proComparisonSchema)
    .min(1)
    .max(3)
    .describe(
      "1-3 pro padel players whose style matches this player's archetype, chosen ONLY from the supplied candidate list."
    ),
});
export type GeneratedReport = z.infer<typeof reportSchema>;

export interface ReportInput {
  player: RankedPlayer;
  matches: MatchHistoryEntry[];
}

export function reportsEnabled(): boolean {
  return process.env.REPORTS_ENABLED !== "false" && !!process.env.GROQ_API_KEY;
}

export function reportModel(): string {
  return process.env.REPORT_MODEL || "llama-3.3-70b-versatile";
}

// A compact, fully-grounded fact sheet. The model is told to use ONLY this.
export function buildReportFacts(input: ReportInput): string {
  const { player, matches } = input;
  const r = player.row;
  const a = player.attributes;
  const log = matches
    .slice(0, 14)
    .map(
      (m) =>
        `R${m.round} | partner: ${m.partner ?? "?"} | vs ${m.opponents.join(" & ") || "?"} | ${m.points}-${m.conceded} | ${m.result}`
    )
    .join("\n");

  const candidates = proCandidates(player.rating, player.archetype.primary);
  const level = levelForRating(player.rating);

  return [
    `Player: ${r.name}`,
    `Performance rating: ${player.rating.toFixed(1)}/10${player.provisional ? " (provisional — fewer than 3 games)" : ""}`,
    `Level: ${level.category} (Playtomic-style) — ${level.description}`,
    `Archetype: ${player.archetype.label} — ${player.archetype.description}`,
    `Attributes (0-100): Power ${a.attack}, Consistency ${a.consistency}, Clutch ${a.clutch}, Win ${a.win}`,
    `Record: ${r.wins}W-${r.losses}L-${r.draws}D over ${r.games} games`,
    `Points for/against: ${r.points_for} / ${r.points_against} (differential ${r.point_diff >= 0 ? "+" : ""}${r.point_diff})`,
    `Close games (margin <= 3): ${r.close_wins} won of ${r.close_games}`,
    ``,
    `Partnerships, rivalries & form:`,
    relationshipSummary(matches),
    ``,
    `Pro comparison candidates — FIP men's world ranks #${candidates.rankLow}-#${candidates.rankHigh}, the tier this player's ${player.rating.toFixed(1)}/10 rating maps onto (${candidates.note}). Pick 1-3 of EXACTLY these, no one else:`,
    candidates.pros.map((p) => `- ${p}`).join("\n"),
    ``,
    `Match log (most recent first):`,
    log || "(no matches)",
  ].join("\n");
}

export function reportInputHash(facts: string, model: string): string {
  return crypto.createHash("sha256").update(`${PROMPT_VERSION}\n${model}\n${facts}`).digest("hex");
}

const SYSTEM_PROMPT = `You are a padel analyst writing a short Player Report for a recreational Mexicano or Americano-format leaderboard.
Rules:
- Use ONLY the supplied statistics for any claim about THIS player. Never invent matches, scores, opponents, or numbers not present.
- Reference the player's archetype and their standout numbers (rating, record, scoring, clutch record).
- Where it adds colour, weave in one relational detail from the partnerships/rivalries/form section (e.g. a go-to partner, a nemesis, or a current streak). Only if present — never invent names or streaks.
- In "similarPros", compare the player's PLAYSTYLE to professional padel players. Pick 1-3 ONLY from the supplied candidate list — never name a pro who isn't listed. The list is already scoped to the FIP world-rank tier that matches this player's rating, so treat the pick as a fitting caliber comparison. For each, give a one-clause reason linking the pick to this player's actual stats/archetype (e.g. "same point-a-minute scoring", "wins the tight ones like…").
- Keep the report 2-4 sentences, energetic but factual. No hype the numbers don't support.
- If stats are provisional (few games), acknowledge the small sample.`;

// Returns null when reports are disabled / unconfigured.
export async function generatePlayerReport(
  input: ReportInput
): Promise<{ report: GeneratedReport; model: string; inputHash: string } | null> {
  if (!reportsEnabled()) return null;
  const model = reportModel();
  const facts = buildReportFacts(input);
  const inputHash = reportInputHash(facts, model);

  const { object } = await generateObject({
    model: groq(model),
    schema: reportSchema,
    system: SYSTEM_PROMPT,
    prompt: `Write a Player Report for this player.\n\n${facts}`,
  });

  return { report: object, model, inputHash };
}

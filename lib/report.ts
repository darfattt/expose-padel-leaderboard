import crypto from "node:crypto";
import { generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import type { AttributeKey } from "./archetype";
import type { RankedPlayer } from "./leaderboard";
import type { MatchHistoryEntry } from "./queries";

// Bump when the prompt/schema changes so cached reports regenerate.
const PROMPT_VERSION = "v2-pros";

export const proComparisonSchema = z.object({
  name: z.string().describe("Full name of a real professional padel player."),
  reason: z
    .string()
    .describe("One short clause tying this player's stats/archetype to that pro's style."),
});
export type ProComparison = z.infer<typeof proComparisonSchema>;

export const reportSchema = z.object({
  headline: z.string().describe("A short, punchy 3-6 word scouting headline."),
  report: z.string().describe("A 2-4 sentence padel scouting report, factual and energetic."),
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

// Curated pro padel reference players per archetype. Given to the model as the
// ONLY allowed pool for comparisons, so it can't invent non-existent pros.
const ARCHETYPE_PROS: Record<AttributeKey | "balanced", { pros: string[]; note: string }> = {
  attack: {
    pros: ["Agustín Tapia", "Juan Lebrón", "Franco Stupaczuk"],
    note: "explosive finishers who win points outright with the smash",
  },
  defense: {
    pros: ["Sanyo Gutiérrez", "Fernando Belasteguín", "Ariana Sánchez"],
    note: "elite retrievers who give opponents almost nothing",
  },
  consistency: {
    pros: ["Fernando Belasteguín", "Alejandro Galán", "Gemma Triay"],
    note: "metronomic, low-error anchors who never beat themselves",
  },
  clutch: {
    pros: ["Juan Lebrón", "Agustín Tapia", "Paula Josemaría"],
    note: "ice-cold competitors who thrive on the decisive points",
  },
  win: {
    pros: ["Arturo Coello", "Alejandro Galán", "Alejandra Salazar"],
    note: "relentless winners who find a way regardless of how the points fall",
  },
  balanced: {
    pros: ["Alejandro Galán", "Paquito Navarro", "Gemma Triay"],
    note: "complete, all-court players with no exploitable weakness",
  },
};

export function proCandidatesFor(archetypeKey: AttributeKey | "balanced") {
  return ARCHETYPE_PROS[archetypeKey];
}

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

  const candidates = proCandidatesFor(player.archetype.key);

  return [
    `Player: ${r.name}`,
    `Performance rating: ${player.rating}/100${player.provisional ? " (provisional — fewer than 3 games)" : ""}`,
    `Archetype: ${player.archetype.label} — ${player.archetype.description}`,
    `Attributes (0-100): Attack ${a.attack}, Defense ${a.defense}, Consistency ${a.consistency}, Clutch ${a.clutch}, Win ${a.win}`,
    `Record: ${r.wins}W-${r.losses}L-${r.draws}D over ${r.games} games`,
    `Points for/against: ${r.points_for} / ${r.points_against} (differential ${r.point_diff >= 0 ? "+" : ""}${r.point_diff})`,
    `Close games (margin <= 3): ${r.close_wins} won of ${r.close_games}`,
    ``,
    `Pro comparison candidates for this archetype (${candidates.note}) — pick 1-3 of EXACTLY these, no one else:`,
    candidates.pros.map((p) => `- ${p}`).join("\n"),
    ``,
    `Match log (most recent first):`,
    log || "(no matches)",
  ].join("\n");
}

export function reportInputHash(facts: string, model: string): string {
  return crypto.createHash("sha256").update(`${PROMPT_VERSION}\n${model}\n${facts}`).digest("hex");
}

const SYSTEM_PROMPT = `You are a padel analyst writing a short scouting report for a recreational Mexicano or Americano-format leaderboard.
Rules:
- Use ONLY the supplied statistics for any claim about THIS player. Never invent matches, scores, opponents, or numbers not present.
- Reference the player's archetype and their standout numbers (rating, record, scoring, clutch record).
- In "similarPros", compare the player's PLAYSTYLE to professional padel players. Pick 1-3 ONLY from the supplied candidate list — never name a pro who isn't listed. For each, give a one-clause reason linking the pick to this player's actual stats/archetype (e.g. "same point-a-minute scoring", "wins the tight ones like…").
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
    prompt: `Write a scouting report for this player.\n\n${facts}`,
  });

  return { report: object, model, inputHash };
}

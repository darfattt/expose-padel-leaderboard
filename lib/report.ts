import crypto from "node:crypto";
import { generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { type AchievementContext, computeAchievements } from "./achievements";
import type { RankedPlayer } from "./leaderboard";
import { levelForRating } from "./levels";
import { proCandidates } from "./pros";
import type { MatchHistoryEntry } from "./queries";
import { nextReliabilityGate, reliabilityCap } from "./rating";
import { bestVenue, relationshipSummary } from "./relationships";
import type { PlayerGear } from "./types";

// Bump when the prompt/schema changes so cached reports regenerate.
const PROMPT_VERSION = "v11-context-gear-long";

export const proComparisonSchema = z.object({
  name: z.string().describe("Full name of a real professional padel player."),
  reason: z
    .string()
    .describe("One short clause tying this player's stats/archetype to that pro's style."),
});
export type ProComparison = z.infer<typeof proComparisonSchema>;

export const reportSchema = z.object({
  headline: z.string().describe("A short, punchy 3-6 word scouting headline."),
  report: z
    .string()
    .describe(
      "A fun padel Player Report of 4-6 sentences across two short paragraphs: the first on their game/style/standout numbers, the second on their story — rivalries, partners, form, gear, or badges."
    ),
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
  // Optional leaderboard context so field-relative badges (Giant Killer, David,
  // Podium, Event Champion, …) light up in the report. Omitted → those badges
  // simply don't appear, same as elsewhere.
  context?: AchievementContext;
  // Optional gear/position (racket + on-court side) for extra colour.
  gear?: PlayerGear;
}

export function reportsEnabled(): boolean {
  return process.env.REPORTS_ENABLED !== "false" && !!process.env.GROQ_API_KEY;
}

export function reportModel(): string {
  return process.env.REPORT_MODEL || "llama-3.3-70b-versatile";
}

// A compact, fully-grounded fact sheet. The model is told to use ONLY this.
export function buildReportFacts(input: ReportInput): string {
  const { player, matches, context, gear } = input;
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

  // Reliability framing: this league only trusts a high level once it's earned on
  // net points + wins (see lib/rating.ts), so a hot streak can't fake an Elite
  // rating. Surface where the player sits relative to that gate.
  const reliability = { score: r.point_diff, wins: r.wins };
  const cap = reliabilityCap(reliability);
  const gate = nextReliabilityGate(reliability);
  const capped = gate !== null && player.rating >= cap - 1e-9;

  // --- Extra colour, all grounded in the same facts -------------------------
  const winPct = r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0;

  // Signature strength / softest spot from the 0-100 display attributes.
  const attrs = [
    { label: "Power", v: a.attack },
    { label: "Consistency", v: a.consistency },
    { label: "Clutch", v: a.clutch },
    { label: "Winning", v: a.win },
  ];
  const top = attrs.reduce((best, x) => (x.v > best.v ? x : best));
  const low = attrs.reduce((worst, x) => (x.v < worst.v ? x : worst));

  // The happy hunting ground (best win rate among venues with enough games).
  const venue = bestVenue(matches);

  // Biggest beatdown handed out and heaviest beating taken, for flavour.
  let bestWin: MatchHistoryEntry | null = null;
  let worstLoss: MatchHistoryEntry | null = null;
  for (const m of matches) {
    const margin = m.points - m.conceded;
    if (m.result === "W" && (!bestWin || margin > bestWin.points - bestWin.conceded)) bestWin = m;
    if (m.result === "L" && (!worstLoss || margin < worstLoss.points - worstLoss.conceded)) worstLoss = m;
  }
  const scoreLine = (m: MatchHistoryEntry) =>
    `${m.points}-${m.conceded} vs ${m.opponents.join(" & ") || "?"}`;

  // Earned badges give the report ready-made nicknames to riff on. With context,
  // the field-relative ones (Giant Killer, David, Podium, Event Champion, …) join in.
  const badges = computeAchievements(r, matches, context);
  const trophies = badges.filter((b) => b.earned && b.tone === "good").map((b) => `${b.badge} ${b.name}`);
  const shame = badges.filter((b) => b.earned && b.tone === "bad").map((b) => `${b.badge} ${b.name}`);

  // Gear & on-court side, when the player has filled them in. In padel the left
  // side is usually the finisher/smasher and the right the steady playmaker — the
  // model can play with that, but only the stated side is a hard fact.
  const racket = gear?.racketName
    ? `${gear.racketName}${gear.racketBrand ? ` (${gear.racketBrand})` : ""}`
    : null;
  const sideNote =
    gear?.position === "Left"
      ? " (typically the finisher/smasher side)"
      : gear?.position === "Right"
        ? " (typically the steady playmaker side)"
        : gear?.position === "Both"
          ? " (comfortable on either side)"
          : "";

  const lines = [
    `Player: ${r.name}`,
    player.rank != null ? `League rank: #${player.rank} of the ranked field.` : `Not yet ranked (still provisional).`,
    `Performance rating: ${player.rating.toFixed(1)}/7 (Playtomic scale)${player.provisional ? " (provisional — fewer than 3 games)" : ""}`,
    `Level: ${level.category} (Playtomic-style) — ${level.description}`,
    `Archetype: ${player.archetype.label} — ${player.archetype.description}`,
    `Attributes (0-100): Power ${a.attack}, Consistency ${a.consistency}, Clutch ${a.clutch}, Win ${a.win}`,
    `Signature strength: ${top.label} (${top.v}/100). Softest spot: ${low.label} (${low.v}/100).`,
    gear?.position ? `On-court side: ${gear.position}${sideNote}.` : null,
    racket ? `Weapon of choice: ${racket}.` : null,
    `Record: ${r.wins}W-${r.losses}L-${r.draws}D over ${r.games} games (${winPct}% win rate)`,
    `Points for/against: ${r.points_for} / ${r.points_against} (net ${r.point_diff >= 0 ? "+" : ""}${r.point_diff} — scored minus conceded; net points, not raw scoring, is what earns higher levels here)`,
    `Close games (margin <= 3): ${r.close_wins} won of ${r.close_games}`,
    bestWin ? `Biggest beatdown handed out: ${scoreLine(bestWin)}.` : null,
    worstLoss ? `Heaviest beating taken: ${scoreLine(worstLoss)}.` : null,
    venue ? `Happy hunting ground: ${venue.name} — ${venue.wins}W of ${venue.games} there (${Math.round(venue.winRate * 100)}%).` : null,
    `Reliability: proven up to ${cap.toFixed(1)}/7 (${levelForRating(cap).category}). ${
      gate
        ? `Needs +${gate.scoreNeeded} more net points and ${gate.winsNeeded} more wins to unlock the ${levelForRating(gate.tier.level).category} band.`
        : `Fully certified — every reliability gate cleared, the whole 0–7 ladder is unlocked.`
    }${capped ? " Their rating is currently held at this ceiling by reliability, not performance — they are out-playing their proven sample and knocking on the next band's door." : ""}`,
    trophies.length ? `Badges earned: ${trophies.join(", ")}.` : null,
    shame.length ? `Badges of shame (fair game for gentle ribbing): ${shame.join(", ")}.` : null,
    ``,
    `Partnerships, rivalries & form:`,
    relationshipSummary(matches),
    ``,
    `Pro comparison candidates — FIP men's world ranks #${candidates.rankLow}-#${candidates.rankHigh}, the tier this player's ${player.rating.toFixed(1)}/7 rating maps onto (${candidates.note}). Pick 1-3 of EXACTLY these, no one else:`,
    candidates.pros.map((p) => `- ${p}`).join("\n"),
    ``,
    `Match log (most recent first):`,
    log || "(no matches)",
  ];

  return lines.filter((l) => l !== null).join("\n");
}

export function reportInputHash(facts: string, model: string): string {
  return crypto.createHash("sha256").update(`${PROMPT_VERSION}\n${model}\n${facts}`).digest("hex");
}

const SYSTEM_PROMPT = `You are a witty padel pundit writing a short, fun Player Report for a recreational Mexicano or Americano-format leaderboard — think hype-man sports commentary with a wink, not a dry stat dump.
Voice & fun:
- Be playful, vivid and quotable: a punchy headline, a little swagger, the odd tasteful pun on the player's name, archetype, or a badge they own. Make people want to screenshot it.
- You may riff on their earned badges by name (e.g. lean into "Sharpshooter" or "Comeback Kid"), tease the "badges of shame" with gentle, good-natured ribbing, and play up their signature strength while winking at the softest spot.
- Colour to draw on when present: league rank, win rate, biggest beatdown / heaviest beating, happy hunting ground (a venue they own), a go-to partner, a nemesis, a current streak, their racket ("weapon of choice"), and their on-court side (left = finisher/smasher, right = steady playmaker) — feel free to tie their side or racket to their archetype and signature strength.
Hard grounding (never break these):
- Use ONLY the supplied statistics for any claim about THIS player. Never invent matches, scores, opponents, venues, badges, names, streaks, or numbers not present. The fun comes from how you say it, never from making things up.
- Reference the player's archetype and at least one standout number (rating, record, net scoring, or clutch record).
- In "similarPros", compare the player's PLAYSTYLE to professional padel players. Pick 1-3 ONLY from the supplied candidate list — never name a pro who isn't listed. The list is already scoped to the FIP world-rank tier that matches this player's rating, so treat the pick as a fitting caliber comparison. For each, give a one-clause reason linking the pick to this player's actual stats/archetype (e.g. "same point-a-minute scoring", "wins the tight ones like…").
- Treat NET points (scored minus conceded), not raw points-for, as the meaningful scoring stat — that is what earns higher levels in this league.
- A "Reliability" line shows how much of the 0-7 ladder the player has proven out. If it says their rating is held at a ceiling by reliability, you may frame them as out-playing their sample / knocking on the next band's door — but never quote gate numbers the line didn't give you, and don't claim a level they haven't reached. If fully certified, you may crown them as having proven the whole ladder.
- Length: write 4-10 sentences across TWO short paragraphs. First paragraph: their game — style/archetype, rating/level, and standout numbers (net scoring, win rate, clutch record). Second paragraph: their story — rivalries, partners, form, venue, gear/side, or badges. Energetic and funny, but every claim still earns its keep from the stats. No hype the numbers don't support.
- If stats are provisional (few games), have a little fun with the tiny sample rather than overselling it.`;

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

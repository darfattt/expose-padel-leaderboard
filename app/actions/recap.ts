"use server";

import { groq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import { z } from "zod";
import { computeEventAwards, type EventAwards } from "@/lib/awards";
import { fetchCareerStats, getLeaderboard } from "@/lib/leaderboard";
import { narrativeHash, readNarrative, writeNarrative } from "@/lib/narrative-cache";
import { getEvent, getEventPlayerResults } from "@/lib/queries";
import { RECAP_AWARDS, type AwardKey, type RecapQuips } from "@/lib/recap";
import { reportModel, reportsEnabled } from "@/lib/report";

// Witty one-liners for a Match Night recap, generated from the event's awards and
// cached in the `narratives` table. Same gating as Player Reports
// (REPORTS_ENABLED / GROQ_API_KEY); returns null when disabled so the recap card
// falls back to the deterministic stat lines.

const PROMPT_VERSION = "recap-v1";

const recapSchema = z.object({
  headline: z
    .string()
    .describe("A punchy 4-8 word headline summing up the night. No made-up names or numbers."),
  quips: z.array(
    z.object({
      award: z.string().describe("The exact award key supplied (e.g. 'mvp', 'biggestUpset')."),
      line: z
        .string()
        .describe("One witty sentence (max ~14 words) grounded ONLY in that award's supplied stat."),
    })
  ),
});

export interface EventRecapView {
  headline: string | null;
  quips: RecapQuips;
}

const VALID_KEYS = new Set<AwardKey>(RECAP_AWARDS.map((a) => a.key));

function buildRecapFacts(eventTitle: string, awards: EventAwards): string | null {
  const present = RECAP_AWARDS.map((a) => ({ ...a, winner: awards[a.key] })).filter(
    (a) => a.winner !== null
  );
  if (present.length === 0) return null;
  const lines = [
    `Event: ${eventTitle}`,
    "",
    "Awards (key | award | winner(s) | stat):",
    ...present.map(
      (a) => `${a.key} | ${a.label} | ${a.winner!.names.join(" & ")} | ${a.winner!.detail}`
    ),
  ];
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are a witty padel pundit recapping a recreational Mexicano/Americano "Match Night" for a group chat.
- For each award supplied, write ONE short, punchy, screenshot-worthy line (max ~14 words) that riffs on the winner and their stat.
- Echo back the exact award KEY you were given so each line can be matched up.
- Also write one overall headline for the night (4-8 words).
- HARD RULE: use ONLY the supplied names and stats. Never invent players, scores, opponents, or numbers. The fun is in the phrasing, not fabrication.
- Keep it good-natured. "Heartbreak" is gentle ribbing about near-misses, not mean.`;

export async function getOrCreateEventRecap(
  eventId: string,
  force = false
): Promise<EventRecapView | null> {
  const [event, rows, board, career] = await Promise.all([
    getEvent(eventId),
    getEventPlayerResults(eventId),
    getLeaderboard(),
    fetchCareerStats(),
  ]);
  if (!event || rows.length === 0) return null;

  const awards = computeEventAwards(rows, {
    ratingById: new Map(board.map((p) => [p.row.player_id, p.rating])),
    careerById: new Map(career.map((c) => [c.player_id, c])),
  });

  const facts = buildRecapFacts(event.title, awards);
  if (!facts) return null;

  const model = reportModel();
  const hash = narrativeHash(PROMPT_VERSION, model, facts);

  if (!force) {
    const cached = await readNarrative<EventRecapView>("event_recap", eventId, hash);
    if (cached) return cached;
  }

  if (!reportsEnabled()) return null;

  let view: EventRecapView;
  try {
    const { object } = await generateObject({
      model: groq(model),
      schema: recapSchema,
      system: SYSTEM_PROMPT,
      prompt: `Recap this Match Night.\n\n${facts}`,
    });
    const quips: RecapQuips = {};
    for (const q of object.quips) {
      const key = q.award as AwardKey;
      if (VALID_KEYS.has(key)) quips[key] = q.line;
    }
    view = { headline: object.headline, quips };
  } catch {
    return null;
  }

  await writeNarrative("event_recap", eventId, hash, model, view);
  return view;
}

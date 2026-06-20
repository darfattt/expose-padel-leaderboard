"use server";

import { groq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import { z } from "zod";
import { getClubs } from "@/lib/clubs";
import { getLeaderboardView } from "@/lib/leaderboard";
import { narrativeHash, readNarrative, writeNarrative } from "@/lib/narrative-cache";
import { buildPowerFacts, buildPowerRankings, hasPowerRankings } from "@/lib/power-rankings";
import { reportModel, reportsEnabled } from "@/lib/report";

// A short "This week in the club" Power Rankings column, generated from the
// board's movement and cached in the `narratives` table. Same gating as Player
// Reports; returns null when disabled so the page shows the movers without prose.

const PROMPT_VERSION = "power-v1";

const powerSchema = z.object({
  headline: z.string().describe("A punchy 4-8 word headline for this rankings drop."),
  column: z
    .string()
    .describe(
      "A 2-4 sentence punchy rankings column. Name the leader and the standout movers, with a little banter. Use ONLY the supplied names/ranks/numbers."
    ),
});

export interface PowerColumnView {
  headline: string | null;
  column: string;
}

const SYSTEM_PROMPT = `You write a short, witty "Power Rankings" column for a recreational padel league's group chat.
- 2-4 sentences. Open with who's on top, then call out the biggest climbers, fallers, and any new faces with playful banter.
- HARD RULE: use ONLY the supplied names, ranks, ratings and moves. Never invent players, numbers, matches, or events.
- Keep it good-natured ribbing, never mean. Make it screenshot-worthy.`;

export async function getOrCreatePowerColumn(
  clubId?: string,
  force = false
): Promise<PowerColumnView | null> {
  const [view, clubs] = await Promise.all([getLeaderboardView(clubId), getClubs()]);
  const pr = buildPowerRankings(view.board);
  if (!hasPowerRankings(pr)) return null;

  const scopeLabel = clubId ? clubs.find((c) => c.id === clubId)?.name ?? "This club" : "All clubs";
  const facts = buildPowerFacts(scopeLabel, pr);

  const model = reportModel();
  const hash = narrativeHash(PROMPT_VERSION, model, facts);
  const refId = `${clubId ?? "all"}:all`;

  if (!force) {
    const cached = await readNarrative<PowerColumnView>("power_rankings", refId, hash);
    if (cached) return cached;
  }

  if (!reportsEnabled()) return null;

  let view2: PowerColumnView;
  try {
    const { object } = await generateObject({
      model: groq(model),
      schema: powerSchema,
      system: SYSTEM_PROMPT,
      prompt: `Write the Power Rankings column.\n\n${facts}`,
    });
    view2 = { headline: object.headline, column: object.column };
  } catch {
    return null;
  }

  await writeNarrative("power_rankings", refId, hash, model, view2);
  return view2;
}

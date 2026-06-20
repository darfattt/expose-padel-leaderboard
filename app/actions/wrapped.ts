"use server";

import { groq } from "@ai-sdk/groq";
import { generateObject } from "ai";
import { z } from "zod";
import { narrativeHash, readNarrative, writeNarrative } from "@/lib/narrative-cache";
import { reportModel, reportsEnabled } from "@/lib/report";
import { buildWrapped } from "@/lib/wrapped";
import { loadWrappedInput } from "@/app/wrapped/[id]/data";

// A witty one-line "season opener" for a player's Padel Wrapped, cached in the
// `narratives` table. Same gating as Player Reports; returns null when disabled
// so the recap opens with a plain heading instead.

const PROMPT_VERSION = "wrapped-v1";

const wrappedSchema = z.object({
  headline: z.string().describe("A punchy 3-6 word title for this player's Wrapped."),
  blurb: z
    .string()
    .describe("One witty sentence (max ~20 words) summing up their run. Use ONLY the supplied facts."),
});

export interface WrappedIntroView {
  headline: string;
  blurb: string;
}

const SYSTEM_PROMPT = `You write the opening line of a padel player's "Wrapped" — a fun, personal season recap for a recreational league.
- Give a punchy headline (3-6 words) and one witty sentence summing up their season.
- HARD RULE: use ONLY the supplied facts (level, record, style, partner, nemesis, streak, badge, pro twin). Never invent names, numbers, or events.
- Warm and celebratory with a wink. Make them want to share it.`;

function factsFor(input: Awaited<ReturnType<typeof loadWrappedInput>>): string | null {
  if (!input) return null;
  const w = buildWrapped(input.input);
  const lines = [`Player: ${w.name}`, `Period: ${w.periodLabel}`, ""];
  for (const p of w.panels) {
    lines.push(`${p.label}: ${p.headline}${p.detail ? ` (${p.detail})` : ""}`);
  }
  return lines.join("\n");
}

export async function getWrappedIntro(
  playerId: string,
  period?: string,
  force = false
): Promise<WrappedIntroView | null> {
  const load = await loadWrappedInput(playerId, period);
  if (!load) return null;
  const facts = factsFor(load);
  if (!facts) return null;

  const model = reportModel();
  const hash = narrativeHash(PROMPT_VERSION, model, facts);
  const refId = `${playerId}:${load.period}`;

  if (!force) {
    const cached = await readNarrative<WrappedIntroView>("wrapped", refId, hash);
    if (cached) return cached;
  }

  if (!reportsEnabled()) return null;

  let view: WrappedIntroView;
  try {
    const { object } = await generateObject({
      model: groq(model),
      schema: wrappedSchema,
      system: SYSTEM_PROMPT,
      prompt: `Write the Wrapped opener.\n\n${facts}`,
    });
    view = { headline: object.headline, blurb: object.blurb };
  } catch {
    return null;
  }

  await writeNarrative("wrapped", refId, hash, model, view);
  return view;
}

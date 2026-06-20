import { computeAchievements } from "./achievements";
import type { Attributes } from "./archetype";
import type { RankedPlayer } from "./leaderboard";
import { levelForRating } from "./levels";
import { proCandidates } from "./pros";
import type { MatchHistoryEntry } from "./queries";
import { computeForm, partnerChemistry, rivalries } from "./relationships";
import { BRAND, type CardSpec } from "./share/card";
import type { CareerStatRow, Gender } from "./types";

// "Padel Wrapped" — a Spotify-Wrapped-style personal recap composed entirely from
// existing engines (level, archetype, relationships, achievements, pro twin).
// Pure data shaping: turns one player's scoped stats into a set of carousel
// panels plus a combined shareable card + caption. No DOM / network.

export interface WrappedPanel {
  key: string;
  label: string; // small kicker, e.g. "Your level"
  headline: string; // the big line
  value?: string; // optional oversized figure
  detail?: string; // supporting line
  emoji?: string;
  accent?: boolean; // tint as a "knock" (e.g. nemesis) vs a win
}

export interface WrappedData {
  name: string;
  periodLabel: string;
  panels: WrappedPanel[];
  card: CardSpec;
  caption: string;
  proTwinPhotoName: string | null; // the pro name to resolve a photo for, page-side
}

export interface WrappedInput {
  player: RankedPlayer;
  matches: MatchHistoryEntry[]; // already scoped to the chosen period
  careerRow: CareerStatRow; // aggregates for the chosen period (record panel)
  gender: Gender | null;
  periodLabel: string; // "all time" or e.g. "Jun 2026"
  // Optional LLM intro (lib actions/wrapped.ts); absent → a plain opener.
  intro?: { headline: string; blurb: string } | null;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function topAttribute(a: Attributes): { label: string; value: number } {
  const attrs = [
    { label: "Power", value: a.attack },
    { label: "Defense", value: a.defense },
    { label: "Consistency", value: a.consistency },
    { label: "Clutch", value: a.clutch },
    { label: "Winning", value: a.win },
  ];
  return attrs.reduce((best, x) => (x.value > best.value ? x : best));
}

export function buildWrapped(input: WrappedInput): WrappedData {
  const { player, matches, careerRow, gender, periodLabel, intro } = input;
  const name = player.row.name;
  const level = levelForRating(player.rating);
  const chem = partnerChemistry(matches);
  const rivals = rivalries(matches);
  const form = computeForm(matches);
  const top = topAttribute(player.attributes);

  const winPct = careerRow.games > 0 ? Math.round((careerRow.wins / careerRow.games) * 100) : 0;
  const pros = proCandidates(player.rating, player.archetype.primary, gender);
  const proTwin = pros.pros[0] ?? null;

  // A signature good badge to crown the recap (field-relative ones simply don't
  // appear without context, same as elsewhere).
  const badges = computeAchievements(careerRow, matches);
  const goodBadge = badges.find((b) => b.earned && b.tone === "good") ?? null;

  const panels: WrappedPanel[] = [];

  if (intro) {
    panels.push({
      key: "intro",
      label: "Padel Wrapped",
      emoji: "🎬",
      headline: intro.headline,
      detail: intro.blurb,
    });
  }

  panels.push({
    key: "level",
    label: "Your level",
    emoji: level.badge,
    headline: level.category,
    value: `${player.rating.toFixed(1)}/7`,
    detail: player.provisional ? "Provisional — keep playing to lock it in" : level.description,
  });

  if (careerRow.games > 0) {
    const draws = careerRow.draws ? `–${careerRow.draws}` : "";
    panels.push({
      key: "record",
      label: "The numbers",
      emoji: "📊",
      headline: `${careerRow.wins}–${careerRow.losses}${draws}`,
      value: `${winPct}%`,
      detail: `${careerRow.games} games · net ${signed(careerRow.point_diff)} points`,
    });
  }

  panels.push({
    key: "style",
    label: "Your style",
    emoji: "🎭",
    headline: player.archetype.label,
    detail: player.archetype.description,
    value: `${top.label} ${top.value}`,
  });

  if (chem.best) {
    panels.push({
      key: "partner",
      label: "Partner in crime",
      emoji: "🤝",
      headline: chem.best.name,
      detail: `${chem.best.wins}W in ${chem.best.games} together · ${Math.round(chem.best.winRate * 100)}%`,
    });
  }

  if (rivals.nemesis) {
    panels.push({
      key: "nemesis",
      label: "Your nemesis",
      emoji: "😤",
      headline: rivals.nemesis.name,
      detail: `${rivals.nemesis.wins}–${rivals.nemesis.losses} head-to-head`,
      accent: true,
    });
  }

  if (form.longestWinStreak >= 2) {
    panels.push({
      key: "streak",
      label: "Hot streak",
      emoji: "🔥",
      headline: `${form.longestWinStreak} in a row`,
      detail: "your longest winning streak",
    });
  }

  if (proTwin) {
    panels.push({
      key: "protwin",
      label: "Your pro twin",
      emoji: "⭐",
      headline: proTwin,
      detail: pros.note,
    });
  }

  if (goodBadge) {
    panels.push({
      key: "badge",
      label: "Signature badge",
      emoji: goodBadge.badge,
      headline: goodBadge.name,
      detail: goodBadge.description,
    });
  }

  const card = buildWrappedCard(name, periodLabel, level.category, player.rating, panels, intro?.headline);
  const caption = buildWrappedCaption(name, periodLabel, panels);

  return { name, periodLabel, panels, card, caption, proTwinPhotoName: proTwin };
}

// Combined share card: rating as the hero, a few highlight panels as rows.
function buildWrappedCard(
  name: string,
  periodLabel: string,
  levelCategory: string,
  rating: number,
  panels: WrappedPanel[],
  headline?: string
): CardSpec {
  const ROW_KEYS = ["record", "style", "partner", "protwin", "badge"];
  const rows = panels
    .filter((p) => ROW_KEYS.includes(p.key))
    .map((p) => ({
      tag: p.emoji,
      title: `${p.label}: ${p.headline}`,
      subtitle: p.detail,
      tagColor: BRAND.green,
    }));

  return {
    kicker: "Padel Wrapped",
    title: name,
    headline:
      headline || `${periodLabel === "all time" ? "Your story so far" : periodLabel} · ${levelCategory}`,
    hero: { value: `${rating.toFixed(1)}/7`, label: levelCategory },
    rows,
  };
}

function buildWrappedCaption(name: string, periodLabel: string, panels: WrappedPanel[]): string {
  const lines = [`🎾 ${name}'s Padel Wrapped — ${periodLabel}`, ""];
  for (const p of panels) {
    lines.push(`${p.emoji ?? "•"} ${p.label}: ${p.headline}${p.detail ? ` — ${p.detail}` : ""}`);
  }
  lines.push("", "expose.padel-leaderboard");
  return lines.join("\n");
}

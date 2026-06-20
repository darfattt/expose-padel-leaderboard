import type { AwardWinner, EventAwards } from "./awards";
import { BRAND, type CardSpec } from "./share/card";

// Turns an event's awards into a shareable "Match Night" recap card + caption.
// Pure data shaping (no DOM / network) so it's unit-testable and usable from both
// the server page and the client share button. Optional `quips` are the LLM
// one-liners (lib actions/recap.ts); when absent each award falls back to its
// deterministic stat line.

export type AwardKey = keyof EventAwards;
export type RecapQuips = Partial<Record<AwardKey, string>>;

// Display order + identity for each award. Shared by the recap card and the
// on-page Awards grid so the two never drift.
export const RECAP_AWARDS: { key: AwardKey; label: string; badge: string; icon: string }[] = [
  { key: "mvp", label: "MVP", badge: "🏅", icon: "star-medal" },
  { key: "bestPartnership", label: "Best Duo", badge: "🤝", icon: "linked-rings" },
  { key: "biggestUpset", label: "Upset", badge: "⚡", icon: "lightning-arc" },
  { key: "demolition", label: "Demolition", badge: "💥", icon: "spiky-explosion" },
  { key: "mostImproved", label: "Most Improved", badge: "📈", icon: "progression" },
  { key: "heartbreak", label: "Heartbreak", badge: "💔", icon: "broken-heart" },
];

export interface RecapEvent {
  title: string;
  playedOn: string | null;
  location: string | null;
}

function presentAwards(awards: EventAwards) {
  return RECAP_AWARDS.map((a) => ({ ...a, winner: awards[a.key] })).filter(
    (a): a is typeof a & { winner: AwardWinner } => a.winner !== null
  );
}

function metaLine(event: RecapEvent): string {
  return [event.playedOn, event.location].filter(Boolean).join(" · ");
}

// The card the share button renders. One row per award that had a winner.
export function buildEventRecap(
  event: RecapEvent,
  awards: EventAwards,
  quips: RecapQuips = {},
  headline?: string | null
): CardSpec {
  const present = presentAwards(awards);
  return {
    kicker: "Match Night",
    title: event.title,
    headline: headline || metaLine(event) || "The night in awards",
    rows: present.map((a) => ({
      icon: a.icon,
      title: `${a.label} · ${a.winner.names.join(" & ")}`,
      subtitle: quips[a.key] || a.winner.detail,
      accent: a.key !== "heartbreak", // only the wooden-spoon award reads as a knock
      tagColor: a.key === "heartbreak" ? BRAND.coral : BRAND.green,
    })),
  };
}

// The plain-text caption that rides along with the card image.
export function buildRecapCaption(
  event: RecapEvent,
  awards: EventAwards,
  quips: RecapQuips = {},
  headline?: string | null
): string {
  const present = presentAwards(awards);
  const lines = [`🎾 ${headline || event.title}`];
  const meta = metaLine(event);
  if (meta) lines.push(meta);
  lines.push("");
  for (const a of present) {
    const line = quips[a.key] || a.winner.detail;
    lines.push(`${a.badge} ${a.label}: ${a.winner.names.join(" & ")} — ${line}`);
  }
  lines.push("", "expose.padel-leaderboard");
  return lines.join("\n");
}

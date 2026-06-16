import crypto from "node:crypto";
import type { ParsedScoresheet } from "./types";

// Stable identity key: lowercased, trimmed, internal whitespace collapsed.
// Used to dedupe the same player across events.
export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

// Content hash of the meaningful parsed payload (event identity + every match),
// order-independent per match line. Guards against re-uploading the same sheet.
export function scoresheetHash(parsed: ParsedScoresheet): string {
  const lines = parsed.matches
    .map(
      (m) =>
        `${m.round}|${m.court}|${[...m.team1].sort().join(",")}|${m.team1Score}|${[...m.team2]
          .sort()
          .join(",")}|${m.team2Score}`
    )
    .sort();
  const payload = JSON.stringify({
    title: normalizeName(parsed.event.title),
    playedOn: parsed.event.playedOn,
    lines,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

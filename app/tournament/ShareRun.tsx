"use client";

import ShareButton from "@/app/components/ShareButton";
import { buildRunCard, buildShareText, buildShareTitle, type RunSummary } from "./share";

// The "share my run" control. Builds a CardSpec from the run summary and hands it
// to the shared ShareButton (native share sheet, or download + caption fallback).
// Shown once at least one of your matches has been decided; the summary it shares
// only ever includes results you've already seen.
export default function ShareRun({ summary }: { summary: RunSummary }) {
  const label =
    summary.status === "champion"
      ? "📲 Share your title"
      : summary.status === "out"
        ? "📲 Share your run"
        : "📲 Share progress";

  return (
    <ShareButton
      spec={buildRunCard(summary)}
      caption={buildShareText(summary)}
      shareTitle={buildShareTitle(summary)}
      filename="padel-tournament.png"
      label={label}
      hint="A summary card of your latest result — straight to social, or saved to share."
      className="mt-6"
    />
  );
}

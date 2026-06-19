"use client";

import { useState } from "react";
import { type RunSummary, type ShareOutcome, shareSummary } from "./share";

// The "share my run" control. Renders a summary card to a PNG and pushes it to
// the native share sheet (or downloads it + copies the caption as a fallback).
// Shown once at least one of your matches has been decided; the summary it shares
// only ever includes results you've already seen.
export default function ShareRun({ summary }: { summary: RunSummary }) {
  const [state, setState] = useState<"idle" | "busy" | ShareOutcome>("idle");

  const onShare = async () => {
    setState("busy");
    try {
      setState(await shareSummary(summary));
    } catch {
      setState("error");
    }
  };

  const label =
    summary.status === "champion"
      ? "📲 Share your title"
      : summary.status === "out"
        ? "📲 Share your run"
        : "📲 Share progress";

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-sm border border-hairline bg-canvas px-4 py-3">
      <button type="button" onClick={onShare} disabled={state === "busy"} className="btn-primary text-sm">
        {state === "busy" ? "Preparing…" : label}
      </button>
      <span className="text-xs text-body-muted">
        {state === "shared" && "Shared — nice one."}
        {state === "downloaded" && "Card saved to your downloads & caption copied — post it anywhere."}
        {state === "cancelled" && "Share cancelled."}
        {state === "error" && "Couldn't build the card — try again."}
        {(state === "idle" || state === "busy") &&
          "A summary card of your latest result — straight to social, or saved to share."}
      </span>
    </div>
  );
}

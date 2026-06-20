"use client";

import { useState } from "react";
import type { CardSpec } from "@/lib/share/card";
import { shareCard, type ShareOutcome } from "@/lib/share/share-client";

// Reusable "share this as a card" control. Renders a CardSpec to a PNG and pushes
// it to the native share sheet (or downloads it + copies the caption as a
// fallback). Used by tournament runs, Match Night recaps, Power Rankings and
// Padel Wrapped — anywhere we want a screenshot-ready, group-chat-ready card.
export default function ShareButton({
  spec,
  caption,
  shareTitle,
  filename,
  label = "📲 Share card",
  hint = "A summary card — straight to social, or saved to share.",
  className = "",
}: {
  spec: CardSpec;
  caption: string;
  shareTitle: string;
  filename: string;
  label?: string;
  hint?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | ShareOutcome>("idle");

  const onShare = async () => {
    setState("busy");
    try {
      setState(await shareCard(spec, { text: caption, title: shareTitle, filename }));
    } catch {
      setState("error");
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-sm border border-hairline bg-canvas px-4 py-3 ${className}`}
    >
      <button type="button" onClick={onShare} disabled={state === "busy"} className="btn-primary text-sm">
        {state === "busy" ? "Preparing…" : label}
      </button>
      <span className="text-xs text-body-muted">
        {state === "shared" && "Shared — nice one."}
        {state === "downloaded" && "Card saved to your downloads & caption copied — post it anywhere."}
        {state === "cancelled" && "Share cancelled."}
        {state === "error" && "Couldn't build the card — try again."}
        {(state === "idle" || state === "busy") && hint}
      </span>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { regenerateGossip, type GossipView } from "@/app/actions/gossip";

// Renders the LLM "gossip column" summary. Mirrors ReportCard's regenerate flow
// but in the light coral callout palette the deterministic gossip hooks already
// use (see relationship-ui's GossipLine).
export default function GossipCard({
  playerId,
  initial,
  enabled,
}: {
  playerId: string;
  initial: GossipView;
  enabled: boolean;
}) {
  const [gossip, setGossip] = useState<GossipView>(initial);
  const [pending, start] = useTransition();

  function regenerate() {
    start(async () => {
      const res = await regenerateGossip(playerId);
      if (res) setGossip(res);
    });
  }

  return (
    <div className="rounded-sm border border-coral-soft bg-[#fff5f2] px-4 py-3">
      <div className="flex items-center justify-between gap-4 mb-1.5">
        <p className="mono-label text-coral"></p>
        <div className="flex items-center gap-3">
          {gossip.vibe ? <span className="archetype-chip">{gossip.vibe}</span> : null}
          {enabled ? (
            <button
              onClick={regenerate}
              disabled={pending}
              className="text-xs text-body-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
            >
              {pending ? "Generating…" : "Regenerate"}
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-ink leading-relaxed">{gossip.summary}</p>
      {gossip.model ? (
        <p className="mono-label text-[11px] text-body-muted mt-2">
          {gossip.cached ? "cached · " : ""}
          {gossip.model}
        </p>
      ) : null}
    </div>
  );
}

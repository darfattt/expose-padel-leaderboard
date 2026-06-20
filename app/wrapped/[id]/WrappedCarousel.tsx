"use client";

import Image from "next/image";
import { useState } from "react";
import ShareButton from "@/app/components/ShareButton";
import type { CardSpec } from "@/lib/share/card";
import type { WrappedPanel } from "@/lib/wrapped";

// Swipeable, Spotify-Wrapped-style carousel of a player's season panels, with the
// combined card share button pinned below. Client-only for the step navigation.
export default function WrappedCarousel({
  panels,
  spec,
  caption,
  name,
  proTwinPhoto,
}: {
  panels: WrappedPanel[];
  spec: CardSpec;
  caption: string;
  name: string;
  proTwinPhoto?: string | null;
}) {
  const [i, setI] = useState(0);
  if (panels.length === 0) return null;
  const panel = panels[Math.min(i, panels.length - 1)];
  const go = (n: number) => setI((prev) => (prev + n + panels.length) % panels.length);

  return (
    <div>
      <div className="card relative overflow-hidden p-8 sm:p-12 min-h-[320px] flex flex-col justify-center">
        <p className="mono-label mb-4">
          {panel.label} · {i + 1}/{panels.length}
        </p>

        {panel.key === "protwin" && proTwinPhoto && (
          <Image
            src={proTwinPhoto}
            alt={panel.headline}
            width={96}
            height={96}
            className="mb-4 h-24 w-24 rounded-full object-cover"
            unoptimized
          />
        )}

        {panel.value && (
          <p className="font-display text-[64px] leading-none tracking-tightest text-deep-green">
            {panel.value}
          </p>
        )}

        <p className="font-display text-3xl leading-tight tracking-tight mt-2">
          {panel.emoji && <span aria-hidden>{panel.emoji} </span>}
          {panel.headline}
        </p>

        {panel.detail && <p className="text-body-muted mt-3 max-w-lg">{panel.detail}</p>}
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} className="btn-secondary text-sm" aria-label="Previous">
          ← Prev
        </button>
        <div className="flex gap-1.5">
          {panels.map((p, idx) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setI(idx)}
              aria-label={`Go to ${p.label}`}
              className={`h-2 w-2 rounded-full transition-colors ${idx === i ? "bg-deep-green" : "bg-hairline"}`}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(1)} className="btn-secondary text-sm" aria-label="Next">
          Next →
        </button>
      </div>

      <div className="mt-6">
        <ShareButton
          spec={spec}
          caption={caption}
          shareTitle={`${name}'s Padel Wrapped`}
          filename="padel-wrapped.png"
          label="📲 Share your Wrapped"
          hint="Your whole season as one card — straight to social, or saved to share."
        />
      </div>
    </div>
  );
}

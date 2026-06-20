"use client";

import { useEffect, useRef } from "react";
import { drawAvatar } from "@/app/versus/avatar-sprite";
import { avatarFromName, type AvatarSpec } from "@/lib/sim/avatar";
import type { Gender } from "@/lib/types";

// The player as their 8-bit match-sim sprite, drawn to a small canvas. Same
// name-seeded AvatarSpec the /versus arena uses, so a player looks identical
// everywhere. Pure client (touches canvas). Used as the avatar fallback when a
// player has no Reclub photo, and anywhere we want the pixel look on its own.
export default function PixelAvatar({
  name,
  gender = null,
  spec,
  size = 96,
  className,
}: {
  name: string;
  gender?: Gender | null;
  spec?: AvatarSpec; // pre-built spec wins over name/gender, for callers that have one
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.imageSmoothingEnabled = false; // keep the pixels crisp when scaled up
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const av = spec ?? avatarFromName(name, undefined, gender);
    // Art spans roughly x[-7,7], y[-14,14] (~28 tall). Fit it into the box with a
    // little headroom, centred so feet+head both clear the edges.
    const scale = (size * dpr) / 36;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 + scale * 1);
    ctx.scale(scale, scale);
    drawAvatar(ctx, av, 0, 0, 1, 0);
    ctx.restore();
  }, [name, gender, spec, size]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size }}
      className={className}
      role="img"
      aria-label={name}
    />
  );
}

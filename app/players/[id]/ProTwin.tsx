"use client";

import { useState } from "react";
import { proAvatarColor, proInitials } from "@/lib/pros";

// The player's "pro twin" — the FIP pro they play like (rank-matched by rating,
// rotated by archetype). Shows the curated headshot, falling back to a colored
// initials circle when there's no photo or the remote image fails, so it never
// renders broken. Same look as the ReportCard pro avatars.
export default function ProTwin({
  name,
  photo,
  size = 48,
}: {
  name: string;
  photo: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = photo && !failed;
  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-flex items-center justify-center overflow-hidden rounded-full shrink-0 ring-1 ring-hairline"
        style={{ width: size, height: size, backgroundColor: proAvatarColor(name) }}
      >
        {showPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Commons URL; avoids next/image domain config
          <img
            src={photo}
            alt={name}
            width={size}
            height={size}
            className="h-full w-full object-cover [object-position:50%_15%]"
            onError={() => setFailed(true)}
            loading="lazy"
          />
        ) : (
          <span className="font-display text-white" style={{ fontSize: Math.round(size * 0.38) }}>
            {proInitials(name)}
          </span>
        )}
      </span>
      <div>
        <p className="mono-label">Plays like</p>
        <p className="font-display text-lg leading-tight tracking-tight">{name}</p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { initialsFromName } from "@/lib/reclub";

// Circular player avatar. Shows the Reclub avatar when one is supplied, falling
// back to the player's initials on a soft tile — both when no avatar is set and
// when the remote image fails to load (so it never renders broken). Sized in px
// so it drops into table rows and profile headers alike.
export default function PlayerAvatar({
  name,
  avatarUrl,
  size = 32,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  // Reset the error state when the source changes.
  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  const showImage = avatarUrl && !failed;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-soft-stone text-ink font-medium uppercase tracking-tight"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      aria-label={name}
      title={name}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Reclub URL; avoids next/image domain config
        <img
          src={avatarUrl}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <span aria-hidden>{initialsFromName(name)}</span>
      )}
    </span>
  );
}

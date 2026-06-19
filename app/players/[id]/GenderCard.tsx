"use client";

import { useState, useTransition } from "react";
import { updatePlayerGender } from "@/app/actions/player";
import type { Gender } from "@/lib/types";

const GENDERS: Gender[] = ["male", "female"];
const GENDER_LABEL: Record<Gender, string> = { male: "Male", female: "Female" };
const GENDER_GLYPH: Record<Gender, string> = { male: "♂", female: "♀" };

// Header-embedded gender toggle. Selecting Male/Female drives which FIP ranking
// the "plays like" pro comparison is drawn from (men's vs women's); clicking the
// active choice clears it. Saving revalidates the page so the report refreshes.
export default function GenderCard({
  playerId,
  initial,
}: {
  playerId: string;
  initial: Gender | null;
}) {
  const [gender, setGender] = useState<Gender | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function choose(g: Gender) {
    const next = gender === g ? null : g;
    const prev = gender;
    setGender(next);
    setError(null);
    startSave(async () => {
      const res = await updatePlayerGender(playerId, next);
      if (!res.ok) {
        setGender(prev);
        setError(res.error ?? "Couldn't save gender.");
      }
    });
  }

  return (
    <div className="min-w-0">
      <p className="mono-label">Gender</p>
      <div className="mt-1 flex gap-2">
        {GENDERS.map((g) => {
          const active = gender === g;
          return (
            <button
              key={g}
              onClick={() => choose(g)}
              aria-pressed={active}
              disabled={saving}
              className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-sm transition-colors disabled:opacity-60 ${
                active
                  ? "border-primary bg-pale-blue text-ink font-medium"
                  : "border-card-border bg-white text-body-muted hover:border-slate"
              }`}
            >
              <span aria-hidden>{GENDER_GLYPH[g]}</span>
              {GENDER_LABEL[g]}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-body-muted">Sets the “plays like” pro tour.</p>
      {error && (
        <p className="mt-1 text-xs" style={{ color: "#b30000" }}>
          {error}
        </p>
      )}
    </div>
  );
}

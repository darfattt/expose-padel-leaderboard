"use client";

import { useState } from "react";
import GameIcon from "@/app/components/GameIcon";
import type { Achievement } from "@/lib/achievements";

// Career achievement badges, split into what's been earned and what's still
// locked. Earned badges show in full (shame badges tinted coral); locked ones
// are dimmed, sorted by how close they are, with a progress bar for count badges.
// The locked group is collapsed by default — it's usually long — and expands on
// click so the profile isn't dominated by everything you haven't done yet.
export default function AchievementsCard({ achievements }: { achievements: Achievement[] }) {
  const earned = achievements.filter((a) => a.earned);
  const locked = achievements.filter((a) => !a.earned).sort((a, b) => ratio(b) - ratio(a));
  const [showLocked, setShowLocked] = useState(false);

  return (
    <div className="card p-6">
      <div className="flex items-baseline justify-between mb-5">
        <p className="mono-label">Achievements</p>
        <p className="mono-label">
          {earned.length}/{achievements.length}
        </p>
      </div>

      {earned.length > 0 ? (
        <Group title="Earned" items={earned} />
      ) : (
        <p className="text-body-muted text-sm">No achievements yet — get on court.</p>
      )}

      {locked.length > 0 ? (
        <div className={earned.length > 0 ? "mt-6" : ""}>
          <button
            type="button"
            onClick={() => setShowLocked((v) => !v)}
            aria-expanded={showLocked}
            className="flex w-full items-center justify-between mb-2.5 group"
          >
            <span className="mono-label text-[11px]">Locked · {locked.length}</span>
            <span className="mono-label text-[11px] flex items-center gap-1 text-body-muted group-hover:text-ink">
              {showLocked ? "Hide" : "Show"}
              <Chevron open={showLocked} />
            </span>
          </button>
          {showLocked ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {locked.map((a) => (
                <Badge key={a.key} achievement={a} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M3 4.5 6 7.5 9 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Group({ title, items }: { title: string; items: Achievement[] }) {
  return (
    <div>
      <p className="mono-label text-[11px] mb-2.5">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((a) => (
          <Badge key={a.key} achievement={a} />
        ))}
      </div>
    </div>
  );
}

function ratio(a: Achievement): number {
  if (a.earned) return 1;
  if (!a.progress) return 0;
  return a.progress.current / a.progress.target;
}

function Badge({ achievement: a }: { achievement: Achievement }) {
  const pct = a.progress ? Math.round((a.progress.current / a.progress.target) * 100) : a.earned ? 100 : 0;
  // Earned shame badges get a coral tint; earned good ones the normal card look.
  const shell = !a.earned
    ? "border-hairline bg-transparent"
    : a.tone === "bad"
      ? "border-coral-soft bg-[#fff5f2]"
      : "border-card-border bg-canvas";
  const nameColor = !a.earned ? "text-body-muted" : a.tone === "bad" ? "text-coral" : "text-ink";
  return (
    <div className={`rounded-md border p-3 ${shell}`}>
      <div className="flex items-center gap-2">
        <GameIcon
          name={a.icon}
          fallback={a.badge}
          size={22}
          className={
            !a.earned ? "text-body-muted opacity-40" : a.tone === "bad" ? "text-coral" : "text-deep-green"
          }
        />
        <span className={`text-sm font-medium ${nameColor}`}>{a.name}</span>
      </div>
      <p className="text-body-muted text-xs mt-1.5 leading-snug">{a.description}</p>
      {!a.earned && a.progress ? (
        <div className="mt-2">
          <div className="h-1 rounded-pill bg-hairline overflow-hidden">
            <div className="h-full bg-slate" style={{ width: `${pct}%` }} />
          </div>
          <p className="mono-label mt-1 text-[11px]">
            {a.progress.current}/{a.progress.target}
          </p>
        </div>
      ) : null}
    </div>
  );
}

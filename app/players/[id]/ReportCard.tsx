"use client";

import { useState, useTransition } from "react";
import { regeneratePlayerReport, type PlayerReportView } from "@/app/actions/report";
import type { ProComparison } from "@/lib/report";
import { proAvatarColor, proInitials, proPhoto } from "@/lib/pros";

export default function ReportCard({
  playerId,
  initial,
  enabled,
}: {
  playerId: string;
  initial: PlayerReportView | null;
  enabled: boolean;
}) {
  const [report, setReport] = useState<PlayerReportView | null>(initial);
  const [pending, start] = useTransition();

  function regenerate() {
    start(async () => {
      const res = await regeneratePlayerReport(playerId);
      if (res) setReport(res);
    });
  }

  return (
    <div className="card p-6 bg-deep-green text-white border-deep-green">
      <div className="flex items-center justify-between gap-4 mb-3">
        <p className="mono-label text-white/60">Player Report</p>
        {enabled && (
          <button
            onClick={regenerate}
            disabled={pending}
            className="text-xs text-white/70 underline underline-offset-4 hover:text-white disabled:opacity-50"
          >
            {pending ? "Generating…" : "Regenerate"}
          </button>
        )}
      </div>

      {report ? (
        <>
          {report.headline && (
            <h3 className="font-display text-2xl tracking-tight mb-2">{report.headline}</h3>
          )}
          <p className="text-white/90 leading-relaxed">{report.content}</p>

          {report.similarPros.length > 0 && <PlaysLike pros={report.similarPros} />}

          {report.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {report.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-sm border border-white/25 px-2 py-0.5 text-xs text-white/80"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {report.model && (
            <p className="mono-label text-white/40 mt-4">
              {report.cached ? "cached · " : ""}
              {report.model}
            </p>
          )}
        </>
      ) : (
        <p className="text-white/70 text-sm">
          {enabled
            ? "No report yet — generate one once this player has games."
            : "LLM reports are disabled. Set GROQ_API_KEY and REPORTS_ENABLED to enable Player Reports."}
        </p>
      )}
    </div>
  );
}

// "Plays like" — features the primary comparison with a real headshot (falling
// back to an initials avatar), then lists any further pros as chips.
function PlaysLike({ pros }: { pros: ProComparison[] }) {
  const [primary, ...rest] = pros;
  return (
    <div className="mt-5 pt-4 border-t border-white/15">
      <p className="mono-label text-white/60 mb-3">Plays like</p>
      <div className="flex items-center gap-3">
        <ProAvatar name={primary.name} size={56} />
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight">{primary.name}</p>
          <p className="text-sm text-white/75 leading-snug">{primary.reason}</p>
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rest.map((pro) => (
            <li key={pro.name} className="flex items-start gap-3">
              <span className="archetype-chip shrink-0 mt-0.5">{pro.name}</span>
              <span className="text-sm text-white/75 leading-snug">{pro.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Round headshot for a pro; falls back to a colored initials circle if no photo
// is curated or the image fails to load, so it never renders broken.
function ProAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const src = proPhoto(name);
  const [failed, setFailed] = useState(false);
  const showPhoto = src && !failed;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 ring-1 ring-white/20"
      style={{ width: size, height: size, backgroundColor: proAvatarColor(name) }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Commons URL; avoids next/image domain config
        <img
          src={src}
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
  );
}

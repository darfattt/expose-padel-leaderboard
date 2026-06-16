"use client";

import { useState, useTransition } from "react";
import { regeneratePlayerReport, type PlayerReportView } from "@/app/actions/report";

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
        <p className="mono-label text-white/60">Scouting report</p>
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

          {report.similarPros.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/15">
              <p className="mono-label text-white/60 mb-3">Plays like</p>
              <ul className="space-y-2.5">
                {report.similarPros.map((pro) => (
                  <li key={pro.name} className="flex items-start gap-3">
                    <span className="archetype-chip shrink-0 mt-0.5">{pro.name}</span>
                    <span className="text-sm text-white/75 leading-snug">{pro.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
            : "LLM reports are disabled. Set GROQ_API_KEY and REPORTS_ENABLED to enable scouting reports."}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewScoresheet, saveScoresheet, type PreviewResult } from "@/app/actions/upload";

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isPreviewing, startPreview] = useTransition();
  const [isSaving, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    setError(null);
    setPreview(null);
    setFile(f);
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    startPreview(async () => {
      const res = await previewScoresheet(fd);
      if (!res.ok) setError(res.error ?? "Could not read that PDF.");
      setPreview(res);
    });
  }

  function handleSave() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startSave(async () => {
      const res = await saveScoresheet(fd);
      if (res.ok && res.eventId) {
        router.push("/");
        router.refresh();
      } else if (res.duplicate) {
        setError("This scoresheet is already on the board.");
      } else {
        setError(res.error ?? "Failed to save.");
      }
    });
  }

  const parsed = preview?.parsed;
  const warnings = parsed?.warnings ?? [];
  const badSums = parsed?.matches.filter((m) => m.team1Score + m.team2Score !== 21).length ?? 0;
  const playerCount = parsed
    ? new Set(parsed.matches.flatMap((m) => [...m.team1, ...m.team2].map((n) => n.toLowerCase().trim())))
        .size
    : 0;
  const rounds = parsed ? new Set(parsed.matches.map((m) => m.round)).size : 0;

  return (
    <div>
      {/* Drop zone */}
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-16 text-center cursor-pointer transition-colors ${
          dragOver ? "border-primary bg-pale-blue" : "border-hairline hover:border-slate"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        <div className="font-display text-2xl tracking-tight mb-1">
          {file ? file.name : "Drag & drop a PDF"}
        </div>
        <p className="text-body-muted text-sm">
          {isPreviewing ? "Reading scoresheet…" : "or click to choose a file"}
        </p>
      </label>

      {error && (
        <p className="mt-4 text-sm" style={{ color: "#b30000" }}>
          {error}
        </p>
      )}

      {/* Preview */}
      {parsed && preview?.ok && (
        <div className="mt-8 card p-6">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <h2 className="font-display text-2xl tracking-tight">{parsed.event.title}</h2>
            <span className="mono-label">{parsed.event.playedOn ?? "date n/a"}</span>
          </div>
          {parsed.event.location && (
            <p className="text-body-muted text-sm mt-1">{parsed.event.location}</p>
          )}

          <div className="grid grid-cols-3 gap-4 mt-6">
            <Stat label="Matches" value={parsed.matches.length} />
            <Stat label="Players" value={playerCount} />
            <Stat label="Rounds" value={rounds} />
          </div>

          {(warnings.length > 0 || badSums > 0 || preview.duplicate) && (
            <ul className="mt-6 space-y-1 text-sm">
              {preview.duplicate && (
                <li className="text-coral">⚠ Already uploaded — saving will be blocked.</li>
              )}
              {badSums > 0 && (
                <li className="text-coral">⚠ {badSums} match(es) don&apos;t sum to 21.</li>
              )}
              {warnings.map((w, i) => (
                <li key={i} className="text-body-muted">
                  • {w}
                </li>
              ))}
            </ul>
          )}

          <details className="mt-6">
            <summary className="text-sm text-action-blue cursor-pointer">
              Show {parsed.matches.length} parsed matches
            </summary>
            <div className="mt-3 max-h-72 overflow-auto divide-y divide-hairline text-sm">
              {parsed.matches.map((m, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <span className="mono-label w-20 shrink-0">
                    R{m.round} · C{m.court}
                  </span>
                  <span className="flex-1">{m.team1.join(" & ")}</span>
                  <span className="font-mono tabular-nums">
                    {m.team1Score}–{m.team2Score}
                  </span>
                  <span className="flex-1 text-right">{m.team2.join(" & ")}</span>
                </div>
              ))}
            </div>
          </details>

          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={isSaving || preview.duplicate}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving…" : "Confirm & save"}
            </button>
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setError(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="btn-secondary"
            >
              Choose another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-card-border bg-soft-stone px-4 py-3">
      <div className="font-display text-3xl tracking-tight">{value}</div>
      <div className="mono-label mt-1">{label}</div>
    </div>
  );
}

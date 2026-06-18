"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewScoresheet, saveScoresheet, type PreviewResult } from "@/app/actions/upload";
import { DEFAULT_CLUB_SLUG } from "@/lib/clubs";
import type { Club } from "@/lib/types";

export default function UploadForm({ clubs }: { clubs: Club[] }) {
  const router = useRouter();
  const defaultClubId =
    clubs.find((c) => c.slug === DEFAULT_CLUB_SLUG)?.id ?? clubs[0]?.id ?? "";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [playedOn, setPlayedOn] = useState("");
  const [pointsPerGame, setPointsPerGame] = useState(21);
  const [password, setPassword] = useState("");
  const [clubId, setClubId] = useState(defaultClubId);
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
      if (res.parsed) {
        setTitle(res.parsed.event.title ?? "");
        setPlayedOn(res.parsed.event.playedOn ?? "");
        setPointsPerGame(res.parsed.event.pointsPerGame ?? 21);
      }
      setPreview(res);
    });
  }

  function handleSave() {
    if (!file) return;
    if (!password.trim()) {
      setError("Enter the upload password to save.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title.trim());
    fd.append("playedOn", playedOn.trim());
    fd.append("pointsPerGame", String(pointsPerGame));
    fd.append("clubId", clubId);
    fd.append("password", password);
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
  // A score above the per-game basis is impossible in either format (fixed-sum
  // or first-to-N) — flags a misread sheet or a wrong basis.
  const badSums = parsed?.matches.filter((m) => Math.max(m.team1Score, m.team2Score) > pointsPerGame).length ?? 0;
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
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mono-label">Event title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 font-display text-xl tracking-tight focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mono-label">Date</span>
              <input
                type="date"
                value={playedOn}
                onChange={(e) => setPlayedOn(e.target.value)}
                className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
              />
            </label>
          </div>
          {parsed.event.location && (
            <p className="text-body-muted text-sm mt-2">{parsed.event.location}</p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 max-w-xl">
            <label className="block">
              <span className="mono-label">Club</span>
              <select
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {clubs.length === 0 && <option value="">No clubs configured</option>}
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mono-label">Points per game</span>
              <input
                type="number"
                min={1}
                value={pointsPerGame}
                onChange={(e) => setPointsPerGame(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
              />
              <span className="mt-1 block text-xs text-body-muted">
                Detected from the scores (e.g. 21, or 5 for a “to 5” game). Ratings normalize to this.
              </span>
            </label>
          </div>

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
                <li className="text-coral">
                  ⚠ {badSums} match(es) have a score above {pointsPerGame} — check the points-per-game setting.
                </li>
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

          <label className="mt-6 block max-w-xs">
            <span className="mono-label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Club admin or super-admin"
              autoComplete="off"
              className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <span className="mt-1 block text-xs text-body-muted">
              Use this club’s admin password, or the super-admin password.
            </span>
          </label>

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
                setTitle("");
                setPlayedOn("");
                setPassword("");
                setClubId(defaultClubId);
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

"use client";

import { useState, useTransition } from "react";
import { updateReclubProfile } from "@/app/actions/reclub";
import { reclubHandle } from "@/lib/reclub";
import type { PlayerReclub } from "@/lib/queries";

// Header-embedded Reclub link: shows the player's @handle and expands into an
// inline editor (paste a profile URL) when editing. The avatar itself lives
// beside the player's name; saving here revalidates the page so it refreshes.
export default function ReclubCard({
  playerId,
  initial,
}: {
  playerId: string;
  initial: PlayerReclub;
}) {
  const [url, setUrl] = useState<string | null>(initial.url);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial.url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const handle = reclubHandle(url);

  function save(next: string | null) {
    setError(null);
    startSave(async () => {
      const res = await updateReclubProfile(playerId, next);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save profile.");
        return;
      }
      setUrl(res.url ?? null);
      setDraft(res.url ?? "");
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <div className="card p-4 w-[20rem]">
        <div className="mb-3 flex items-center justify-between">
          <span className="mono-label">Reclub profile</span>
          <button
            onClick={() => {
              setEditing(false);
              setDraft(url ?? "");
              setError(null);
            }}
            className="text-xs text-action-blue underline underline-offset-4 hover:opacity-70"
          >
            Cancel
          </button>
        </div>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="https://reclub.co/id/players/@handle"
          autoFocus
          className="w-full rounded-sm border border-card-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
        <p className="mt-1.5 text-xs text-body-muted">
          Paste your Reclub profile URL (or just your @handle). We&apos;ll pull your avatar from it.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => save(draft)}
            disabled={saving}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {url && (
            <button
              onClick={() => save(null)}
              disabled={saving}
              className="text-xs text-coral underline underline-offset-4 hover:opacity-70 disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
        {error && (
          <p className="mt-2 text-xs" style={{ color: "#b30000" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0">
        <p className="mono-label">Reclub</p>
        {handle ? (
          <a
            href={url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="font-display text-lg leading-tight truncate block max-w-[180px] hover:opacity-70"
            title={url ?? undefined}
          >
            {handle}
          </a>
        ) : (
          <p className="text-body-muted text-sm leading-tight">Not linked</p>
        )}
        <button
          onClick={() => setEditing(true)}
          className="mt-1 text-xs text-action-blue underline underline-offset-4 hover:opacity-70"
        >
          {handle ? "Edit" : "Link profile"}
        </button>
        {error && (
          <p className="mt-1 text-xs" style={{ color: "#b30000" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

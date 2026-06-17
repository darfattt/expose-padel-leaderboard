"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  searchRackets,
  updatePlayerPosition,
  updatePlayerRacket,
} from "@/app/actions/player";
import type { PlayerGear, PlayerPosition, RacketOption } from "@/lib/types";

const POSITIONS: PlayerPosition[] = ["Left", "Right", "Both"];
const POS_GLYPH: Record<PlayerPosition, string> = { Left: "◐", Right: "◑", Both: "●" };

type Racket = { slug: string; name: string; brand: string; image: string | null };

function initialRacket(g: PlayerGear): Racket | null {
  return g.racketSlug
    ? {
        slug: g.racketSlug,
        name: g.racketName ?? g.racketSlug,
        brand: g.racketBrand ?? "",
        image: g.racketImage,
      }
    : null;
}

// Header-embedded player gear: a clean, image-forward view mode that expands
// into an inline picker (racket search + position toggles) when editing.
export default function GearCard({
  playerId,
  initial,
}: {
  playerId: string;
  initial: PlayerGear;
}) {
  const [racket, setRacket] = useState<Racket | null>(initialRacket(initial));
  const [position, setPosition] = useState<PlayerPosition | null>(initial.position);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  function chooseRacket(opt: RacketOption | null) {
    setRacket(opt ? { slug: opt.slug, name: opt.name, brand: opt.brand, image: opt.image } : null);
    setError(null);
    startSave(async () => {
      const res = await updatePlayerRacket(playerId, opt);
      if (!res.ok) setError(res.error ?? "Couldn't save racket.");
    });
  }

  function choosePosition(p: PlayerPosition) {
    const next = position === p ? null : p;
    setPosition(next);
    setError(null);
    startSave(async () => {
      const res = await updatePlayerPosition(playerId, next);
      if (!res.ok) setError(res.error ?? "Couldn't save position.");
    });
  }

  if (editing) {
    return (
      <EditPanel
        racket={racket}
        position={position}
        saving={saving}
        error={error}
        onPickRacket={chooseRacket}
        onPickPosition={choosePosition}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex items-end gap-4">
      <RacketThumb image={racket?.image ?? null} alt={racket?.name ?? "racket"} size={96} />
      <div className="min-w-0">
        <p className="mono-label">Racket</p>
        {racket ? (
          <>
            <p className="font-display text-xl leading-tight truncate max-w-[180px]">
              {racket.name}
            </p>
            {racket.brand && (
              <p className="text-sm text-body-muted leading-snug truncate max-w-[180px]">
                {racket.brand}
              </p>
            )}
          </>
        ) : (
          <p className="text-body-muted text-sm leading-tight">Not set</p>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          {position ? (
            <PositionPill position={position} />
          ) : (
            <span className="text-xs text-body-muted">No position</span>
          )}
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-action-blue underline underline-offset-4 hover:opacity-70"
          >
            Edit
          </button>
        </div>
        {error && (
          <p className="mt-1 text-xs" style={{ color: "#b30000" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function PositionPill({ position }: { position: PlayerPosition }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-card-border bg-soft-stone px-2 py-0.5 text-xs font-medium text-ink">
      <span aria-hidden>{POS_GLYPH[position]}</span>
      {position}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Inline editor: racket search + position toggles. Fixed width so it wraps
// predictably in the header instead of stretching it.
// ---------------------------------------------------------------------------
function EditPanel({
  racket,
  position,
  saving,
  error,
  onPickRacket,
  onPickPosition,
  onDone,
}: {
  racket: Racket | null;
  position: PlayerPosition | null;
  saving: boolean;
  error: string | null;
  onPickRacket: (r: RacketOption | null) => void;
  onPickPosition: (p: PlayerPosition) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RacketOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced live search against the Padelful catalogue.
  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchRackets(query);
      if (active) {
        setResults(res);
        setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <div className="card p-4 w-[20rem]">
      <div className="flex items-center justify-between mb-3">
        <span className="mono-label">Edit gear &amp; position</span>
        <button
          onClick={onDone}
          className="text-xs text-action-blue underline underline-offset-4 hover:opacity-70"
        >
          Done
        </button>
      </div>

      <span className="mono-label">Racket</span>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by model or brand…"
        className="mt-1 w-full rounded-sm border border-card-border bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      <div className="mt-2 max-h-56 overflow-auto divide-y divide-hairline rounded-sm border border-hairline">
        {loading && <p className="px-3 py-3 text-sm text-body-muted">Searching…</p>}
        {!loading && results.length === 0 && (
          <p className="px-3 py-3 text-sm text-body-muted">No rackets found.</p>
        )}
        {!loading &&
          results.map((opt) => {
            const active = opt.slug === racket?.slug;
            return (
              <button
                key={opt.slug}
                onClick={() => onPickRacket(opt)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-soft-stone ${
                  active ? "bg-pale-blue" : ""
                }`}
              >
                <RacketThumb image={opt.image} alt={opt.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink truncate">{opt.name}</span>
                  <span className="block text-xs text-body-muted truncate">
                    {opt.brand}
                    {opt.shape ? ` · ${opt.shape}` : ""}
                  </span>
                </span>
                {opt.rating && (
                  <span className="font-mono text-sm tabular-nums text-body-muted shrink-0">
                    {opt.rating}
                  </span>
                )}
              </button>
            );
          })}
      </div>
      {racket && (
        <button
          onClick={() => onPickRacket(null)}
          className="mt-2 text-xs text-coral underline underline-offset-4 hover:opacity-70"
        >
          Remove racket
        </button>
      )}

      <div className="mt-4">
        <span className="mono-label">Playing position</span>
        <div className="mt-1 flex gap-2">
          {POSITIONS.map((p) => {
            const active = position === p;
            return (
              <button
                key={p}
                onClick={() => onPickPosition(p)}
                aria-pressed={active}
                className={`flex-1 rounded-sm border px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary bg-pale-blue text-ink font-medium"
                    : "border-card-border bg-white text-body-muted hover:border-slate"
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {(saving || error) && (
        <p
          className="mt-3 text-xs"
          style={error ? { color: "#b30000" } : undefined}
        >
          {error ?? "Saving…"}
        </p>
      )}
    </div>
  );
}

// Product shot on a soft tile; falls back to a ball glyph so it never renders
// broken. Padelful racket PNGs are transparent product shots, so object-contain
// keeps them fully exposed.
function RacketThumb({
  image,
  alt,
  size = 96,
}: {
  image: string | null;
  alt: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  // Reset the error state when the image source changes.
  useEffect(() => {
    setFailed(false);
  }, [image]);
  return (
    <span
      className="inline-flex items-center justify-center rounded-md overflow-hidden shrink-0 border border-hairline bg-soft-stone"
      style={{ width: size, height: size }}
    >
      {image && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Padelful URL; avoids next/image domain config
        <img
          src={image}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-contain p-1.5"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <span aria-hidden style={{ fontSize: Math.round(size * 0.4) }}>
          🎾
        </span>
      )}
    </span>
  );
}

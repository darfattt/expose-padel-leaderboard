"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PlayerAvatar from "@/app/components/PlayerAvatar";
import GameIcon from "@/app/components/GameIcon";
import { loadLeaderboardPage } from "@/app/actions/leaderboard";
import { levelForRating } from "@/lib/levels";
import type { RankedPlayerWithChange } from "@/lib/standings";

const COLS = "grid-cols-[3rem_2.5rem_1fr_4rem_10rem_8rem_4.5rem_3.5rem_4rem_4.5rem]";

type Avatars = Record<string, string | null>;

// The ranked leaderboard with infinite scroll. The first page (30 rows) is
// rendered on the server and passed in; an IntersectionObserver on a sentinel
// row at the bottom requests the next page via a Server Action and appends it.
// Ratings/ranks are computed server-side against the whole field — this only
// controls how many rows are shipped to the client at a time.
export default function LeaderboardBoard({
  initialRows,
  initialAvatars,
  clubId,
  period,
  initialOffset,
  initialHasMore,
}: {
  initialRows: RankedPlayerWithChange[];
  initialAvatars: Avatars;
  clubId?: string;
  period: string;
  initialOffset: number;
  initialHasMore: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [avatars, setAvatars] = useState<Avatars>(initialAvatars);
  const [offset, setOffset] = useState(initialOffset);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  // Reset when the club/period changes (the server sends a fresh first page).
  useEffect(() => {
    setRows(initialRows);
    setAvatars(initialAvatars);
    setOffset(initialOffset);
    setHasMore(initialHasMore);
  }, [initialRows, initialAvatars, initialOffset, initialHasMore]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const page = await loadLeaderboardPage(clubId, period, offset);
      setRows((prev) => [...prev, ...page.rows]);
      setAvatars((prev) => ({ ...prev, ...page.avatars }));
      setOffset(page.nextOffset);
      setHasMore(page.hasMore);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [clubId, period, offset, hasMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, hasMore]);

  return (
    <div className="border-t border-hairline">
      <BoardHeader />
      {rows.map((p) => (
        <BoardRow key={p.row.player_id} p={p} avatar={avatars[p.row.player_id] ?? null} />
      ))}
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-px" />}
      {loading && (
        <div className="py-4 text-center mono-label text-body-muted">Loading more…</div>
      )}
    </div>
  );
}

// The provisional list (fewer than 3 games) — small and static, rendered in full
// with no pagination. Shares the row markup with the ranked board above.
export function ProvisionalBoard({
  rows,
  avatars,
}: {
  rows: RankedPlayerWithChange[];
  avatars: Avatars;
}) {
  return (
    <div className="border-t border-hairline">
      <BoardHeader />
      {rows.map((p) => (
        <BoardRow key={p.row.player_id} p={p} avatar={avatars[p.row.player_id] ?? null} provisional />
      ))}
    </div>
  );
}

function BoardHeader() {
  return (
    <div className={`hidden sm:grid ${COLS} gap-4 py-3 mono-label border-b border-hairline`}>
      <span>#</span>
      <span></span>
      <span>Player</span>
      <span className="text-right">Rating</span>
      <span>Level</span>
      <span>Archetype</span>
      <span className="text-right">W–L</span>
      <span className="text-right">GP</span>
      <span className="text-right">Win %</span>
      <span className="text-right">Pts</span>
    </div>
  );
}

function BoardRow({
  p,
  avatar,
  provisional = false,
}: {
  p: RankedPlayerWithChange;
  avatar: string | null;
  provisional?: boolean;
}) {
  const level = levelForRating(p.rating);
  return (
    <Link
      href={`/players/${p.row.player_id}`}
      className={`grid ${COLS} gap-4 items-center py-4 border-b border-hairline hover:bg-soft-stone/40 transition-colors`}
    >
      <span className="font-display text-xl tabular-nums text-slate">
        {provisional ? "—" : p.rank}
      </span>
      <span>
        <RankChange delta={p.rankDelta} isNew={p.isNew} />
      </span>
      <span className="flex items-center gap-2.5 min-w-0">
        <PlayerAvatar name={p.row.name} avatarUrl={avatar} size={32} />
        <span className="font-display text-lg tracking-tight truncate">{p.row.name}</span>
      </span>
      <span className="text-right font-mono text-lg tabular-nums">
        {p.rating.toFixed(1)}
        <RustMark penalty={p.ratingPenalty} days={p.daysInactive} />
      </span>
      <span>
        <LevelBadge level={level} />
      </span>
      <span>
        <span className="archetype-chip">{p.archetype.label}</span>
      </span>
      <span className="text-right tabular-nums text-body-muted">
        {p.row.wins}–{p.row.losses}
        {p.row.draws ? `–${p.row.draws}` : ""}
      </span>
      <span className="text-right tabular-nums text-body-muted">{p.row.games}</span>
      <span className="text-right tabular-nums text-body-muted">
        {Math.round(p.metrics.winRate * 100)}%
      </span>
      <span className="text-right tabular-nums text-body-muted">{p.row.points_for}</span>
    </Link>
  );
}

// Up/down movement since the standings before the most recent event.
function RankChange({ delta, isNew }: { delta: number | null; isNew: boolean }) {
  if (isNew) {
    return (
      <span
        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-mono tracking-mono-label"
        style={{ color: "#1863dc", backgroundColor: "#1863dc12" }}
        title="New to the ranked board"
      >
        NEW
      </span>
    );
  }
  if (delta === null) return null;
  if (delta === 0) {
    return (
      <span className="font-mono text-xs text-muted" title="No change" aria-label="No change">
        –
      </span>
    );
  }
  const up = delta > 0;
  const color = up ? "#1f8a4c" : "#d23f3f";
  return (
    <span
      className="inline-flex items-center gap-0.5 font-mono text-xs tabular-nums"
      style={{ color }}
      title={up ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
      aria-label={up ? `Up ${delta}` : `Down ${Math.abs(delta)}`}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      {Math.abs(delta)}
    </span>
  );
}

// A small "rust" marker shown when a player's rating has been docked for
// inactivity (see lib/decay.ts). Hidden for fresh players.
function RustMark({ penalty, days }: { penalty: number; days: number | null }) {
  if (!penalty) return null;
  const title = `Rusty: −${penalty.toFixed(1)} for ${days ?? "?"} days off the court`;
  return (
    <span className="ml-1 align-middle text-xs text-coral" title={title} aria-label={title}>
      💤
    </span>
  );
}

function LevelBadge({ level }: { level: ReturnType<typeof levelForRating> }) {
  return (
    <span
      className="level-chip"
      style={{ color: level.color, borderColor: `${level.color}55`, backgroundColor: `${level.color}12` }}
      title={`${level.category} — ${level.description}`}
    >
      <GameIcon name={level.icon} fallback={level.badge} color={level.color} size={14} />
      {level.category}
    </span>
  );
}

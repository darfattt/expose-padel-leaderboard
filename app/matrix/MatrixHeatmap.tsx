"use client";

import { useState } from "react";
import Link from "next/link";

export interface MatrixCell {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  pointDiff: number;
}

export interface MatrixPlayer {
  id: string;
  name: string;
  rank: number | null;
}

// Win-rate → background: deep green when you own them, coral when they own you,
// near-blank at an even split. Intensity scales with how lopsided the record is.
function cellBg(winRate: number): string {
  const up = winRate >= 0.5;
  const intensity = Math.abs(winRate - 0.5) * 2; // 0 (even) .. 1 (clean sweep)
  const alpha = 0.1 + intensity * 0.72;
  return up ? `rgba(31, 138, 76, ${alpha})` : `rgba(210, 63, 63, ${alpha})`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A reading of one player's record against the whole field — a grid where row i,
// column j is player i's head-to-head vs player j. Hover a cell to light up the
// matchup; tap one (where they've met) to open the full head-to-head.
export default function MatrixHeatmap({
  players,
  grid,
}: {
  players: MatrixPlayer[];
  grid: (MatrixCell | null)[][];
}) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const n = players.length;
  // First column wide enough for names; the rest are square-ish.
  const cols = `8.5rem repeat(${n}, minmax(2.1rem, 1fr))`;

  return (
    <div>
      <div className="card p-4 sm:p-6 overflow-x-auto">
        <div className="min-w-[640px]" style={{ display: "grid", gridTemplateColumns: cols }}>
          {/* Corner + column headers */}
          <div className="mono-label flex items-end pb-2 pl-1">vs →</div>
          {players.map((p, c) => (
            <div
              key={p.id}
              className={`flex items-end justify-center pb-2 text-[11px] font-mono tabular-nums transition-colors ${
                hover?.c === c ? "text-ink" : "text-slate"
              }`}
              title={p.name}
            >
              {initials(p.name)}
            </div>
          ))}

          {/* Rows */}
          {players.map((rp, r) => (
            <Row key={rp.id}>
              <div
                className={`flex items-center gap-2 py-1 pr-2 text-sm truncate transition-colors ${
                  hover?.r === r ? "text-ink" : "text-body-muted"
                }`}
                title={rp.name}
              >
                <span className="font-mono text-[11px] text-muted w-4 text-right tabular-nums">
                  {rp.rank ?? "–"}
                </span>
                <Link href={`/players/${rp.id}`} className="truncate hover:text-ink hover:underline">
                  {rp.name}
                </Link>
              </div>
              {players.map((cp, c) => {
                const cell = grid[r][c];
                const lit = hover && (hover.r === r || hover.c === c);
                if (r === c) {
                  return (
                    <div
                      key={cp.id}
                      className="m-px rounded-[3px] bg-soft-stone/50"
                      aria-hidden
                    />
                  );
                }
                if (!cell) {
                  return (
                    <div
                      key={cp.id}
                      className={`m-px rounded-[3px] border border-card-border ${lit ? "bg-soft-stone/40" : ""}`}
                      title={`${rp.name} and ${cp.name} have never met`}
                      onMouseEnter={() => setHover({ r, c })}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                }
                const title = `${rp.name} vs ${cp.name}: ${cell.wins}–${cell.losses}${cell.draws ? `–${cell.draws}` : ""} (${Math.round(cell.winRate * 100)}%) · ${cell.pointDiff >= 0 ? "+" : ""}${cell.pointDiff} pts`;
                return (
                  <Link
                    key={cp.id}
                    href={`/players/${rp.id}/vs/${cp.id}`}
                    title={title}
                    onMouseEnter={() => setHover({ r, c })}
                    onMouseLeave={() => setHover(null)}
                    className={`m-px flex items-center justify-center rounded-[3px] text-[10px] font-mono tabular-nums text-ink/80 transition-shadow ${
                      lit ? "ring-1 ring-inset ring-ink/30" : ""
                    }`}
                    style={{ backgroundColor: cellBg(cell.winRate), minHeight: "2.1rem" }}
                  >
                    {Math.round(cell.winRate * 100)}
                  </Link>
                );
              })}
            </Row>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-body-muted border-t border-hairline pt-4">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-6 rounded-[3px]" style={{ backgroundColor: cellBg(1) }} />
          Dominates
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-6 rounded-[3px]" style={{ backgroundColor: cellBg(0.5) }} />
          Even
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-6 rounded-[3px]" style={{ backgroundColor: cellBg(0) }} />
          Owned by
        </span>
        <span>
          Each cell is the <strong className="text-ink">row</strong> player&apos;s win % vs the{" "}
          <strong className="text-ink">column</strong> player. Tap a cell for the full head-to-head.
        </span>
      </div>
    </div>
  );
}

// `display: contents` lets each row's cells participate in the parent grid while
// still grouping for the key.
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "contents" }}>{children}</div>;
}

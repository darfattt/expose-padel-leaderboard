import Link from "next/link";
import type { PairRecord } from "@/lib/relationships";

// Result coloring, matching the fixed convention used in the match-history table
// (app/players/[id]/page.tsx): W → green, L → muted, D → slate.
export const RESULT_TEXT: Record<"W" | "L" | "D", string> = {
  W: "text-deep-green",
  L: "text-muted",
  D: "text-slate",
};

// "W–L" or "W–L–D" with an en-dash; the draw suffix is dropped when there are
// none, exactly like the Record stat line on the profile.
export function recordLabel(r: { wins: number; losses: number; draws: number }): string {
  return `${r.wins}–${r.losses}${r.draws ? `–${r.draws}` : ""}`;
}

export function winPct(r: { winRate: number }): string {
  return `${Math.round(r.winRate * 100)}%`;
}

// A compact win-rate bar: a deep-green fill proportional to the win rate over a
// hairline track, with the percentage to its right. Turns the partner/rival
// tables into a quick at-a-glance heatmap of who a player wins with and against.
export function WinRateBar({ winRate }: { winRate: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, winRate)) * 100);
  return (
    <span className="flex items-center gap-2">
      <span className="relative h-1.5 flex-1 rounded-full bg-soft-stone overflow-hidden">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-deep-green"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-mono tabular-nums text-xs text-body-muted w-9 text-right">{pct}%</span>
    </span>
  );
}

// A "gossip stats" hook line — a coral callout (matching the archetype-chip
// palette) for the punchy one-liner above each section. Renders nothing when
// there's no hook to show.
export function GossipLine({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p className="text-sm text-ink rounded-sm border border-coral-soft bg-[#fff5f2] px-3 py-2">
      {children}
    </p>
  );
}

// A small square badge for a single game result.
export function ResultPill({ result }: { result: "W" | "L" | "D" }) {
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border border-hairline font-mono text-xs font-medium ${RESULT_TEXT[result]}`}
    >
      {result}
    </span>
  );
}

// A name chip that links to a player's profile (used for best/worst partner and
// nemesis/favourite-victim callouts).
export function PlayerChip({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/players/${id}`} className="archetype-chip hover:opacity-70">
      {name}
    </Link>
  );
}

// A labelled superlative callout: caption, a linked name chip, then the record.
export function Superlative({
  label,
  record,
}: {
  label: string;
  record: PairRecord;
}) {
  return (
    <div className="border-t border-hairline pt-3">
      <div className="mono-label mb-2">{label}</div>
      <PlayerChip id={record.id} name={record.name} />
      <div className="text-body-muted text-sm mt-2">
        {recordLabel(record)} · {winPct(record)} win
      </div>
    </div>
  );
}

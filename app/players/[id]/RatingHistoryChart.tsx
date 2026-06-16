"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { levelForRating } from "@/lib/levels";
import type { RatingHistoryPoint } from "@/lib/rating-history";

interface Datum extends RatingHistoryPoint {
  label: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Short x-axis label from the ISO date, parsed by parts to avoid timezone
// drift; falls back to a 1-based event index when the event has no date.
function shortLabel(p: RatingHistoryPoint, index: number): string {
  if (p.playedOn) {
    const [y, m, d] = p.playedOn.split("-").map(Number);
    if (y && m && d) return `${MONTHS[m - 1]} ${d}`;
  }
  return `#${index + 1}`;
}

function RatingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Datum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-sm shadow-sm">
      <div className="text-ink font-medium truncate max-w-[220px]">{d.eventTitle}</div>
      {d.playedOn ? <div className="mono-label">{d.playedOn}</div> : null}
      <div className="font-mono tabular-nums mt-1">
        Rating {d.rating.toFixed(1)} · {d.games} {d.games === 1 ? "game" : "games"}
      </div>
    </div>
  );
}

export default function RatingHistoryChart({ history }: { history: RatingHistoryPoint[] }) {
  const data: Datum[] = history.map((p, i) => ({ ...p, label: shortLabel(p, i) }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: "#616161", fontSize: 11, fontFamily: "var(--font-sans)" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 10]}
          ticks={[0, 2, 4, 6, 8, 10]}
          tick={{ fill: "#616161", fontSize: 11, fontFamily: "var(--font-sans)" }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip cursor={{ fill: "rgba(23,23,28,0.04)" }} content={<RatingTooltip />} />
        <Bar dataKey="rating" radius={[3, 3, 0, 0]} maxBarSize={48} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.eventId} fill={levelForRating(d.rating).color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth } from "@/lib/standings";

export interface TrajectoryLine {
  id: string;
  name: string;
  ranks: (number | null)[]; // aligned to months, null where provisional/absent
}

// A distinct, restrained palette — enough hues to tell ~8 lines apart without
// straying from the editorial look.
const PALETTE = [
  "#17171c",
  "#ff7759",
  "#1863dc",
  "#1f8a4c",
  "#7048e8",
  "#f08c00",
  "#0c8599",
  "#d23f3f",
];

interface Datum {
  month: string;
  [seriesId: string]: number | string | null;
}

function RankTooltip({
  active,
  payload,
  label,
  nameById,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number | null; color: string }>;
  label?: string;
  nameById: Map<string, string>;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p) => p.value != null)
    .sort((a, b) => (a.value as number) - (b.value as number));
  return (
    <div className="card px-3 py-2 text-xs shadow-sm bg-canvas">
      <div className="mono-label mb-1">{label ? formatMonth(label) : ""}</div>
      <div className="space-y-0.5">
        {rows.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
              {nameById.get(p.dataKey) ?? p.dataKey}
            </span>
            <span className="font-mono tabular-nums">#{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrajectoryChart({
  months,
  series,
}: {
  months: string[];
  series: TrajectoryLine[];
}) {
  const data: Datum[] = months.map((month, i) => {
    const row: Datum = { month };
    for (const s of series) row[s.id] = s.ranks[i];
    return row;
  });
  const nameById = new Map(series.map((s) => [s.id, s.name]));
  const maxRank = Math.max(
    1,
    ...series.flatMap((s) => s.ranks.filter((r): r is number => r != null))
  );

  return (
    <ResponsiveContainer width="100%" height={Math.max(320, series.length * 28 + 120)}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#f2f2f2" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fill: "#616161", fontSize: 11, fontFamily: "var(--font-sans)" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
        />
        <YAxis
          reversed
          domain={[1, maxRank]}
          allowDecimals={false}
          tick={{ fill: "#616161", fontSize: 11, fontFamily: "var(--font-sans)" }}
          axisLine={false}
          tickLine={false}
          width={28}
          tickFormatter={(v) => `#${v}`}
        />
        <Tooltip content={<RankTooltip nameById={nameById} />} />
        {series.map((s, i) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={s.id}
            name={s.name}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: PALETTE[i % PALETTE.length] }}
            activeDot={{ r: 4 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

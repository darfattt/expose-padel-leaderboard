"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RatingBin } from "@/lib/distribution";

interface Datum extends RatingBin {
  tick: string; // x-axis label, e.g. "3.0"
}

function BinTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Datum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-sm bg-canvas">
      <div className="font-medium" style={{ color: d.color }}>
        {d.label}
      </div>
      <div className="mono-label">
        {d.min.toFixed(1)}–{d.max.toFixed(1)}
      </div>
      <div className="font-mono tabular-nums mt-1">
        {d.count} {d.count === 1 ? "player" : "players"}
      </div>
    </div>
  );
}

// The field's rating spread, one bar per half-point band (coloured to match the
// level chips). When `markerRating` is given, a dashed line marks where that
// player sits on the curve.
export default function RatingHistogram({
  bins,
  markerRating,
  height = 220,
}: {
  bins: RatingBin[];
  markerRating?: number;
  height?: number;
}) {
  const data: Datum[] = bins.map((b) => ({ ...b, tick: b.min.toFixed(1) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <XAxis
          dataKey="tick"
          tick={{ fill: "#616161", fontSize: 11, fontFamily: "var(--font-sans)" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
          interval={1}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: "#616161", fontSize: 11, fontFamily: "var(--font-sans)" }}
          axisLine={false}
          tickLine={false}
          width={24}
        />
        <Tooltip cursor={{ fill: "rgba(23,23,28,0.04)" }} content={<BinTooltip />} />
        {markerRating != null ? (
          <ReferenceLine
            x={(Math.floor(markerRating / 0.5) * 0.5).toFixed(1)}
            stroke="#17171c"
            strokeDasharray="4 3"
            label={{ value: "You", position: "top", fill: "#17171c", fontSize: 11 }}
          />
        ) : null}
        <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.min} fill={d.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

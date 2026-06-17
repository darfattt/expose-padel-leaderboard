"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ArchetypeSlice } from "@/lib/distribution";

// Slice colour follows the dominant axis, so the same trait reads the same hue
// here as it does in the archetype labels themselves.
const AXIS_COLOR: Record<string, string> = {
  attack: "#ff7759",
  win: "#1f8a4c",
  clutch: "#7048e8",
  consistency: "#1863dc",
  defense: "#0c8599",
  balanced: "#75758a",
};

function colorFor(primary: string): string {
  return AXIS_COLOR[primary] ?? "#75758a";
}

function PieTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ payload: ArchetypeSlice }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-sm bg-canvas">
      <div className="font-display text-sm tracking-tight">{s.label}</div>
      <div className="font-mono tabular-nums text-body-muted mt-0.5">
        {s.count} {s.count === 1 ? "player" : "players"} · {Math.round((s.count / total) * 100)}%
      </div>
    </div>
  );
}

export default function ArchetypePie({ slices }: { slices: ArchetypeSlice[] }) {
  const total = slices.reduce((a, s) => a + s.count, 0);

  return (
    <div className="grid sm:grid-cols-[200px_1fr] gap-6 items-center">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="count"
            nameKey="label"
            innerRadius={48}
            outerRadius={88}
            paddingAngle={1.5}
            stroke="#ffffff"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s) => (
              <Cell key={s.label} fill={colorFor(s.primary)} />
            ))}
          </Pie>
          <Tooltip content={<PieTooltip total={total} />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend / breakdown */}
      <ul className="space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 truncate">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: colorFor(s.primary) }}
              />
              <span className="truncate text-ink">{s.label}</span>
            </span>
            <span className="font-mono tabular-nums text-body-muted">
              {s.count} · {Math.round((s.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

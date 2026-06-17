"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PpgPoint } from "@/lib/distribution";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(playedOn: string | null): string {
  if (!playedOn) return "";
  const [y, m, d] = playedOn.split("-").map(Number);
  if (y && m && d) return `${MONTHS[m - 1]} ${d}`;
  return "";
}

function SparkTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PpgPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs shadow-sm bg-canvas">
      <div className="text-ink font-medium truncate max-w-[200px]">{d.eventTitle}</div>
      {d.playedOn ? <div className="mono-label">{shortDate(d.playedOn)}</div> : null}
      <div className="font-mono tabular-nums mt-1">
        {d.ppg.toFixed(1)} pts/game · {d.diffPg >= 0 ? "+" : ""}
        {d.diffPg.toFixed(1)} diff
      </div>
    </div>
  );
}

// A compact per-event scoring-form line. No axes — it's a sparkline, read for its
// shape (trending up = scoring more) with the detail in the tooltip.
export default function PpgSparkline({ points }: { points: PpgPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={56}>
      <LineChart data={points} margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
        <Tooltip content={<SparkTooltip />} />
        <Line
          type="monotone"
          dataKey="ppg"
          stroke="#ff7759"
          strokeWidth={1.75}
          dot={{ r: 1.8, strokeWidth: 0, fill: "#ff7759" }}
          activeDot={{ r: 3.5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DECAY_GRACE_DAYS, DECAY_MAX, DECAY_PER_DAY, decayPenalty } from "@/lib/decay";

// The rust curve, drawn straight from lib/decay.ts so it can never drift from the
// real penalty: flat through the grace window, then a slow linear slide, capped.
const LAST_DAY = Math.ceil(DECAY_GRACE_DAYS + DECAY_MAX / DECAY_PER_DAY) + 40;

function CurveTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  const penalty = payload[0].value;
  return (
    <div className="card px-3 py-2 text-xs shadow-sm bg-canvas">
      <div className="mono-label">{label} days off</div>
      <div className="font-mono tabular-nums mt-1">
        {penalty > 0 ? `−${penalty.toFixed(1)} rust` : "no penalty"}
      </div>
    </div>
  );
}

export default function DecayCurve() {
  const data = [];
  for (let d = 0; d <= LAST_DAY; d += 5) {
    data.push({ day: d, penalty: decayPenalty(d) });
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="rust" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff7759" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#ff7759" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        {/* Grace window — no penalty no matter what. */}
        <ReferenceArea x1={0} x2={DECAY_GRACE_DAYS} fill="#1f8a4c" fillOpacity={0.06} />
        <XAxis
          dataKey="day"
          type="number"
          domain={[0, LAST_DAY]}
          ticks={[0, DECAY_GRACE_DAYS, 90, 150, 210]}
          tick={{ fill: "#616161", fontSize: 11, fontFamily: "var(--font-sans)" }}
          axisLine={{ stroke: "#e5e7eb" }}
          tickLine={false}
          label={{ value: "days since last game", position: "insideBottom", offset: -2, fill: "#616161", fontSize: 11 }}
        />
        <YAxis
          domain={[0, DECAY_MAX]}
          tick={{ fill: "#616161", fontSize: 11, fontFamily: "var(--font-sans)" }}
          axisLine={false}
          tickLine={false}
          width={32}
          tickFormatter={(v) => `−${v}`}
        />
        <Tooltip content={<CurveTooltip />} />
        <ReferenceLine
          x={DECAY_GRACE_DAYS}
          stroke="#1f8a4c"
          strokeDasharray="4 3"
          label={{ value: `${DECAY_GRACE_DAYS}d grace`, position: "insideTopRight", fill: "#1f8a4c", fontSize: 10 }}
        />
        <ReferenceLine
          y={DECAY_MAX}
          stroke="#93939f"
          strokeDasharray="4 3"
          label={{ value: `cap −${DECAY_MAX.toFixed(1)}`, position: "insideTopLeft", fill: "#93939f", fontSize: 10 }}
        />
        <Area
          type="linear"
          dataKey="penalty"
          stroke="#ff7759"
          strokeWidth={2}
          fill="url(#rust)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

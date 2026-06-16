"use client";

import { useRouter } from "next/navigation";
import {
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export interface ScatterPoint {
  id: string;
  name: string;
  power: number;
  win: number;
  clutch: number;
  consistency: number;
  games: number;
  provisional: boolean;
}

// The four playstyle quadrants, keyed by whether Power / Win clear the midline.
// Each gets an entertaining, unique label — the corner of the court it owns.
const MID = 50;

type Quadrant = {
  label: string;
  emoji: string;
  blurb: string;
  corner: string; // tailwind positioning for the overlay label
  align: string;
};

const QUADRANTS = {
  // high power, high win
  juggernaut: {
    label: "Juggernauts",
    emoji: "👑",
    blurb: "Outscore everyone — and turn it into wins.",
    corner: "top-2 right-2",
    align: "text-right items-end",
  },
  // low power, high win
  heist: {
    label: "The Heist Crew",
    emoji: "🦝",
    blurb: "Win without dominating the scoreboard. Daylight robbery.",
    corner: "top-2 left-2",
    align: "text-left items-start",
  },
  // high power, low win
  cannon: {
    label: "Glass Cannons",
    emoji: "💥",
    blurb: "Pile up points, somehow still lose. Style over result.",
    corner: "bottom-2 right-2",
    align: "text-right items-end",
  },
  // low power, low win
  build: {
    label: "The Build Arc",
    emoji: "🌱",
    blurb: "Still leveling up. The comeback starts here.",
    corner: "bottom-2 left-2",
    align: "text-left items-start",
  },
} satisfies Record<string, Quadrant>;

function quadrantOf(p: { power: number; win: number }) {
  if (p.power >= MID) return p.win >= MID ? QUADRANTS.juggernaut : QUADRANTS.cannon;
  return p.win >= MID ? QUADRANTS.heist : QUADRANTS.build;
}

// Consistency drives the shade: steadier players sit deeper coral.
function fillFor(consistency: number) {
  return 0.22 + (Math.max(0, Math.min(100, consistency)) / 100) * 0.6;
}

export default function ScatterPlot({ points }: { points: ScatterPoint[] }) {
  const router = useRouter();

  return (
    <div>
      <div className="card p-4 sm:p-6">
        <div className="relative">
          {/* Quadrant labels overlaid on the plot corners */}
          {Object.values(QUADRANTS).map((q) => (
            <div
              key={q.label}
              className={`pointer-events-none absolute ${q.corner} z-10 flex flex-col ${q.align} max-w-[44%]`}
            >
              <span className="font-display text-sm sm:text-base tracking-tight text-ink/80">
                {q.emoji} {q.label}
              </span>
            </div>
          ))}

          <ResponsiveContainer width="100%" height={480}>
            <ScatterChart margin={{ top: 24, right: 24, bottom: 36, left: 8 }}>
              <ReferenceLine x={MID} stroke="#d9d9dd" strokeDasharray="4 4" />
              <ReferenceLine y={MID} stroke="#d9d9dd" strokeDasharray="4 4" />
              <XAxis
                type="number"
                dataKey="power"
                name="Power"
                domain={[0, 100]}
                tick={{ fill: "#616161", fontSize: 12, fontFamily: "var(--font-sans)" }}
                tickLine={false}
                axisLine={{ stroke: "#d9d9dd" }}
                label={{
                  value: "Power →",
                  position: "insideBottom",
                  offset: -18,
                  fill: "#616161",
                  fontSize: 12,
                }}
              />
              <YAxis
                type="number"
                dataKey="win"
                name="Win rate"
                domain={[0, 100]}
                tick={{ fill: "#616161", fontSize: 12, fontFamily: "var(--font-sans)" }}
                tickLine={false}
                axisLine={{ stroke: "#d9d9dd" }}
                label={{
                  value: "Win rate →",
                  angle: -90,
                  position: "insideLeft",
                  offset: 18,
                  fill: "#616161",
                  fontSize: 12,
                }}
              />
              <ZAxis type="number" dataKey="clutch" range={[60, 620]} name="Clutch" />
              <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "#d9d9dd" }} content={<PointTooltip />} />
              <Scatter
                data={points}
                onClick={(node: { id?: string; payload?: { id?: string } }) => {
                  const id = node?.id ?? node?.payload?.id;
                  if (id) router.push(`/players/${id}`);
                }}
                className="cursor-pointer"
              >
                {points.map((p) => (
                  <Cell
                    key={p.id}
                    fill="#ff7759"
                    fillOpacity={fillFor(p.consistency)}
                    stroke="#17171c"
                    strokeWidth={1}
                    strokeOpacity={p.provisional ? 0.35 : 0.9}
                  />
                ))}
                <LabelList dataKey="name" content={<NameLabel />} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Encoding legend */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-body-muted border-t border-hairline pt-4">
          <span><strong className="text-ink">X</strong> Power</span>
          <span><strong className="text-ink">Y</strong> Win rate</span>
          <span><strong className="text-ink">Bubble size</strong> Clutch</span>
          <span><strong className="text-ink">Bubble shade</strong> Consistency (deeper = steadier)</span>
          <span className="opacity-70">Tap a bubble to open the player.</span>
        </div>
      </div>

      {/* Quadrant key */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Object.values(QUADRANTS).map((q) => (
          <div key={q.label} className="card p-4">
            <p className="font-display text-base tracking-tight mb-1">
              {q.emoji} {q.label}
            </p>
            <p className="text-sm text-body-muted">{q.blurb}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// Always-on player name, centered just above each bubble. recharts passes the
// symbol center as x/y for scatter labels.
function NameLabel(props: {
  x?: number;
  y?: number;
  value?: string | number;
}) {
  const { x, y, value } = props;
  if (x == null || y == null || value == null) return null;
  return (
    <text
      x={x}
      y={y - 9}
      textAnchor="middle"
      fontSize={10}
      fontFamily="var(--font-sans)"
      fill="#212121"
      style={{ pointerEvents: "none" }}
    >
      {String(value)}
    </text>
  );
}

function PointTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ScatterPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const q = quadrantOf(p);
  const stat = (label: string, v: number) => (
    <div className="flex items-center justify-between gap-6">
      <span className="text-body-muted">{label}</span>
      <span className="font-mono tabular-nums">{Math.round(v)}</span>
    </div>
  );
  return (
    <div className="card p-3 text-xs shadow-sm bg-canvas">
      <p className="font-display text-sm tracking-tight mb-0.5">{p.name}</p>
      <p className="mb-2 text-coral">{q.emoji} {q.label}</p>
      <div className="space-y-1 min-w-[9rem]">
        {stat("Power", p.power)}
        {stat("Win rate", p.win)}
        {stat("Clutch", p.clutch)}
        {stat("Consistency", p.consistency)}
      </div>
      <p className="mt-2 text-body-muted">{p.games} games{p.provisional ? " · provisional" : ""}</p>
    </div>
  );
}

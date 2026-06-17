"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { Attributes } from "@/lib/archetype";

// Two players' attribute profiles on one radar. Player A is deep green, player B
// coral — the same sides used by the prediction bar above, so the colours read
// consistently down the page. Attack/Defense fold into "Power" exactly like the
// single-player radar on a profile.
export default function CompareRadar({
  nameA,
  attrA,
  nameB,
  attrB,
}: {
  nameA: string;
  attrA: Attributes;
  nameB: string;
  attrB: Attributes;
}) {
  const data = [
    { attr: "Power", a: attrA.attack, b: attrB.attack },
    { attr: "Win", a: attrA.win, b: attrB.win },
    { attr: "Clutch", a: attrA.clutch, b: attrB.clutch },
    { attr: "Consistency", a: attrA.consistency, b: attrB.consistency },
  ];
  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={data} outerRadius="68%">
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="attr"
          tick={{ fill: "#616161", fontSize: 12, fontFamily: "var(--font-sans)" }}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar name={nameA} dataKey="a" stroke="#003c33" fill="#1f8a4c" fillOpacity={0.22} strokeWidth={1.5} />
        <Radar name={nameB} dataKey="b" stroke="#c2452f" fill="#ff7759" fillOpacity={0.22} strokeWidth={1.5} />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-sans)", color: "#616161" }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

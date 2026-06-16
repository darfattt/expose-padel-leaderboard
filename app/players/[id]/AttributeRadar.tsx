"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { Attributes } from "@/lib/archetype";

export default function AttributeRadar({ attributes }: { attributes: Attributes }) {
  const data = [
    { attr: "Attack", value: attributes.attack },
    { attr: "Defense", value: attributes.defense },
    { attr: "Consistency", value: attributes.consistency },
    { attr: "Clutch", value: attributes.clutch },
    { attr: "Win", value: attributes.win },
  ];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="attr"
          tick={{ fill: "#616161", fontSize: 12, fontFamily: "var(--font-sans)" }}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke="#17171c" fill="#ff7759" fillOpacity={0.35} strokeWidth={1.5} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseScoresheet } from "./parse-scoresheet";

async function findPdf(): Promise<string> {
  const root = path.resolve(__dirname, "..");
  const files = await readdir(root);
  const pdf = files.find((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdf) throw new Error("No sample PDF found in project root");
  return path.join(root, pdf);
}

describe("parseScoresheet on the Reclub sample", () => {
  it("parses 36 matches, 16 players, all summing to 21", async () => {
    const buf = await readFile(await findPdf());
    const result = await parseScoresheet(new Uint8Array(buf), "sample.pdf");

    expect(result.matches.length).toBe(36);

    const roster = new Set<string>();
    for (const m of result.matches) {
      [...m.team1, ...m.team2].forEach((p) => roster.add(p));
      expect(m.team1).toHaveLength(2);
      expect(m.team2).toHaveLength(2);
      expect(m.team1Score + m.team2Score).toBe(21);
    }
    expect(roster.size).toBe(16);

    // 18 rounds x 2 courts
    const rounds = new Set(result.matches.map((m) => m.round));
    expect(rounds.size).toBe(18);

    // Spot-check round 1 court 1: Faisal/Eggi 18 vs Darfat/Taufik 3
    const r1c1 = result.matches.find((m) => m.round === 1 && m.court === 1)!;
    expect(r1c1.team1).toContain("Faisal");
    expect(r1c1.team1Score).toBe(18);
    expect(r1c1.team2Score).toBe(3);

    expect(result.event.format).toBe("Mexicano");
    expect(result.warnings).toEqual([]);
  });
});

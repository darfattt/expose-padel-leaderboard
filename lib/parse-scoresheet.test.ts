import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { cleanName, parseScoresheet } from "./parse-scoresheet";

describe("cleanName", () => {
  it("joins a name whose letters were spaced apart", () => {
    expect(cleanName("S Y A F I K")).toBe("SYAFIK");
  });

  it("joins a spaced first name but leaves a normal surname intact", () => {
    expect(cleanName("S Y A F I K Putra")).toBe("SYAFIK Putra");
  });

  it("preserves a lone middle initial between real words", () => {
    expect(cleanName("Juan M Lebron")).toBe("Juan M Lebron");
  });

  it("leaves ordinary names untouched and preserves case", () => {
    expect(cleanName("Faisal")).toBe("Faisal");
    expect(cleanName("Joao Pedro")).toBe("Joao Pedro");
  });

  it("collapses redundant whitespace", () => {
    expect(cleanName("  Joao   Pedro ")).toBe("Joao Pedro");
  });
});

async function findPdf(): Promise<string> {
  // Sample scoresheets live in the project root or in source_pdf/.
  const roots = [path.resolve(__dirname, ".."), path.resolve(__dirname, "..", "source_pdf")];
  for (const dir of roots) {
    const files = await readdir(dir).catch(() => [] as string[]);
    // Pin to the Mexicano sample — other scoresheets may also live alongside it.
    const pdf =
      files.find((f) => /mexicano/i.test(f) && f.toLowerCase().endsWith(".pdf")) ??
      files.find((f) => f.toLowerCase().endsWith(".pdf"));
    if (pdf) return path.join(dir, pdf);
  }
  throw new Error("No sample PDF found in project root or source_pdf/");
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

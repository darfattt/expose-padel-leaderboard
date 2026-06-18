import { detectPointsPerGame } from "./scoring";
import type { ParsedEvent, ParsedMatch, ParsedScoresheet } from "./types";

// A single positioned text fragment from a PDF page.
export interface TextItem {
  str: string;
  x: number;
  y: number;
}
export type PageItems = TextItem[];

const FOOTER_RE = /reclub\.co|Page \d+ of \d+|Powered by Reclub/i;
const ROUND_WORD_RE = /^round$/i;
const INT_RE = /^\d+$/;

function isInt(s: string): boolean {
  return INT_RE.test(s.trim());
}

// One court column of a round block holds, read top-to-bottom:
//   team1 player1, [team1 score], team1 player2, team2 player1, [team2 score], team2 player2
// Names (non-integers) in y-order are the 4 players; integers are the 2 scores.
function parseColumn(
  items: TextItem[]
): { team1: string[]; team1Score: number | null; team2: string[]; team2Score: number | null } {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const names: string[] = [];
  const scores: number[] = [];
  for (const it of sorted) {
    const s = it.str.trim();
    if (!s || ROUND_WORD_RE.test(s)) continue;
    if (isInt(s)) scores.push(parseInt(s, 10));
    else names.push(s.replace(/\s+/g, " "));
  }
  return {
    team1: names.slice(0, 2),
    team1Score: scores[0] ?? null,
    team2: names.slice(2, 4),
    team2Score: scores[1] ?? null,
  };
}

const ROUND_MARGIN_X = 100; // round label/number live left of this; names start ~122

/**
 * Convert positioned text items (one array per page) into a normalized
 * scoresheet. Pure & testable — PDF extraction is done separately.
 */
export function parseItemsToScoresheet(
  pages: PageItems[],
  sourceFilename = ""
): ParsedScoresheet {
  const warnings: string[] = [];
  const matches: ParsedMatch[] = [];
  let headerText = "";
  let round = 0;

  for (let p = 0; p < pages.length; p++) {
    const items = pages[p].filter((i) => i.str.trim() && !FOOTER_RE.test(i.str));

    // Court-header items, grouped into header rows by y (desc = top first).
    const headers = items
      .filter((i) => /court\s*\d/i.test(i.str))
      .sort((a, b) => b.y - a.y);
    const headerRows: TextItem[][] = [];
    for (const h of headers) {
      const last = headerRows[headerRows.length - 1];
      if (last && Math.abs(last[0].y - h.y) <= 4) last.push(h);
      else headerRows.push([h]);
    }

    // Page-1 preamble (above first header) feeds event metadata.
    if (p === 0 && headerRows.length) {
      const topY = headerRows[0][0].y;
      headerText = items
        .filter((i) => i.y > topY + 4)
        .sort((a, b) => b.y - a.y)
        .map((i) => i.str)
        .join(" ");
    }

    for (let b = 0; b < headerRows.length; b++) {
      const yTop = headerRows[b][0].y;
      const yBottom = b + 1 < headerRows.length ? headerRows[b + 1][0].y : -Infinity;
      const c1 = headerRows[b].find((i) => /court\s*1/i.test(i.str));
      const c2 = headerRows[b].find((i) => /court\s*2/i.test(i.str));
      const split = c2 ? c2.x - 18 : c1 ? c1.x + 180 : null;
      if (split == null) {
        warnings.push(`Round block ${round + 1}: could not find court columns.`);
        continue;
      }

      const body = items.filter((i) => i.y < yTop - 1 && i.y > yBottom + 1);
      round += 1;

      const left = body.filter((i) => i.x >= ROUND_MARGIN_X && i.x < split);
      const right = body.filter((i) => i.x >= split);

      pushMatch(matches, warnings, round, 1, parseColumn(left));
      pushMatch(matches, warnings, round, 2, parseColumn(right));
    }
  }

  const event = parseMeta(headerText, sourceFilename, matches, warnings);
  return { event, matches, warnings };
}

function pushMatch(
  matches: ParsedMatch[],
  warnings: string[],
  round: number,
  court: number,
  col: { team1: string[]; team1Score: number | null; team2: string[]; team2Score: number | null }
) {
  if (col.team1.length !== 2 || col.team2.length !== 2) {
    warnings.push(`Round ${round} court ${court}: expected 2 players per team.`);
    return;
  }
  if (col.team1Score == null || col.team2Score == null) {
    warnings.push(`Round ${round} court ${court}: missing a score.`);
    return;
  }
  matches.push({
    round,
    court,
    team1: col.team1,
    team1Score: col.team1Score,
    team2: col.team2,
    team2Score: col.team2Score,
  });
}

function parseMeta(
  headerText: string,
  sourceFilename: string,
  matches: ParsedMatch[],
  warnings: string[]
): ParsedEvent {
  const flat = headerText.replace(/\s+/g, " ").trim();
  const rawTitle = flat.split(/tuesday|monday|wednesday|thursday|friday|saturday|sunday/i)[0].trim() || flat;

  const code = flat.match(/(\d+)\s*H\s*(\d+)\s*C\s*(\d+)\s*P/i);
  const numCourts = code ? parseInt(code[2], 10) : null;
  let numPlayers = code ? parseInt(code[3], 10) : null;

  // title: first human segment after the code, e.g. "Mix Mexicano"
  let title = rawTitle;
  const segs = rawTitle.split("|").map((s) => s.trim()).filter(Boolean);
  if (segs.length >= 2) title = segs[1];
  else if (segs.length) title = segs[0];

  const format = /mexicano/i.test(flat)
    ? "Mexicano"
    : /americano/i.test(flat)
      ? "Americano"
      : null;

  const location = matchLocation(flat);
  const playedOn = matchDate(flat);

  // Cross-check declared player count against parsed roster.
  const roster = new Set<string>();
  for (const m of matches) [...m.team1, ...m.team2].forEach((p) => roster.add(p));
  if (numPlayers && roster.size && roster.size !== numPlayers) {
    warnings.push(`Declared ${numPlayers} players but parsed ${roster.size}.`);
  }
  if (!numPlayers && roster.size) numPlayers = roster.size;

  return {
    title: title || "Padel event",
    rawTitle,
    playedOn,
    location,
    format,
    numCourts,
    numPlayers,
    pointsPerGame: matches.length ? detectPointsPerGame(matches) : null,
    ...(sourceFilename ? {} : {}),
  };
}

function matchLocation(flat: string): string | null {
  // "... at 8:00 AM · Oasis padel"  /  "... at 8:00 AM - Oasis padel"
  const m = flat.match(/[·•∙\-–—]\s*([A-Za-z][\w' ]+?)(?:\s*\||$)/);
  return m ? m[1].trim() : null;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function matchDate(flat: string): string | null {
  // Subtitle like "Tuesday, June 16 at 8:00 AM".
  const m = flat.match(/\b([A-Za-z]+)\s+(\d{1,2})\b/);
  let month = -1;
  let day = -1;
  if (m) {
    const mi = MONTHS.indexOf(m[1].toLowerCase());
    if (mi >= 0) {
      month = mi + 1;
      day = parseInt(m[2], 10);
    }
  }
  // Year from footer-style "dd/mm/yy" if present, else null.
  const y = flat.match(/\b\d{1,2}\/\d{1,2}\/(\d{2})\b/);
  const year = y ? 2000 + parseInt(y[1], 10) : null;
  if (month > 0 && day > 0 && year) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

/**
 * Extract positioned text items from a PDF buffer using pdfjs-dist.
 * Server-only (Node).
 */
export async function extractPdfItems(data: Uint8Array): Promise<PageItems[]> {
  // Legacy build runs on the main thread (no worker) — works in Node/serverless.
  const pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs") = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages: PageItems[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items) {
      if (!("str" in it)) continue;
      const t = it.transform as number[];
      items.push({ str: it.str, x: t[4], y: t[5] });
    }
    pages.push(items);
  }
  await doc.destroy();
  return pages;
}

export async function parseScoresheet(
  data: Uint8Array,
  sourceFilename = ""
): Promise<ParsedScoresheet> {
  const pages = await extractPdfItems(data);
  return parseItemsToScoresheet(pages, sourceFilename);
}

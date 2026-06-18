import { detectPointsPerGame } from "./scoring";
import type { ParsedEvent, ParsedMatch, ParsedScoresheet } from "./types";

// A single positioned text fragment from a PDF page.
export interface TextItem {
  str: string;
  x: number;
  y: number;
  w?: number; // text width (PDF units); used to coalesce split fragments
}
export type PageItems = TextItem[];

const FOOTER_RE = /reclub\.co|Page \d+ of \d+|Powered by Reclub/i;
const ROUND_WORD_RE = /^round$/i;
const INT_RE = /^\d+$/;
// A court header is exactly "COURT n" (anchored), so a venue like "The Court 45"
// sitting in the page-1 preamble is never mistaken for a court column.
const COURT_HEADER_RE = /^court\s*\d+$/i;

// Fragments on the same text line cluster within this y tolerance; fragments
// closer than this x gap belong to one token (a glyph-split name, "COURT" + "1").
// A name and its far-right score, or two adjacent court columns, sit much further
// apart and stay separate.
const ROW_Y_EPS = 3;
const MERGE_GAP_X = 12;

function isInt(s: string): boolean {
  return INT_RE.test(s.trim());
}

function courtNumber(s: string): number | null {
  const m = s.trim().match(/court\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

// Approximate a fragment's rendered width when pdfjs didn't supply one (e.g.
// hand-built test items): rough average glyph advance.
function itemWidth(it: TextItem): number {
  return it.w ?? it.str.length * 6;
}

// pdfjs sometimes emits a single line as many fragments — exploded glyph-by-glyph
// ("S","Y","A",… → "SYAFIK"), a split header ("COURT" + "1"), or word-by-word
// ("Joao" + "Pedro"). Merge horizontally-adjacent fragments on the same row back
// into whole strings so the geometry-based parser sees one token per name/header.
// Items far apart on a row (a name vs its score, court 1 vs court 2) are left
// separate. Pure geometry — safe to run before any parsing.
function coalesceItems(items: TextItem[]): TextItem[] {
  const rows: TextItem[][] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= ROW_Y_EPS) row.push(it);
    else rows.push([it]);
  }

  const out: TextItem[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: { str: string; x: number; y: number; end: number; lastLen: number } | null = null;
    for (const it of row) {
      const end = it.x + itemWidth(it);
      const len = it.str.trim().length;
      if (cur && it.x - cur.end <= MERGE_GAP_X) {
        // No separator when joining two single glyphs (an exploded word like
        // S Y A F I K → SYAFIK); a space otherwise (Joao + Pedro, COURT + 1).
        const sep = cur.lastLen === 1 && len === 1 ? "" : " ";
        cur.str += sep + it.str;
        cur.end = Math.max(cur.end, end);
        cur.lastLen = len;
      } else {
        if (cur) out.push({ str: cur.str, x: cur.x, y: cur.y });
        cur = { str: it.str, x: it.x, y: it.y, end, lastLen: len };
      }
    }
    if (cur) out.push({ str: cur.str, x: cur.x, y: cur.y });
  }
  return out;
}

// One court column of a round block holds, read top-to-bottom:
//   team1 player1, [team1 score], team1 player2, team2 player1, [team2 score], team2 player2
// Names (non-integers) in y-order are the 4 players; integers are the 2 scores.
interface Column {
  team1: string[];
  team1Score: number | null;
  team2: string[];
  team2Score: number | null;
  nameCount: number; // raw counts (pre-slice) so callers can tell an unplayed
  scoreCount: number; // round (names, no scores) from a genuine parse anomaly
}

function parseColumn(items: TextItem[]): Column {
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
    nameCount: names.length,
    scoreCount: scores.length,
  };
}

const ROUND_MARGIN_X = 100; // round label/number live left of this; names start ~122
const COURT_MARGIN_X = 18; // a court column begins this far left of its header x

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
    const items = coalesceItems(
      pages[p].filter((i) => i.str.trim() && !FOOTER_RE.test(i.str))
    );

    // Court-header items, grouped into header rows by y (desc = top first).
    const headers = items
      .filter((i) => COURT_HEADER_RE.test(i.str.trim()))
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
      // Court headers left-to-right. Each court owns a horizontal band from just
      // left of its header to just left of the next court's (the last runs to the
      // page edge), so 1-, 2- or N-court layouts all slice correctly.
      const courts = headerRows[b]
        .filter((i) => COURT_HEADER_RE.test(i.str.trim()))
        .sort((a, b) => a.x - b.x);
      if (!courts.length) {
        warnings.push(`Round block ${round + 1}: could not find court columns.`);
        continue;
      }

      const body = items.filter((i) => i.y < yTop - 1 && i.y > yBottom + 1);
      round += 1;

      for (let j = 0; j < courts.length; j++) {
        const leftBound = j === 0 ? ROUND_MARGIN_X : courts[j].x - COURT_MARGIN_X;
        const rightBound = j + 1 < courts.length ? courts[j + 1].x - COURT_MARGIN_X : Infinity;
        const col = body.filter((i) => i.x >= leftBound && i.x < rightBound);
        pushMatch(matches, warnings, round, courtNumber(courts[j].str) ?? j + 1, parseColumn(col));
      }
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
  col: Column
) {
  // An empty court slot, or a scheduled-but-unplayed round (names listed, no
  // scores yet), is not an error — Reclub sheets print upcoming rounds. Skip it
  // quietly; only a half-filled or malformed block earns a warning.
  if (col.scoreCount === 0) return;
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
      items.push({ str: it.str, x: t[4], y: t[5], w: it.width });
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

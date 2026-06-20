import { preloadIcons } from "@/lib/icons/canvas";
import { collectCardIcons, collectCardPhotos, type CardSpec, renderCard } from "./card";
import { preloadPhotos } from "./photo";

// Generic "share this card" plumbing, lifted from the tournament run card so all
// features share one path: render the spec to a PNG and hand it to the Web Share
// API (best on mobile — it lands straight in the native share sheet for any
// social app). Where files can't be shared, fall back to downloading the card and
// copying the caption to the clipboard. Client-only.

export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "error";

export interface ShareCardOptions {
  text: string; // the plain-text caption that rides along with the image
  title: string; // share-sheet title
  filename: string; // download filename, e.g. "match-night.png"
}

export async function shareCard(spec: CardSpec, opts: ShareCardOptions): Promise<ShareOutcome> {
  // Decode every game-icons glyph and remote photo (player portrait, racket shot)
  // the card draws before the (synchronous) render, so they're cached when
  // renderCard pulls them. Photos load CORS-clean or resolve null (→ sprite/icon
  // fallback), so this never blocks the export.
  await Promise.all([
    preloadIcons(collectCardIcons(spec)),
    preloadPhotos(collectCardPhotos(spec)),
  ]);
  const canvas = renderCard(spec);
  const { text, title, filename } = opts;

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) return "error";
  const file = new File([blob], filename, { type: "image/png" });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title });
      return "shared";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // fall through to download on any other failure
    }
  }

  // Fallback: download the image and copy the caption.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard may be blocked — the image still downloaded */
  }
  return "downloaded";
}

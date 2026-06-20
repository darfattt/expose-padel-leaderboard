import { NextResponse } from "next/server";

// Same-origin image proxy. Pro headshots live on www.padelfip.com, which does
// NOT send Access-Control-Allow-Origin, so loading them with crossOrigin
// "anonymous" fails and the canvas share card falls back to initials. Streaming
// them through our own origin makes them CORS-clean, so renderCard can draw them
// and the PNG still exports. Locked to a host allowlist so this can't be turned
// into an open proxy (SSRF).

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set(["www.padelfip.com", "padelfip.com"]);

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  const upstream = await fetch(target.toString(), { cache: "no-store" });
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Upstream error", { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      // Cache the proxied bytes hard — pro headshots never change.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
}

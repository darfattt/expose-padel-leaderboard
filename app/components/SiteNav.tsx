"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// The site's primary navigation. On desktop it's the inline link row + the two
// CTAs (rendered by the layout); on mobile those collapse behind a hamburger that
// drops a full-width panel — so the menu, hidden on small screens before, is now
// reachable. Client component (needs the open/closed toggle + route awareness).

export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Leaderboard" },
  { href: "/trends", label: "Trends" },
  { href: "/matrix", label: "Matrix" },
  { href: "/scatter", label: "Scatter" },
  { href: "/versus", label: "Versus" },
  { href: "/tournament", label: "Tournament" },
  { href: "/rackets", label: "Rackets" },
  { href: "/events", label: "Events" },
  { href: "/how-it-works", label: "How it works" },
];

// Desktop link row — hidden below sm (the mobile menu takes over there).
export function DesktopNav() {
  return (
    <nav className="hidden md:flex items-center gap-7 text-sm text-body-muted">
      {NAV_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="hover:text-ink">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

// The hamburger + slide-down panel, shown only below md.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the panel whenever the route changes (a link was tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-hairline text-ink"
      >
        {/* simple hamburger / close glyph */}
        <span className="text-lg leading-none">{open ? "✕" : "☰"}</span>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 border-b border-hairline bg-canvas shadow-sm">
          <nav className="flex flex-col px-6 py-3">
            {NAV_LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`border-b border-hairline/60 py-3 text-base ${
                    active ? "font-medium text-ink" : "text-body-muted"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
            <div className="flex flex-col gap-2 py-4">
              <Link href="/tournament" className="btn-accent w-full">
                Enter tournament
              </Link>
              <Link href="/upload" className="btn-primary w-full">
                Upload scoresheet
              </Link>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// The site's primary navigation. On desktop it's the inline link row + the two
// CTAs (rendered by the layout); on mobile those collapse behind a hamburger that
// drops a full-width panel — so the menu, hidden on small screens before, is now
// reachable. Client component (needs the open/closed toggle + route awareness).
//
// Trends / Matrix / Scatter are grouped under a single "Analysis" item: a hover/
// click dropdown on desktop, an indented section in the mobile panel.

type NavLink = { href: string; label: string };
type NavGroup = { label: string; children: NavLink[] };
type NavItem = NavLink | NavGroup;

function isGroup(item: NavItem): item is NavGroup {
  return "children" in item;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Leaderboard" },
  { href: "/versus", label: "Versus" },
  { href: "/tournament", label: "Tournament" },
  { href: "/rackets", label: "Rackets" },
  {
    label: "Analysis",
    children: [
      { href: "/power-rankings", label: "Power Rankings" },
      { href: "/trends", label: "Trends" },
      { href: "/matrix", label: "Matrix" },
      { href: "/scatter", label: "Scatter" },
    ],
  },
  { href: "/events", label: "Events" },
  { href: "/how-it-works", label: "How it works" },
];

// Desktop link row — hidden below md (the mobile menu takes over there).
export function DesktopNav() {
  return (
    <nav className="hidden md:flex items-center gap-7 text-sm text-body-muted">
      {NAV_ITEMS.map((item) =>
        isGroup(item) ? (
          <NavDropdown key={item.label} group={item} />
        ) : (
          <Link key={item.href} href={item.href} className="hover:text-ink">
            {item.label}
          </Link>
        )
      )}
    </nav>
  );
}

// A desktop dropdown for a grouped nav item. Opens on hover *and* click (the
// click toggle keeps it keyboard/tap friendly); closes on outside click or a
// route change. The panel sits flush under the trigger so hovering across into
// it never crosses a dead gap.
function NavDropdown({ group }: { group: NavGroup }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = group.children.some((c) => c.href === pathname);

  // Close when the route changes (a child link was followed).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on a click outside the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1 hover:text-ink ${active ? "text-ink" : ""}`}
      >
        {group.label}
        <span aria-hidden className="text-[10px] leading-none">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 min-w-[11rem] rounded-sm border border-hairline bg-canvas py-1 shadow-sm"
        >
          {group.children.map((c) => {
            const isActive = pathname === c.href;
            return (
              <Link
                key={c.href}
                href={c.href}
                role="menuitem"
                className={`block px-4 py-2 text-sm hover:bg-hairline/30 ${
                  isActive ? "font-medium text-ink" : "text-body-muted"
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
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
            {NAV_ITEMS.map((item) =>
              isGroup(item) ? (
                <div key={item.label} className="border-b border-hairline/60 py-3">
                  <p className="mono-label mb-2">{item.label}</p>
                  <div className="flex flex-col pl-3">
                    {item.children.map((c) => {
                      const active = pathname === c.href;
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={`py-2 text-base ${active ? "font-medium text-ink" : "text-body-muted"}`}
                        >
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`border-b border-hairline/60 py-3 text-base ${
                    pathname === item.href ? "font-medium text-ink" : "text-body-muted"
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
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

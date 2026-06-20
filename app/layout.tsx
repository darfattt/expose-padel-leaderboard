import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";
import { DesktopNav, MobileNav } from "./components/SiteNav";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Padel Leaderboard",
    template: "%s · Padel Leaderboard",
  },
  description: "Upload a Reclub scoresheet, get a live padel leaderboard, player profiles, and AI Player Reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans bg-canvas text-ink min-h-screen flex flex-col">
        {/* announcement-bar */}
        <div className="flex h-9 items-center justify-center bg-cohere-black text-white text-[12px]">
          <span className="opacity-90"></span>
        </div>

        {/* 3-zone nav (relative so the mobile menu panel can anchor to it) */}
        <header className="relative flex items-center justify-between gap-4 px-6 py-4 border-b border-hairline">
          <Link href="/" className="font-display text-lg tracking-tight">
            expose<span className="text-coral">.padel-leaderboard</span>
          </Link>
          <DesktopNav />
          {/* Desktop CTAs — Enter tournament gets a featured coral pill, spotlighted
              alongside the near-black Upload scoresheet. */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/tournament" className="btn-accent">Enter tournament</Link>
            <Link href="/upload" className="btn-primary">Upload scoresheet</Link>
          </div>
          <MobileNav />
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-section">{children}</main>

        <footer className="border-t border-hairline px-6 py-8 text-sm text-muted">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between gap-2">
            <span>Parsed from Reclub scoresheets. Stats are computed automatically.</span>
            <span className="font-mono uppercase tracking-mono-label text-xs">expose.padelleaderboard</span>
          </div>
          <div className="max-w-6xl mx-auto mt-2 text-xs text-muted">
            Badge, level &amp; award icons by{" "}
            <a href="https://game-icons.net" className="underline hover:text-ink" rel="noreferrer">
              game-icons.net
            </a>{" "}
            (CC BY 3.0).
          </div>
        </footer>
      </body>
    </html>
  );
}

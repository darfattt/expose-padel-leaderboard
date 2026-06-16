import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

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
  title: "expose.padelleaderboard",
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

        {/* 3-zone nav */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <Link href="/" className="font-display text-lg tracking-tight">
            expose<span className="text-coral">.padel-leaderboard</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-8 text-sm text-body-muted">
            <Link href="/" className="hover:text-ink">Leaderboard</Link>
            <Link href="/events" className="hover:text-ink">Events</Link>
            <Link href="/scatter" className="hover:text-ink">Scatter analysis</Link>
            <Link href="/upload" className="hover:text-ink">Upload</Link>
          </nav>
          <Link href="/upload" className="btn-primary">Upload scoresheet</Link>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-section">{children}</main>

        <footer className="border-t border-hairline px-6 py-8 text-sm text-muted">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between gap-2">
            <span>Parsed from Reclub scoresheets. Stats are computed automatically.</span>
            <span className="font-mono uppercase tracking-mono-label text-xs">expose.padelleaderboard</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

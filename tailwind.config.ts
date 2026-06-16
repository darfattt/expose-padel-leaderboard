import type { Config } from "tailwindcss";

// Tokens lifted from DESIGN.md (Cohere design system).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#17171c",
        "cohere-black": "#000000",
        ink: "#212121",
        "deep-green": "#003c33",
        "dark-navy": "#071829",
        canvas: "#ffffff",
        "soft-stone": "#eeece7",
        "pale-green": "#edfce9",
        "pale-blue": "#f1f5ff",
        hairline: "#d9d9dd",
        "border-light": "#e5e7eb",
        "card-border": "#f2f2f2",
        muted: "#93939f",
        slate: "#75758a",
        "body-muted": "#616161",
        "action-blue": "#1863dc",
        "focus-blue": "#4c6ee6",
        coral: "#ff7759",
        "coral-soft": "#ffad9b",
      },
      fontFamily: {
        display: ["var(--font-display)", "Space Grotesk", "Inter", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sans)", "Inter", "Arial", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "22px",
        xl: "30px",
        pill: "32px",
      },
      spacing: {
        section: "80px",
      },
      letterSpacing: {
        tightest: "-1.92px",
        "mono-label": "0.28px",
      },
    },
  },
  plugins: [],
};

export default config;

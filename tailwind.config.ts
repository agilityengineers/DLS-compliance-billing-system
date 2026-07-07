import type { Config } from "tailwindcss";

// "Duet" theme — exact tokens from the design handoff (docs/design/HANDOFF-README.md).
// Plum sidebar/headings, sage CTAs, cream background, Source Serif 4 + IBM Plex Sans.
const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#F7F5F1", // cream page background
        foreground: "#2B2438", // ink
        card: { DEFAULT: "#FFFFFF", foreground: "#2B2438" },
        border: "#E7E3DB",
        // Sage — primary buttons / CTAs (white text)
        primary: { DEFAULT: "#5F7161", foreground: "#FFFFFF" },
        // Plum — sidebar, headings, accents
        plum: {
          DEFAULT: "#4A3D63",
          accent: "#6B5A86",
          soft: "#EFEAF5",
          text: "#CFC7E0" // sidebar text
        },
        muted: { DEFAULT: "#EDEBE5", foreground: "#716B80" },
        // Clock-out red
        destructive: { DEFAULT: "#A94438", foreground: "#FFFFFF" },
        // Status pills — bg / fg pairs
        pill: {
          success: "#E7F0E4",
          "success-fg": "#39543A",
          warning: "#F5EBD8",
          "warning-fg": "#7A5C22",
          danger: "#F6E3E0",
          "danger-fg": "#8C3A2F",
          neutral: "#EDEBE5",
          "neutral-fg": "#6B665C"
        }
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ['"Source Serif 4"', "Georgia", "serif"]
      },
      borderRadius: {
        lg: "0.5rem",
        md: "0.375rem",
        sm: "0.25rem",
        card: "12px", // desktop cards
        "card-m": "14px", // mobile cards
        btn: "10px",
        pill: "99px"
      },
      minHeight: { touch: "44px" },
      minWidth: { touch: "44px" }
    }
  },
  plugins: []
};
export default config;

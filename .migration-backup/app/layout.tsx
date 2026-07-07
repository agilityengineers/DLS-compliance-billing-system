// app/layout.tsx
import type { Metadata, Viewport } from "next";
// Self-hosted fonts (no runtime Google Fonts request — HIPAA-friendly, offline-safe)
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "DLS-CMS",
  description: "Durable Life Skills — Care Management System",
  manifest: "/manifest.json"
};

export const viewport: Viewport = {
  themeColor: "#4A3D63", // Duet plum
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

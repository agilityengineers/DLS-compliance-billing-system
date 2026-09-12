import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const src = path.resolve(import.meta.dirname, "src");

export default defineConfig({
  base: basePath,
  // The imported Next.js code reads runtime config from `process.env`, which
  // does not exist in the browser. This client-only demo build resolves those
  // reads statically: NEXT_PUBLIC_* demo values, and an empty object fallback
  // for every other key (→ undefined, which each call site already handles).
  define: {
    "process.env.NEXT_PUBLIC_DEMO_MODE": JSON.stringify("true"),
    // Sign-in mode: "api" (real accounts via the API server) or "demo" (role picker).
    "process.env.NEXT_PUBLIC_AUTH_MODE": JSON.stringify(process.env.VITE_AUTH_MODE ?? "api"),
    "process.env.NEXT_PUBLIC_EVV_GEOFENCE_RADIUS_M": JSON.stringify("150"),
    "process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES": JSON.stringify("20"),
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV === "production" ? "production" : "development",
    ),
    "process.env": "{}",
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      // Next.js runtime shims
      "server-only": path.resolve(src, "shims/empty.ts"),
      "next/navigation": path.resolve(src, "shims/next-navigation.tsx"),
      "next/link": path.resolve(src, "shims/next-link.tsx"),
      "next/image": path.resolve(src, "shims/next-image.tsx"),
      "next/headers": path.resolve(src, "shims/next-headers.ts"),
      "next/cache": path.resolve(src, "shims/next-cache.ts"),
      // Server-only SDKs never exercised in the client demo build
      "@sendgrid/mail": path.resolve(src, "shims/empty.ts"),
      "@aws-sdk/client-s3": path.resolve(src, "shims/empty.ts"),
      "@aws-sdk/s3-request-presigner": path.resolve(src, "shims/empty.ts"),
      "@supabase/ssr": path.resolve(src, "shims/empty.ts"),
      "@supabase/supabase-js": path.resolve(src, "shims/empty.ts"),
      "@": src,
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: false,
    },
    // Local development outside Replit: forward /api to the API server. On
    // Replit the ingress already routes /api to the api-server artifact.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:8080",
        changeOrigin: false,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

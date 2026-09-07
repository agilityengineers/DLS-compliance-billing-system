import { createRoot } from "react-dom/client";
// Self-hosted fonts (no runtime Google Fonts request — HIPAA-friendly, offline-safe)
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import App from "./App";
import "./index.css";
import { isRedirectError } from "./shims/redirect-error";

// Swallow redirect "errors" thrown by the next/navigation shim when a client
// action call site doesn't await/catch them — the navigation is already
// scheduled, so the rejection is expected control flow, not a real error.
window.addEventListener("unhandledrejection", (event) => {
  if (isRedirectError(event.reason)) event.preventDefault();
});

createRoot(document.getElementById("root")!).render(<App />);

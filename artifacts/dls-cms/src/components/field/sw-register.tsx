// components/field/sw-register.tsx — registers public/sw.js (field shell only)
"use client";

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) =>
        console.error("[sw] registration failed", e)
      );
    }
  }, []);
  return null;
}

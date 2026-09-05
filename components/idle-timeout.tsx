// components/idle-timeout.tsx — lost-device protocol, stage 1 (see
// PRODUCTION-READINESS.md §3): sign out after N idle minutes. On the field
// shell the local encrypted store and the service-worker caches are wiped
// FIRST, so a phone that times out holds no PHI — the same guarantee as the
// explicit Sign-out button. PIN/biometric lock + remote wipe remain required
// before any real-PHI pilot.
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// A blank, zero, or unparsable setting falls back to the default instead of
// silently disabling the timeout.
const parsed = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES);
const IDLE_MINUTES = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;

export function IdleTimeout({ wipe = false }: { wipe?: boolean }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        if (wipe) {
          const { wipeLocalData } = await import("@/lib/offline/wipe");
          await wipeLocalData();
        }
        router.push("/logout?reason=idle");
      }, IDLE_MINUTES * 60_000);
    };

    const events: string[] = ["pointerdown", "keydown", "scroll", "touchstart", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [router, wipe]);

  return null;
}

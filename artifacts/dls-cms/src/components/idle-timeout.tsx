// components/idle-timeout.tsx — lost-device protocol, stage 1 (see
// PRODUCTION-READINESS.md §3): sign out after N idle minutes. PIN/biometric
// lock + remote wipe are required before any real-PHI pilot.
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const parsed = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES);
const IDLE_MINUTES = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;

export function IdleTimeout({ wipe = false }: { wipe?: boolean }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

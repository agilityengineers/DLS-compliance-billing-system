// components/idle-timeout.tsx — lost-device protocol, stage 1 (see
// PRODUCTION-READINESS.md §3): sign out after N idle minutes. PIN/biometric
// lock + remote wipe are required before any real-PHI pilot.
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const IDLE_MINUTES = Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES ?? 20);

export function IdleTimeout() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!IDLE_MINUTES || IDLE_MINUTES <= 0) return;

    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
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
  }, [router]);

  return null;
}

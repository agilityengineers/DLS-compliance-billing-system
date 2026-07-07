// components/field/sign-out-button.tsx — wipes local encrypted data BEFORE
// ending the session (lost-device protocol stage 1).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { wipeLocalData } from "@/lib/offline/wipe";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="touch"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await wipeLocalData();
        window.location.href = "/logout";
      }}
    >
      {busy ? "Clearing device…" : "Sign out"}
    </Button>
  );
}

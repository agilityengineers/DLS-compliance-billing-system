// components/admin/one-time-password.tsx — shows a freshly issued temporary
// password ONCE, with a copy button. It is never stored or shown again.
"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function OneTimePassword({ email, password, onDismiss }: { email: string; password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-card border border-pill-success-fg/30 bg-pill-success p-4 text-sm text-pill-success-fg" role="status">
      <p className="font-medium">Temporary password for {email}</p>
      <div className="flex items-center gap-2">
        <code className="rounded-btn bg-white px-3 py-1.5 font-mono text-base tracking-wider text-foreground">{password}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              /* clipboard blocked — the value is visible to copy by hand */
            }
          }}
          className="inline-flex items-center gap-1 rounded-btn border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs">
        Share it privately. It is shown only now; the person chooses their own password at first sign-in.
      </p>
      <button type="button" onClick={onDismiss} className="text-xs underline">Done</button>
    </div>
  );
}

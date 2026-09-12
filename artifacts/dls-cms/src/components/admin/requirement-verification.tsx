// components/admin/requirement-verification.tsx — the provenance control.
//
// Shows what rule a requirement rests on and how far that rule has actually
// been checked, and lets an admin record a sign-off. The sign-off is a claim
// about the world, so it needs a sentence saying what was checked — the action
// refuses an empty one.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { confirmRequirement } from "@/app/admin/requirements/actions";
import type { VerificationStatus } from "@workspace/credentialing";

const LABEL: Record<VerificationStatus, { text: string; variant: "success" | "warning" | "muted" | "destructive" }> = {
  confirmed: { text: "Verified", variant: "success" },
  reported: { text: "Needs review", variant: "warning" },
  agency_policy: { text: "Agency policy", variant: "muted" },
  unverified: { text: "Unverified", variant: "destructive" }
};

export function RequirementVerification({
  requirementId, status, citation, citationUrl, note, verifiedOn, verifiedBy
}: {
  requirementId: string;
  status: VerificationStatus;
  citation: string | null;
  citationUrl: string | null;
  note: string | null;
  verifiedOn: string | null;
  verifiedBy: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const badge = LABEL[status];

  return (
    <div className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={badge.variant}>{badge.text}</Badge>
        {citation ? (
          citationUrl ? (
            <a
              className="text-xs underline decoration-dotted underline-offset-2 text-muted-foreground hover:text-foreground"
              href={citationUrl}
              target="_blank"
              rel="noreferrer"
            >
              {citation}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">{citation}</span>
          )
        ) : (
          <span className="text-xs text-muted-foreground">No citation on file</span>
        )}
        {status === "confirmed" && verifiedBy && (
          <span className="text-xs text-muted-foreground">
            &mdash; checked by {verifiedBy}{verifiedOn ? ` on ${verifiedOn}` : ""}
          </span>
        )}
      </div>

      {note && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}

      {status !== "confirmed" && !open && (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Mark verified&hellip;
        </Button>
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Input
            className="h-9 w-80"
            placeholder="What did you check, and against what? (required)"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            size="sm"
            disabled={pending || !text.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await confirmRequirement({ requirementId, note: text.trim() });
                if (!res.ok) setError(res.error ?? "Could not record the sign-off.");
                else {
                  setOpen(false);
                  setText("");
                  router.refresh();
                }
              })
            }
          >
            {pending ? "…" : "Record sign-off"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>
            Cancel
          </Button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
      )}
    </div>
  );
}

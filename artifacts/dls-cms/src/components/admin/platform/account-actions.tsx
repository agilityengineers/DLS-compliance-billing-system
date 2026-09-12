// components/admin/platform/account-actions.tsx — the provider's per-account
// controls, shared by the Organizations and Accounts screens so both offer
// exactly the same things: an audited "view as", a one-time password reset,
// sign-out-everywhere (lost device, off-boarding) and suspend/activate.
// The API re-checks the hierarchy on every call; this only hides what the
// provider can never do (manage itself or another provider account).
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformApi, type AccountRow } from "@/lib/api/admin";
import { errorMessage } from "@/lib/api/client";
import { startImpersonation } from "@/lib/auth/impersonation";
import { Button } from "@/components/ui/button";

export function AccountRowActions({
  user,
  selfId,
  onChanged,
  onIssued,
  showSignOut = false,
}: {
  user: AccountRow;
  selfId: string;
  /** Called after any successful change so the parent can reload. */
  onChanged: () => void | Promise<void>;
  /** Called with a freshly issued one-time password (shown once by the parent). */
  onIssued: (email: string, password: string) => void;
  showSignOut?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const manageable = user.role !== "Super_Admin" && user.id !== selfId;
  if (!manageable) return <span className="text-xs text-muted-foreground">{user.id === selfId ? "you" : "provider account"}</span>;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {user.status === "Active" && (
        <Button
          size="sm"
          variant="plum"
          disabled={busy === "view"}
          title="Open the app exactly as this person sees it. Every action is logged under your identity."
          onClick={() =>
            void run("view", async () => {
              const res = await startImpersonation(user.id);
              if (!res.ok) throw new Error(res.error ?? "Could not start the support session.");
              router.push("/");
              router.refresh();
            })
          }
        >
          View as
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={busy === "reset"}
        title="Issue a one-time password and sign the person out everywhere."
        onClick={() =>
          void run("reset", async () => {
            const r = await platformApi.resetPassword(user.id);
            if (r.temporaryPassword) onIssued(user.email, r.temporaryPassword);
          })
        }
      >
        Reset password
      </Button>
      {showSignOut && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy === "signout"}
          title="End every session this person has, on every device. They keep their password."
          onClick={() =>
            void run("signout", async () => {
              const r = await platformApi.revokeUserSessions(user.id);
              setNotice(r.revoked === 0 ? "No active sessions." : `${r.revoked} session${r.revoked === 1 ? "" : "s"} ended.`);
            })
          }
        >
          Sign out everywhere
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy === "status"}
        onClick={() =>
          void run("status", async () => {
            await platformApi.updateUser(user.id, { status: user.status === "Active" ? "Suspended" : "Active" });
          })
        }
      >
        {user.status === "Active" ? "Suspend" : "Activate"}
      </Button>
      {error && <p className="w-full text-right text-xs text-destructive" role="alert">{error}</p>}
      {notice && <p className="w-full text-right text-xs text-muted-foreground" role="status">{notice}</p>}
    </div>
  );
}

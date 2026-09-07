// components/admin/user-admin-panel.tsx — per-row user actions + add-user form.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addUser, setUserRole, setUserStatus } from "@/app/admin/settings/actions";

export function UserAdminPanel({
  user,
  isSelf
}: {
  user: { id: string; name: string; role: string; status: string };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (isSelf) return <span className="text-xs text-muted-foreground">you</span>;

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        className="h-9 rounded-btn border border-border bg-card px-2 text-sm"
        value={user.role}
        disabled={pending}
        onChange={(e) =>
          startTransition(async () => {
            const res = await setUserRole(user.id, e.target.value as "Admin" | "Scheduler" | "Field_Staff");
            if (!res.ok) setError(res.error ?? "Failed");
            else router.refresh();
          })
        }
        aria-label={`Role for ${user.name}`}
      >
        <option value="Admin">Admin</option>
        <option value="Scheduler">Scheduler</option>
        <option value="Field_Staff">Field Staff</option>
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setUserStatus(user.id, user.status === "Active" ? "Suspended" : "Active");
            if (!res.ok) setError(res.error ?? "Failed");
            else router.refresh();
          })
        }
      >
        {user.status === "Active" ? "Suspend" : "Activate"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function AddUserForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Field_Staff");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <details className="rounded-card border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Add user</summary>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <select
            className="h-10 w-full rounded-btn border border-border bg-card px-3 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="Field_Staff">Field Staff</option>
            <option value="Scheduler">Scheduler</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-destructive" role="alert">{error}</p>}
      {ok && <p className="mt-3 rounded-btn bg-pill-success px-3 py-2 text-sm text-pill-success-fg">User added.</p>}
      <Button
        className="mt-4"
        disabled={pending || !fullName || !email}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            setOk(false);
            const res = await addUser({ full_name: fullName, email, role });
            if (!res.ok) setError(res.error ?? "Failed");
            else {
              setOk(true);
              setFullName("");
              setEmail("");
              router.refresh();
            }
          })
        }
      >
        {pending ? "Adding…" : "Add user"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Sign-in: Google (same email) or email/password via Supabase Auth invite. In demo mode the
        user can sign in from the demo picker immediately.
      </p>
    </details>
  );
}

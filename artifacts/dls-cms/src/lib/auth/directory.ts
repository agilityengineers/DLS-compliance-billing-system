// lib/auth/directory.ts — the real accounts in the signed-in user's
// organization, fetched once per session/revalidation and merged into the
// staff list by the repo layer (so real employees show up next to the
// synthetic demo staff until the domain data moves to the database too).
import "server-only";
import { isApiAuth } from "@/lib/auth/mode";
import { apiFetch } from "@/lib/api/client";
import { getSessionContext } from "@/lib/auth/session";
import { subscribeRevalidate } from "@/shims/nav-bridge";
import type { Role, StaffUser } from "@/lib/supabase/types";

interface DirectoryUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: "Active" | "Suspended";
  lastLoginAt: string | null;
}

let cached: Promise<StaffUser[]> | null = null;
subscribeRevalidate(() => {
  cached = null;
});

export function invalidateDirectory(): void {
  cached = null;
}

export function listAccountDirectory(): Promise<StaffUser[]> {
  if (!isApiAuth()) return Promise.resolve([]);
  if (!cached) {
    cached = (async () => {
      const ctx = await getSessionContext();
      if (!ctx.realUser || !ctx.effectiveUser?.org_id) return [];
      try {
        const res = await apiFetch<{ users: DirectoryUser[] }>("/org/directory");
        return res.users.map<StaffUser>((u) => ({
          id: u.id,
          email: u.email,
          full_name: u.fullName,
          role: u.role,
          status: u.status,
          license_number: null,
          license_expiration_date: null,
          training_completed: [],
          org_id: ctx.effectiveUser!.org_id,
          is_account: true,
        }));
      } catch {
        return [];
      }
    })().catch(() => {
      cached = null;
      return [];
    });
  }
  return cached;
}

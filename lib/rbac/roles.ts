// lib/rbac/roles.ts — role checks shared by server actions, routes, and UI
import type { Role } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";

export const ROLES: Role[] = ["Admin", "Scheduler", "Field_Staff"];

/** RBAC matrix mirror of supabase/policies/*.sql — used for UI gating only.
 *  The database RLS policies are the source of truth for enforcement. */
export const CAN = {
  Admin: { billingExport: true, manualEvvAdjustment: true, manageStaff: true, schedule: true },
  Scheduler: { billingExport: false, manualEvvAdjustment: false, manageStaff: false, schedule: true },
  Field_Staff: { billingExport: false, manualEvvAdjustment: false, manageStaff: false, schedule: false }
} as const satisfies Record<Role, Record<string, boolean>>;

/** Resolve the current user's role server-side. Throws if unauthenticated. */
export async function requireRole(...allowed: Role[]): Promise<{ userId: string; role: Role }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  const { data: profile } = await supabase
    .from("users").select("role,status").eq("id", user.id).single();
  if (!profile || profile.status !== "Active") throw new Error("FORBIDDEN");
  const role = profile.role as Role;
  if (allowed.length > 0 && !allowed.includes(role)) throw new Error("FORBIDDEN");
  return { userId: user.id, role };
}

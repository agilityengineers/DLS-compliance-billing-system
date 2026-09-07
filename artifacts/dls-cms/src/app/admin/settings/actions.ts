// app/admin/settings/actions.ts — user CRUD + menu configuration (Admin-only).
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createUser as repoCreateUser, updateUser } from "@/lib/data/repo-core";
import { setMenuConfig } from "@/lib/data/repo-business";

const NewUserSchema = z.object({
  full_name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["Admin", "Scheduler", "Field_Staff"])
});

export async function addUser(input: unknown) {
  const ctx = await requireRole("Admin");
  const parsed = NewUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const res = await repoCreateUser(parsed.data, ctx.auditCtx);
  revalidatePath("/admin/settings");
  return res;
}

export async function setUserStatus(userId: string, status: "Active" | "Suspended") {
  const ctx = await requireRole("Admin");
  if (userId === ctx.realUser!.id) return { ok: false as const, error: "You cannot suspend your own account." };
  const res = await updateUser(userId, { status }, ctx.auditCtx);
  revalidatePath("/admin/settings");
  return res;
}

export async function setUserRole(userId: string, role: "Admin" | "Scheduler" | "Field_Staff") {
  const ctx = await requireRole("Admin");
  if (userId === ctx.realUser!.id) return { ok: false as const, error: "You cannot change your own role." };
  const res = await updateUser(userId, { role }, ctx.auditCtx);
  revalidatePath("/admin/settings");
  return res;
}

const MenuSchema = z.object({
  role: z.enum(["Scheduler", "Field_Staff"]),
  sections: z.record(z.boolean())
});

export async function saveMenuConfig(input: unknown) {
  const ctx = await requireRole("Admin");
  const parsed = MenuSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid menu configuration" };
  // SYSTEM (Settings) can never be enabled for non-admins; Billing/Payroll/
  // Staff item-level locks are enforced in nav-config regardless of sections.
  const sections = { ...parsed.data.sections, SYSTEM: false };
  const res = await setMenuConfig(parsed.data.role, sections, ctx.auditCtx);
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  return res;
}

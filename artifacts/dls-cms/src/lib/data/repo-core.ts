// lib/data/repo-core.ts — users, clients, physician orders, visits, schedule.
// Every function branches: demo store (in-memory, rule-enforcing) vs Supabase
// (RLS + DB triggers enforce the same rules). UI never touches either directly.
import "server-only";

import { isDemoMode } from "@/lib/demo/mode";
import { getDemoStore, type AuditContext } from "@/lib/data/demo/store";
import { createDataClient } from "@/lib/supabase/server";
import type {
  Client, PhysicianOrder, RecurringVisitTemplate, Role, StaffUser, TrainingRecord,
  Visit, VisitStatus, VisitType, VisitWithNames
} from "@/lib/supabase/types";

function age(dob: string): number {
  const b = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

/** Postgres `point` arrives as {x,y} — normalize to {lat,lng}. */
export function normalizeGps(p: unknown): { lat: number; lng: number } | null {
  if (!p || typeof p !== "object") return null;
  const o = p as { lat?: number; lng?: number; x?: number; y?: number };
  const lat = o.lat ?? o.x;
  const lng = o.lng ?? o.y;
  return lat != null && lng != null ? { lat, lng } : null;
}

function mapClientRow(row: Record<string, unknown>): Client {
  return { ...(row as unknown as Client), residence_gps: normalizeGps(row.residence_gps) };
}

// ═══ users ═══════════════════════════════════════════════════════════════

export async function listUsers(): Promise<StaffUser[]> {
  if (isDemoMode()) return [...getDemoStore().data.users];
  const { data, error } = await createDataClient().from("users").select("*").order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffUser[];
}

export async function getUser(id: string): Promise<StaffUser | null> {
  if (isDemoMode()) return getDemoStore().data.users.find((u) => u.id === id) ?? null;
  const { data } = await createDataClient().from("users").select("*").eq("id", id).maybeSingle();
  return (data as StaffUser) ?? null;
}

export async function listFieldStaff(): Promise<StaffUser[]> {
  const users = await listUsers();
  return users.filter((u) => u.role === "Field_Staff" && u.status === "Active");
}

export async function createUser(
  input: { email: string; full_name: string; role: Role },
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    if (store.data.users.some((u) => u.email === input.email)) {
      return { ok: false, error: "A user with that email already exists." };
    }
    const user: StaffUser = {
      id: crypto.randomUUID(), email: input.email, full_name: input.full_name,
      role: input.role, status: "Active",
      license_number: null, license_expiration_date: null, training_completed: []
    };
    store.data.users.push(user);
    store.audit("users", "INSERT", user.id, null, { ...user }, ctx);
    return { ok: true };
  }
  // Real mode: the auth account must exist first (invite via Supabase Auth);
  // this inserts the app profile for an existing auth user by email.
  const { error } = await createDataClient().from("users").insert({
    email: input.email, full_name: input.full_name, role: input.role, status: "Active"
  });
  if (error) return { ok: false, error: `${error.message} — in real mode, invite the user via Supabase Auth first.` };
  return { ok: true };
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<StaffUser, "full_name" | "role" | "status" | "license_number" | "license_expiration_date" | "training_completed">>,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const user = store.data.users.find((u) => u.id === id);
    if (!user) return { ok: false, error: "User not found." };
    const old = { ...user };
    Object.assign(user, patch);
    store.audit("users", "UPDATE", id, old, { ...user }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient().from("users").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Staff & credentials → "Record renewal": replaces/extends a credential. */
export async function recordCredentialRenewal(
  userId: string,
  renewal: { kind: "license"; expiration_date: string } | { kind: "training"; record: TrainingRecord },
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  const user = await getUser(userId);
  if (!user) return { ok: false, error: "User not found." };
  if (renewal.kind === "license") {
    return updateUser(userId, { license_expiration_date: renewal.expiration_date }, ctx);
  }
  const training = [
    ...user.training_completed.filter((t) => t.course !== renewal.record.course),
    renewal.record
  ];
  return updateUser(userId, { training_completed: training }, ctx);
}

// ═══ clients ═════════════════════════════════════════════════════════════

export async function listClients(search?: string): Promise<Client[]> {
  if (isDemoMode()) {
    let rows = getDemoStore().data.clients.map((c) => ({ ...c, calculated_age: age(c.date_of_birth) }));
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((c) =>
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        c.medicaid_id.toLowerCase().includes(q)
      );
    }
    return rows.sort((a, b) => a.last_name.localeCompare(b.last_name));
  }
  let query = createDataClient().from("v_clients").select("*").order("last_name").limit(200);
  if (search) {
    query = query.or(`last_name.ilike.%${search}%,first_name.ilike.%${search}%,medicaid_id.ilike.%${search}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapClientRow);
}

export async function getClient(id: string): Promise<Client | null> {
  if (isDemoMode()) {
    const c = getDemoStore().data.clients.find((x) => x.id === id);
    return c ? { ...c, calculated_age: age(c.date_of_birth) } : null;
  }
  const { data } = await createDataClient().from("v_clients").select("*").eq("id", id).maybeSingle();
  return data ? mapClientRow(data) : null;
}

export async function createClientRecord(
  input: Omit<Client, "id" | "calculated_age">,
  ctx: AuditContext
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const client: Client = { ...input, id: crypto.randomUUID() };
    store.data.clients.push(client);
    store.audit("clients", "INSERT", client.id, null, { ...client }, ctx);
    return { ok: true, id: client.id };
  }
  const { residence_gps, ...rest } = input;
  const { data, error } = await createDataClient()
    .from("clients")
    .insert({ ...rest, residence_gps: residence_gps ? `(${residence_gps.lat},${residence_gps.lng})` : null })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}

// ═══ physician orders ═════════════════════════════════════════════════════

export async function listPhysicianOrders(clientId?: string): Promise<PhysicianOrder[]> {
  if (isDemoMode()) {
    const all = getDemoStore().data.physicianOrders;
    return clientId ? all.filter((o) => o.client_id === clientId) : [...all];
  }
  let q = createDataClient().from("physician_orders").select("*").order("effective_date", { ascending: false });
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PhysicianOrder[];
}

/** The order that makes a visit on `date` legal for this client, if any. */
export async function activeOrderForClient(clientId: string, date: string): Promise<PhysicianOrder | null> {
  const orders = await listPhysicianOrders(clientId);
  return (
    orders.find(
      (o) => o.effective_date <= date && (!o.expiration_date || o.expiration_date >= date)
    ) ?? null
  );
}

export async function createPhysicianOrder(
  input: Omit<PhysicianOrder, "id">,
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const order: PhysicianOrder = { ...input, id: crypto.randomUUID() };
    store.data.physicianOrders.push(order);
    store.audit("physician_orders", "INSERT", order.id, null, { ...order }, ctx);
    return { ok: true };
  }
  const { error } = await createDataClient().from("physician_orders").insert(input);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ visits ═══════════════════════════════════════════════════════════════

export interface VisitFilter {
  staffId?: string;
  clientId?: string;
  from?: string; // inclusive ISO date
  to?: string;   // inclusive ISO date
  excludeCancelled?: boolean;
}

export async function listVisits(filter: VisitFilter = {}): Promise<VisitWithNames[]> {
  if (isDemoMode()) {
    const { visits, clients, users } = getDemoStore().data;
    return visits
      .filter((v) => {
        if (filter.staffId && v.staff_id !== filter.staffId) return false;
        if (filter.clientId && v.client_id !== filter.clientId) return false;
        if (filter.from && v.scheduled_start.slice(0, 10) < filter.from) return false;
        if (filter.to && v.scheduled_start.slice(0, 10) > filter.to) return false;
        if (filter.excludeCancelled && v.status === "Cancelled") return false;
        return true;
      })
      .map((v) => {
        const c = clients.find((x) => x.id === v.client_id);
        const s = users.find((x) => x.id === v.staff_id);
        return {
          ...v,
          client_name: c ? `${c.first_name} ${c.last_name}` : "Client",
          staff_name: s?.full_name ?? "Staff"
        };
      })
      .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  }

  let q = createDataClient()
    .from("visits")
    .select("*, clients(first_name,last_name), staff:users!visits_staff_id_fkey(full_name)")
    .order("scheduled_start");
  if (filter.staffId) q = q.eq("staff_id", filter.staffId);
  if (filter.clientId) q = q.eq("client_id", filter.clientId);
  if (filter.from) q = q.gte("scheduled_start", `${filter.from}T00:00:00`);
  if (filter.to) q = q.lte("scheduled_start", `${filter.to}T23:59:59`);
  if (filter.excludeCancelled) q = q.neq("status", "Cancelled");
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => {
    const c = row.clients as { first_name?: string; last_name?: string } | null;
    const s = row.staff as { full_name?: string } | null;
    return {
      ...(row as unknown as Visit),
      client_name: c ? `${c.first_name} ${c.last_name}` : "Client",
      staff_name: s?.full_name ?? "Staff"
    };
  });
}

export async function getVisit(id: string): Promise<(VisitWithNames & { client: Client | null }) | null> {
  if (isDemoMode()) {
    const store = getDemoStore().data;
    const v = store.visits.find((x) => x.id === id);
    if (!v) return null;
    const c = store.clients.find((x) => x.id === v.client_id) ?? null;
    const s = store.users.find((x) => x.id === v.staff_id);
    return {
      ...v,
      client_name: c ? `${c.first_name} ${c.last_name}` : "Client",
      staff_name: s?.full_name ?? "Staff",
      client: c ? { ...c, calculated_age: age(c.date_of_birth) } : null
    };
  }
  const { data } = await createDataClient()
    .from("visits")
    .select("*, clients(*), staff:users!visits_staff_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const c = data.clients as Record<string, unknown> | null;
  const s = data.staff as { full_name?: string } | null;
  const client = c ? mapClientRow(c) : null;
  return {
    ...(data as unknown as Visit),
    client_name: client ? `${client.first_name} ${client.last_name}` : "Client",
    staff_name: s?.full_name ?? "Staff",
    client
  };
}

/**
 * Create/reschedule a visit. Business Rule #3 (active physician order) is
 * enforced by the DB trigger / demo-store rule — errors surface verbatim so
 * the schedule UI can show the red "cannot be saved" state.
 */
export async function saveVisit(
  visit: Omit<Visit, "id"> & { id?: string },
  ctx: AuditContext
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const full: Visit = { ...visit, id: visit.id ?? crypto.randomUUID() } as Visit;
  if (isDemoMode()) {
    try {
      getDemoStore().upsertVisit(full, ctx);
      return { ok: true, id: full.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  const { error } = await createDataClient().from("visits").upsert(
    {
      id: full.id, client_id: full.client_id, staff_id: full.staff_id,
      visit_type: full.visit_type, scheduled_start: full.scheduled_start,
      scheduled_end: full.scheduled_end, physician_order_id: full.physician_order_id,
      status: full.status, cancellation_reason: full.cancellation_reason ?? null,
      template_id: full.template_id ?? null
    },
    { onConflict: "id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: full.id };
}

export async function updateVisitStatus(
  id: string,
  status: VisitStatus,
  ctx: AuditContext,
  cancellationReason?: string
): Promise<{ ok: boolean; error?: string }> {
  if (isDemoMode()) {
    const store = getDemoStore();
    const v = store.data.visits.find((x) => x.id === id);
    if (!v) return { ok: false, error: "Visit not found." };
    const old = { ...v };
    v.status = status;
    if (cancellationReason !== undefined) v.cancellation_reason = cancellationReason;
    store.audit("visits", "UPDATE", id, old, { ...v }, ctx);
    return { ok: true };
  }
  const patch: Record<string, unknown> = { status };
  if (cancellationReason !== undefined) patch.cancellation_reason = cancellationReason;
  const { error } = await createDataClient().from("visits").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ═══ recurring visit templates ════════════════════════════════════════════

export async function listRecurringTemplates(): Promise<RecurringVisitTemplate[]> {
  if (isDemoMode()) return [...getDemoStore().data.recurringTemplates];
  const { data, error } = await createDataClient().from("recurring_visit_templates").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as RecurringVisitTemplate[];
}

export async function saveRecurringTemplate(
  tpl: Omit<RecurringVisitTemplate, "id"> & { id?: string },
  ctx: AuditContext
): Promise<{ ok: boolean; error?: string }> {
  const full: RecurringVisitTemplate = { ...tpl, id: tpl.id ?? crypto.randomUUID() };
  if (isDemoMode()) {
    const store = getDemoStore();
    const existing = store.data.recurringTemplates.find((t) => t.id === full.id);
    if (existing) {
      const old = { ...existing };
      Object.assign(existing, full);
      store.audit("recurring_visit_templates", "UPDATE", full.id, old, { ...existing }, ctx);
    } else {
      store.data.recurringTemplates.push(full);
      store.audit("recurring_visit_templates", "INSERT", full.id, null, { ...full }, ctx);
    }
    return { ok: true };
  }
  const { error } = await createDataClient().from("recurring_visit_templates").upsert(full, { onConflict: "id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Generate this week's visit instances from active templates (idempotent —
 * skips slots that already have a visit for that template+date). Per-instance
 * overrides = edit the generated visit; the template stays untouched.
 */
export async function generateVisitsFromTemplates(
  weekMondayIso: string,
  ctx: AuditContext
): Promise<{ created: number; errors: string[] }> {
  const templates = (await listRecurringTemplates()).filter((t) => t.active);
  const existing = await listVisits({ from: weekMondayIso, to: addDaysIso(weekMondayIso, 6) });
  const errors: string[] = [];
  let created = 0;

  for (const t of templates) {
    // weekday: 0=Sun…6=Sat; week starts Monday.
    const offset = (t.weekday + 6) % 7;
    const date = addDaysIso(weekMondayIso, offset);
    const already = existing.some((v) => v.template_id === t.id && v.scheduled_start.slice(0, 10) === date);
    if (already) continue;
    const res = await saveVisit(
      {
        client_id: t.client_id, staff_id: t.staff_id, visit_type: t.visit_type,
        scheduled_start: `${date}T${t.start_time.slice(0, 5)}:00`,
        scheduled_end: `${date}T${t.end_time.slice(0, 5)}:00`,
        physician_order_id: t.physician_order_id, status: "Scheduled", template_id: t.id
      },
      ctx
    );
    if (res.ok) created++;
    else errors.push(res.error ?? "unknown error");
  }
  return { created, errors };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

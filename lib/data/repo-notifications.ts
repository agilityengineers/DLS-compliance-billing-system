// lib/data/repo-notifications.ts — notification_log access (dedupe store).
import "server-only";

import { isDemoMode } from "@/lib/demo/mode";
import { getDemoStore } from "@/lib/data/demo/store";
import { createServiceClient } from "@/lib/supabase/server";

interface NotificationRecord {
  kind: string;
  user_id: string;
  recipient_email: string;
  subject: string;
  dedupe_key: string;
}

interface NotificationRow extends NotificationRecord {
  id: string;
  sent_at: string;
}

function demoBag(): NotificationRow[] {
  const bag = getDemoStore().data as unknown as { notificationLog?: NotificationRow[] };
  bag.notificationLog = bag.notificationLog ?? [];
  return bag.notificationLog;
}

export async function isDuplicateNotification(dedupeKey: string): Promise<boolean> {
  if (isDemoMode()) return demoBag().some((n) => n.dedupe_key === dedupeKey);
  const { data } = await createServiceClient()
    .from("notification_log").select("id").eq("dedupe_key", dedupeKey).maybeSingle();
  return !!data;
}

export async function recordNotification(rec: NotificationRecord): Promise<void> {
  if (isDemoMode()) {
    demoBag().push({ ...rec, id: crypto.randomUUID(), sent_at: new Date().toISOString() });
    return;
  }
  // Service role by necessity: the sweep runs as a job, not a user session.
  await createServiceClient().from("notification_log").insert(rec);
}

export async function listNotifications(): Promise<NotificationRow[]> {
  if (isDemoMode()) return [...demoBag()].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const { data } = await createServiceClient()
    .from("notification_log").select("*").order("sent_at", { ascending: false }).limit(100);
  return (data ?? []) as NotificationRow[];
}

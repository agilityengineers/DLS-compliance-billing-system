"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createDocument } from "@/lib/data/repo-field";

const DvrNoticeSchema = z.object({
  clientId: z.string().uuid(),
  noticeType: z.enum(["new_placement", "change", "separation"]),
  employer: z.string().min(1),
  position: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wage: z.string().min(1),
  hoursPerWeek: z.coerce.number().positive(),
  supervisor: z.string().optional(),
  narrative: z.string().optional()
});

/** "New DVR employment notice" — records the state form's fields. */
export async function createDvrNotice(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireRole("Admin", "Scheduler");
  const parsed = DvrNoticeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const d = parsed.data;

  const res = await createDocument(
    {
      kind: "dvr_notice",
      client_id: d.clientId,
      visit_id: null,
      uploaded_by: ctx.effectiveUser!.id,
      file_name: `dvr-employment-notice-${d.noticeType}-${d.startDate}.json`,
      content_type: "application/json",
      size_bytes: null,
      storage_provider: "demo",
      storage_key: null,
      status: "synced",
      metadata: {
        notice_type: d.noticeType,
        employer: d.employer,
        position: d.position,
        start_date: d.startDate,
        wage: d.wage,
        hours_per_week: d.hoursPerWeek,
        supervisor: d.supervisor ?? null,
        narrative: d.narrative ?? null
      }
    },
    ctx.auditCtx
  );
  if (res.ok) revalidatePath("/admin/documents");
  return res;
}

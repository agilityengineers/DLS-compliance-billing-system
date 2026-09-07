// app/api/uploads/route.ts — field photo/document upload flow.
// POST: create the document row (status 'uploading') + presign the target.
// PATCH: confirm the bytes landed → status 'synced' (visible on desktop
// Documents immediately). The Uploading → Synced states come from here.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/lib/auth/session";
import { createDocument, updateDocumentStatus } from "@/lib/data/repo-field";
import { getStorageAdapter } from "@/lib/integrations/storage";

const PostSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative(),
  clientId: z.string().uuid().nullable().optional(),
  visitId: z.string().uuid().nullable().optional()
});

export async function POST(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad upload request" }, { status: 400 });
  const { fileName, contentType, sizeBytes, clientId, visitId } = parsed.data;

  const documentId = crypto.randomUUID();
  const adapter = getStorageAdapter();
  let target;
  try {
    target = await adapter.getUploadTarget({ fileName, contentType, documentId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }

  const res = await createDocument(
    {
      id: documentId,
      kind: "field_upload",
      client_id: clientId ?? null,
      visit_id: visitId ?? null,
      uploaded_by: ctx.effectiveUser.id,
      file_name: fileName,
      content_type: contentType,
      size_bytes: sizeBytes,
      storage_provider: target.provider,
      storage_key: target.storageKey,
      status: "uploading",
      metadata: {}
    },
    ctx.auditCtx
  );
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });

  return NextResponse.json({ documentId, uploadUrl: target.uploadUrl, provider: target.provider });
}

const PatchSchema = z.object({
  documentId: z.string().uuid(),
  status: z.enum(["synced", "error"])
});

export async function PATCH(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const res = await updateDocumentStatus(parsed.data.documentId, parsed.data.status, ctx.auditCtx);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

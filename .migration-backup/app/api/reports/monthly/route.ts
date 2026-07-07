// app/api/reports/monthly/route.ts — monthly report preview/download.
//   ?clientId&month=YYYY-MM&kind=sls|dvr           → inline HTML preview
//   ...&format=doc                                 → Word-compatible download
//   ...&save=1                                     → also records a Documents row
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { composeDvrMonthlyReport, composeSlsBillingNote } from "@/lib/reports/monthly";
import { createDocument } from "@/lib/data/repo-field";

export async function GET(req: Request) {
  let ctx;
  try {
    ctx = await requireRole("Admin", "Scheduler");
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") ?? "";
  const month = url.searchParams.get("month") ?? "";
  const kind = url.searchParams.get("kind") === "dvr" ? "dvr" : "sls";
  const format = url.searchParams.get("format") === "doc" ? "doc" : "html";
  const save = url.searchParams.get("save") === "1";

  if (!/^\d{4}-\d{2}$/.test(month) || !clientId) {
    return NextResponse.json({ error: "clientId and month=YYYY-MM are required" }, { status: 400 });
  }

  const report =
    kind === "dvr"
      ? await composeDvrMonthlyReport(clientId, month)
      : await composeSlsBillingNote(clientId, month);
  if (!report) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const fileName = `${report.title.replace(/[^\w]+/g, "-").toLowerCase()}.doc`;

  if (save) {
    await createDocument(
      {
        kind: kind === "dvr" ? "dvr_monthly_report" : "monthly_billing_note",
        client_id: clientId,
        visit_id: null,
        uploaded_by: ctx.effectiveUser!.id,
        file_name: fileName,
        content_type: "application/msword",
        size_bytes: report.html.length,
        storage_provider: "demo",
        storage_key: null,
        status: "synced",
        metadata: { month, kind, generated: true }
      },
      ctx.auditCtx
    );
  }

  return new NextResponse(report.html, {
    headers: {
      "Content-Type": format === "doc" ? "application/msword" : "text/html; charset=utf-8",
      ...(format === "doc" ? { "Content-Disposition": `attachment; filename="${fileName}"` } : {}),
      "Cache-Control": "no-store"
    }
  });
}

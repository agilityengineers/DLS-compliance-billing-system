// app/admin/documents/page.tsx — Documents & notices:
// monthly report generation · field uploads (S3) · DVR employment notices ·
// agency documents (Google Drive adapter stub).
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listClients } from "@/lib/data/repo-core";
import { listDocuments } from "@/lib/data/repo-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { MonthlyReportGenerator } from "@/components/admin/monthly-report-generator";
import { DvrNoticeForm } from "@/components/admin/dvr-notice-form";

const KIND_LABEL: Record<string, string> = {
  field_upload: "Field upload",
  dvr_notice: "DVR notice",
  monthly_billing_note: "Monthly billing note",
  dvr_monthly_report: "DVR monthly report",
  agency: "Agency"
};

export default async function DocumentsPage() {
  try {
    await requireRole("Admin", "Scheduler");
  } catch {
    redirect("/admin");
  }

  const [docs, clients] = await Promise.all([listDocuments({}), listClients()]);
  const clientOptions = clients.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Documents &amp; notices</h1>
        <p className="text-sm text-muted-foreground">
          Monthly billing notes, DVR reports, and field uploads (synced from mobile via S3).
        </p>
      </div>

      <MonthlyReportGenerator clients={clientOptions} />
      <DvrNoticeForm clients={clientOptions} />

      <section className="space-y-2">
        <h2 className="font-serif text-lg font-semibold text-plum">All documents</h2>
        <Table>
          <THead>
            <tr><th>Document</th><th>Kind</th><th>Client</th><th>By</th><th>Created</th><th>Status</th></tr>
          </THead>
          <TBody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td className="max-w-sm truncate font-medium" title={d.file_name}>{d.file_name}</td>
                <td><Badge variant="muted">{KIND_LABEL[d.kind] ?? d.kind}</Badge></td>
                <td>{d.client_name ?? "—"}</td>
                <td className="text-muted-foreground">{d.uploader_name ?? "—"}</td>
                <td className="tabular-nums text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</td>
                <td>
                  <Badge variant={d.status === "synced" ? "success" : d.status === "uploading" ? "warning" : "destructive"}>
                    {d.status === "synced" ? "Synced" : d.status === "uploading" ? "Uploading" : "Error"}
                  </Badge>
                </td>
              </tr>
            ))}
            {docs.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No documents yet.</td></tr>
            )}
          </TBody>
        </Table>
      </section>

      <p className="text-xs text-muted-foreground">
        Agency documents (policies, forms) will sync from Google Drive once the service account is
        configured — the adapter is a stub until then (PRODUCTION-READINESS.md §4.7).
      </p>
    </div>
  );
}

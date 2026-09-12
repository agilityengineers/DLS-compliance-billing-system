// app/field/documents/page.tsx — my visit uploads (mirrors desktop Documents).
import { checkAccess } from "@/lib/rbac/access";
import { listDocuments } from "@/lib/data/repo-field";
import { Badge } from "@/components/ui/badge";
import { formatAgencyDate } from "@workspace/time";

export default async function FieldDocumentsPage() {
  const { ctx, denied } = await checkAccess({ feature: "documents.files", roles: ["Field_Staff"] });
  if (denied) return denied;

  const docs = await listDocuments({ uploadedBy: ctx.effectiveUser!.id });

  return (
    <div className="space-y-4">
      <h1 className="page-title">My uploads</h1>
      <div className="flex flex-col gap-3">
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 rounded-card-m border border-border bg-card p-4">
            <div className="min-w-0">
              <div className="truncate font-medium">{d.file_name}</div>
              <div className="text-xs text-muted-foreground">
                {d.client_name ?? "No client"} · {formatAgencyDate(d.created_at)}
              </div>
            </div>
            <Badge variant={d.status === "synced" ? "success" : d.status === "uploading" ? "warning" : "destructive"}>
              {d.status === "synced" ? "Synced" : d.status === "uploading" ? "Uploading" : "Error"}
            </Badge>
          </div>
        ))}
        {docs.length === 0 && (
          <p className="rounded-card-m border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Photos and documents you upload during visits appear here and on the desktop Documents screen.
          </p>
        )}
      </div>
    </div>
  );
}

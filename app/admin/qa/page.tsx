// app/admin/qa/page.tsx — QA review queue (resolvable inconsistency flags):
// med log w/o EVV overlap · missing signature · expired ITD authorization.
import { redirect } from "next/navigation";
import { requireRole, getSessionContext } from "@/lib/auth/session";
import { computeQaFlags } from "@/lib/qa/flags";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { ResolveFlagButton } from "@/components/admin/resolve-flag-button";

const KIND_VARIANT = {
  "med-no-evv": "warning",
  "missing-signature": "destructive",
  "expired-authorization": "warning"
} as const;

export default async function QaPage() {
  try {
    await requireRole("Admin", "Scheduler");
  } catch {
    redirect("/admin");
  }
  const ctx = await getSessionContext();
  const canResolve = ctx.effectiveUser?.role === "Admin";
  const { open } = await computeQaFlags();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">QA — flagged inconsistencies</h1>
        <p className="text-sm text-muted-foreground">
          {open.length} open flag{open.length === 1 ? "" : "s"}. Resolve before billing export.
        </p>
      </div>
      <Table>
        <THead>
          <tr><th>Flag</th><th>Client</th><th>Date</th><th>Detail</th>{canResolve && <th className="text-right">Resolve</th>}</tr>
        </THead>
        <TBody>
          {open.map((f) => (
            <tr key={f.key}>
              <td><Badge variant={KIND_VARIANT[f.kind]}>{f.kindLabel}</Badge></td>
              <td className="font-medium">{f.client}</td>
              <td className="tabular-nums">{f.date}</td>
              <td className="max-w-md text-muted-foreground">{f.detail}</td>
              {canResolve && (
                <td className="text-right">
                  <ResolveFlagButton flagKey={f.key} />
                </td>
              )}
            </tr>
          ))}
          {open.length === 0 && (
            <tr><td colSpan={canResolve ? 5 : 4} className="py-8 text-center text-muted-foreground">No inconsistencies found. 🎉</td></tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}

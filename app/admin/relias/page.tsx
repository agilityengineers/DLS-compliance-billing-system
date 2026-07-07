// app/admin/relias/page.tsx — Training & Learning: agency-wide course
// matrix (staff × required courses) + SSO launch + completion sync.
// Overdue REQUIRED courses become claim blockers (lib/billing/readiness).
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { listFieldStaff } from "@/lib/data/repo-core";
import { listReliasCompletions, listReliasCourses } from "@/lib/data/repo-business";
import { getReliasSsoUrl } from "@/lib/integrations/relias";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { ReliasSyncButton } from "@/components/admin/relias-sync-button";

export default async function ReliasPage() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  const isAdmin = ctx.effectiveUser.role === "Admin";
  const today = new Date().toISOString().slice(0, 10);

  const [staff, courses, completions] = await Promise.all([
    listFieldStaff(),
    listReliasCourses(),
    listReliasCompletions()
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Relias — Training &amp; Learning</h1>
          <p className="text-sm text-muted-foreground">
            Completions sync nightly via the Relias API; overdue required courses block claims.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && <ReliasSyncButton />}
          <a
            href={getReliasSsoUrl(ctx.effectiveUser.email)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-btn bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Launch Relias (SSO)
          </a>
        </div>
      </div>

      <Table>
        <THead>
          <tr>
            <th>Staff</th>
            {courses.map((c) => (
              <th key={c.id} className="text-center">
                {c.code}
                {c.required && <span className="ml-0.5 text-pill-danger-fg">*</span>}
              </th>
            ))}
          </tr>
        </THead>
        <TBody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td className="font-medium">{s.full_name}</td>
              {courses.map((c) => {
                const done = completions
                  .filter((x) => x.user_id === s.id && x.course_id === c.id)
                  .sort((a, b) => b.completed_on.localeCompare(a.completed_on))[0];
                const credential = s.training_completed.find(
                  (t) => t.course.trim().toLowerCase() === c.name.trim().toLowerCase()
                );
                const expires = done?.expires_on ?? credential?.expires_on ?? null;
                const has = !!done || !!credential;
                const expired = has && expires != null && expires < today;
                return (
                  <td key={c.id} className="text-center">
                    {!has ? (
                      <Badge variant={c.required ? "warning" : "muted"}>{c.required ? "Due" : "—"}</Badge>
                    ) : expired ? (
                      <span title={`Expired ${expires}`}><Badge variant="destructive">Expired</Badge></span>
                    ) : (
                      <span title={expires ? `Valid → ${expires}` : "No expiry"}><Badge variant="success">Current</Badge></span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </TBody>
      </Table>
      <p className="text-xs text-muted-foreground">* required course — expired/missing blocks claims for that staff member.</p>
    </div>
  );
}

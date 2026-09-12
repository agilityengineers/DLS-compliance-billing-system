// app/admin/staff/page.tsx — Staff & credentials (ADMIN-ONLY).
// Expired license/training = claim blocker; "Record renewal" clears it.
// Offboarding = suspend + reassign caseload in one flow.
//
// WHAT COUNTS as a credential is not decided here. This page renders the
// credentialing registry (/admin/requirements) through the same engine claim
// readiness uses, so the two can never drift: a requirement an admin turns off
// stops appearing, and a lapse shown here is exactly what blocks the claim.
import { checkAccess } from "@/lib/rbac/access";
import { listUsers } from "@/lib/data/repo-core";
import { listRequirements, listStaffCredentials } from "@/lib/data/repo-credentialing";
import { listReliasCompletions, listReliasCourses } from "@/lib/data/repo-business";
import { evaluateAndSummarize } from "@workspace/credentialing";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { StaffRowActions } from "@/components/admin/staff-row-actions";
import { agencyTodayIso } from "@/lib/time/agency";

export default async function StaffPage() {
  const { denied } = await checkAccess({ feature: "staff.credentials", roles: ["Admin"] });
  if (denied) return denied;

  const [staff, requirements, credentials, courses, completions] = await Promise.all([
    listUsers(), listRequirements(), listStaffCredentials(), listReliasCourses(), listReliasCompletions()
  ]);
  const today = agencyTodayIso();
  const fieldStaff = staff.filter((s) => s.role === "Field_Staff" && s.status === "Active");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Staff &amp; credentials</h1>
        <p className="text-sm text-muted-foreground">
          Expired licenses or required trainings BLOCK claims for that staff member&rsquo;s notes.
          What is required is configured under{" "}
          <a className="underline" href="/admin/requirements">Requirements</a>.
        </p>
      </div>
      <Table>
        <THead>
          <tr><th>Name</th><th>Role</th><th>Status</th><th>License</th><th>Trainings</th><th className="text-right">Actions</th></tr>
        </THead>
        <TBody>
          {staff.map((s) => {
            const { states, summary } = evaluateAndSummarize({
              requirements, staff: s, credentials,
              courses, completions, today
            });
            // Keep the row actions' contract: which licence/courses need a
            // renewal recorded — now answered by the registry, not by reading
            // the raw columns twice.
            const licExpired = states.some(
              (c) => c.requirement.source.kind === "license" && c.status === "expired"
            );
            const expiredCourses = states
              .filter((c) => c.requirement.source.kind === "training" && c.status === "expired")
              .flatMap((c) => (c.requirement.source.kind === "training" ? c.requirement.source.courseNames.slice(0, 1) : []));
            const blocking = summary.claimBlockers.length > 0;
            return (
              <tr key={s.id} className={s.status === "Suspended" ? "opacity-60" : undefined}>
                <td className="font-medium">{s.full_name}</td>
                <td>{s.role.replace(/_/g, " ")}</td>
                <td><Badge variant={s.status === "Active" ? "success" : "muted"}>{s.status}</Badge></td>
                <td>
                  {s.license_number ? (
                    <Badge variant={licExpired ? "destructive" : "success"}>
                      {s.license_number} · exp {s.license_expiration_date}
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td>
                  <span
                    title={
                      blocking
                        ? summary.claimBlockers.join("\n")
                        : summary.outstanding.length > 0
                          ? summary.outstanding.map((c) => c.detail).join("\n")
                          : summary.expiring.map((c) => c.detail).join("\n") || undefined
                    }
                  >
                    <Badge variant={blocking ? "destructive" : summary.ready ? "success" : "warning"}>
                      {summary.done}/{summary.total}
                      {blocking
                        ? " — claims blocked"
                        : summary.ready
                          ? summary.expiring.length > 0 ? " — renewal due" : " verified"
                          : " — outstanding"}
                    </Badge>
                  </span>
                </td>
                <td className="text-right">
                  <StaffRowActions
                    user={{ id: s.id, name: s.full_name, status: s.status, role: s.role }}
                    expiredCourses={expiredCourses}
                    licenseExpired={licExpired}
                    reassignTargets={fieldStaff.filter((f) => f.id !== s.id).map((f) => ({ id: f.id, name: f.full_name }))}
                  />
                </td>
              </tr>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

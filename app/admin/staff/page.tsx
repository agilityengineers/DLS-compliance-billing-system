// app/admin/staff/page.tsx — Staff & credentials (ADMIN-ONLY).
// Expired license/training = claim blocker; "Record renewal" clears it.
// Offboarding = suspend + reassign caseload in one flow.
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listUsers } from "@/lib/data/repo-core";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { StaffRowActions } from "@/components/admin/staff-row-actions";

export default async function StaffPage() {
  let ctx;
  try {
    ctx = await requireRole("Admin");
  } catch {
    redirect("/admin");
  }
  void ctx;

  const staff = await listUsers();
  const today = new Date().toISOString().slice(0, 10);
  const fieldStaff = staff.filter((s) => s.role === "Field_Staff" && s.status === "Active");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Staff &amp; credentials</h1>
        <p className="text-sm text-muted-foreground">
          Expired licenses or required trainings BLOCK claims for that staff member&rsquo;s notes.
        </p>
      </div>
      <Table>
        <THead>
          <tr><th>Name</th><th>Role</th><th>Status</th><th>License</th><th>Trainings</th><th className="text-right">Actions</th></tr>
        </THead>
        <TBody>
          {staff.map((s) => {
            const licExpired = !!(s.license_expiration_date && s.license_expiration_date < today);
            const expiredCourses = s.training_completed.filter((t) => t.expires_on && t.expires_on < today);
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
                  {expiredCourses.length > 0 ? (
                    <span title={expiredCourses.map((t) => `${t.course} expired ${t.expires_on}`).join("\n")}>
                      <Badge variant="destructive">{expiredCourses.length} expired — claims blocked</Badge>
                    </span>
                  ) : s.training_completed.length > 0 ? (
                    <Badge variant="success">{s.training_completed.length} current</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="text-right">
                  <StaffRowActions
                    user={{ id: s.id, name: s.full_name, status: s.status, role: s.role }}
                    expiredCourses={expiredCourses.map((t) => t.course)}
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

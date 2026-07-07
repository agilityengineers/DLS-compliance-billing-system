// app/admin/staff/page.tsx — staff roster with license/training status
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import type { TrainingRecord } from "@/lib/supabase/types";

export default async function StaffPage() {
  const supabase = createClient();
  const { data: staff } = await supabase.from("users").select("*").order("full_name");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Staff</h1>
      <Table>
        <THead>
          <tr><th>Name</th><th>Role</th><th>Status</th><th>License</th><th>Training</th></tr>
        </THead>
        <TBody>
          {(staff ?? []).map((s) => {
            const licExpired = s.license_expiration_date && s.license_expiration_date < today;
            const training = (s.training_completed ?? []) as TrainingRecord[];
            const expiredCourses = training.filter((t) => t.expires_on && t.expires_on < today);
            return (
              <tr key={s.id}>
                <td className="font-medium">{s.full_name}</td>
                <td>{s.role.replace("_", " ")}</td>
                <td><Badge variant={s.status === "Active" ? "success" : "muted"}>{s.status}</Badge></td>
                <td>
                  {s.license_number ? (
                    <Badge variant={licExpired ? "destructive" : "success"}>
                      {s.license_number} · exp {s.license_expiration_date}
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
                <td>
                  {expiredCourses.length > 0
                    ? <Badge variant="destructive">{expiredCourses.length} expired</Badge>
                    : <Badge variant="success">{training.length} current</Badge>}
                </td>
              </tr>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}

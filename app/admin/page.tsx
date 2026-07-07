// app/admin/page.tsx — dashboard
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboard() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ count: clientCount }, { count: todayVisits }, { count: openNotes }] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("visits").select("*", { count: "exact", head: true })
      .gte("scheduled_start", `${today}T00:00:00Z`).lte("scheduled_start", `${today}T23:59:59Z`),
    supabase.from("progress_notes").select("*", { count: "exact", head: true })
      .or("caregiver_signature_data.is.null,client_signature_data.is.null")
  ]);

  const stats = [
    { label: "Active clients", value: clientCount ?? 0, href: "/admin/clients" },
    { label: "Visits today", value: todayVisits ?? 0, href: "/admin/schedule" },
    { label: "Notes missing signatures", value: openNotes ?? 0, href: "/admin/qa" }
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:bg-muted/40">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-semibold tabular-nums">{s.value}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

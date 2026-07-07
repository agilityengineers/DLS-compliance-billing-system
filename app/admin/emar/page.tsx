// app/admin/emar/page.tsx — eMAR oversight (agency-wide, status filters).
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { listMedications } from "@/lib/data/repo-field";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const STATUSES = ["All", "Administered", "Refused", "Missed"] as const;

export default async function EmarOversightPage({ searchParams }: { searchParams: { status?: string } }) {
  try {
    await requireRole("Admin", "Scheduler");
  } catch {
    redirect("/admin");
  }
  const filter = STATUSES.includes(searchParams.status as (typeof STATUSES)[number])
    ? (searchParams.status as (typeof STATUSES)[number])
    : "All";

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const meds = await listMedications({
    from: iso(from), to: iso(today),
    status: filter === "All" ? undefined : filter
  });

  const counts = {
    Administered: meds.filter((m) => m.status === "Administered").length,
    Refused: meds.filter((m) => m.status === "Refused").length,
    Missed: meds.filter((m) => m.status === "Missed").length
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">eMAR oversight</h1>
        <p className="text-sm text-muted-foreground">
          Agency-wide medication administration, last 14 days.
          {filter === "All" && ` ${counts.Administered} administered · ${counts.Refused} refused · ${counts.Missed} missed.`}
        </p>
      </div>

      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "All" ? "/admin/emar" : `/admin/emar?status=${s}`}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-sm",
              filter === s ? "border-plum bg-plum text-white" : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {s}
          </Link>
        ))}
      </div>

      <Table>
        <THead>
          <tr><th>Client</th><th>Medication</th><th>Route</th><th>Scheduled</th><th>Administered</th><th>Status</th><th>Notes</th></tr>
        </THead>
        <TBody>
          {meds.map((m) => (
            <tr key={m.id}>
              <td className="font-medium">{m.client_name}</td>
              <td>{m.medication_name} · {m.dosage}</td>
              <td>{m.route}</td>
              <td className="tabular-nums">{new Date(m.scheduled_time).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              <td className="tabular-nums">
                {m.administered_time
                  ? new Date(m.administered_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                  : "—"}
              </td>
              <td>
                <Badge variant={m.status === "Administered" ? "success" : m.status === "Refused" ? "warning" : "destructive"}>
                  {m.status}
                </Badge>
              </td>
              <td className="max-w-xs truncate text-muted-foreground">{m.notes ?? "—"}</td>
            </tr>
          ))}
          {meds.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No medication logs match.</td></tr>
          )}
        </TBody>
      </Table>
    </div>
  );
}

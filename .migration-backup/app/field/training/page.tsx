// app/field/training/page.tsx — Training & Learning: my credentials +
// Relias courses (SSO deep link; completions sync nightly via the API).
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { listReliasCourses, listReliasCompletions } from "@/lib/data/repo-business";
import { getReliasSsoUrl } from "@/lib/integrations/relias";
import { Badge } from "@/components/ui/badge";

export default async function TrainingPage() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  const user = ctx.effectiveUser!;

  const [courses, completions] = await Promise.all([
    listReliasCourses(),
    listReliasCompletions(user.id)
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Training &amp; Learning</h1>

      <section className="space-y-2 rounded-card-m border border-border bg-card p-4">
        <h2 className="label-caps text-muted-foreground">My credentials</h2>
        {user.license_number ? (
          <div className="flex items-center justify-between text-sm">
            <span>License {user.license_number}</span>
            <Badge variant={user.license_expiration_date && user.license_expiration_date < today ? "destructive" : "success"}>
              {user.license_expiration_date && user.license_expiration_date < today ? "Expired" : `Expires ${user.license_expiration_date ?? "—"}`}
            </Badge>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No license on file.</p>
        )}
        {user.training_completed.map((t) => (
          <div key={t.course} className="flex items-center justify-between gap-3 text-sm">
            <span>{t.course}</span>
            <Badge variant={t.expires_on && t.expires_on < today ? "destructive" : "success"}>
              {t.expires_on && t.expires_on < today ? `Expired ${t.expires_on}` : `Valid → ${t.expires_on ?? "no expiry"}`}
            </Badge>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-card-m border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="label-caps text-muted-foreground">Relias courses</h2>
          <a
            href={getReliasSsoUrl(user.email)}
            target="_blank"
            rel="noreferrer"
            className="rounded-btn bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            Launch Relias (SSO)
          </a>
        </div>
        <ul className="space-y-2">
          {courses.map((c) => {
            const done = completions.find((x) => x.course_id === c.id);
            const expired = done?.expires_on && done.expires_on < today;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {c.name}
                  {c.required && <span className="ml-1.5 text-xs text-muted-foreground">(required)</span>}
                </span>
                {done ? (
                  <Badge variant={expired ? "destructive" : "success"}>
                    {expired ? `Expired ${done.expires_on}` : `Completed ${done.completed_on}`}
                  </Badge>
                ) : (
                  <Badge variant={c.required ? "warning" : "muted"}>{c.required ? "Due" : "Optional"}</Badge>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">
          Completions sync nightly from Relias. Overdue required courses block claims.
        </p>
      </section>
    </div>
  );
}

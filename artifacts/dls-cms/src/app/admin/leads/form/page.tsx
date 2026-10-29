// app/admin/leads/form/page.tsx — the small CMS behind the inbox: the
// questions the website asks and the stages an inquiry moves through.
// Admin only; changes take effect on the website's next page load.
import Link from "next/link";
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { LeadFormEditor } from "@/components/admin/leads/lead-form-editor";
import { LeadStageEditor } from "@/components/admin/leads/lead-stage-editor";

export default async function LeadFormSettingsPage() {
  const { denied } = await checkAccess({ feature: "leads.inbox", roles: ["Admin"] });
  if (denied) return denied;
  if (!isApiAuth()) return <p className="text-sm text-muted-foreground">Form settings need the API server (real sign-in mode).</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/leads" className="text-sm text-plum hover:underline">← Leads</Link>
        <h1 className="page-title mt-1">Form &amp; funnel</h1>
        <p className="text-sm text-muted-foreground">
          What the website asks, and the path an inquiry takes once it arrives. Changes reach the website the next time someone opens the contact page.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-plum">Website form questions</h2>
          <p className="text-sm text-muted-foreground">
            Add, reword, reorder or retire questions. Name, email and consent are built in: you can change their wording but not remove them.
            Retiring a question keeps every answer already given, with the wording the person saw.
          </p>
        </div>
        <LeadFormEditor />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-plum">Funnel stages</h2>
          <p className="text-sm text-muted-foreground">
            New inquiries land in the first stage. Converted and Closed are how an inquiry leaves the funnel; they can be renamed but not removed.
            A stage that still holds inquiries cannot be removed until they are moved.
          </p>
        </div>
        <LeadStageEditor />
      </section>
    </div>
  );
}

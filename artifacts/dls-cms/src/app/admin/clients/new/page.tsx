// app/admin/clients/new/page.tsx — intake (gated by the Client records
// capability). Opened from an inquiry (?leadId=…) it starts with that
// person's details filled in, and saving it converts the inquiry.
import type { PageProps } from "@/components/async-route";
import { checkAccess } from "@/lib/rbac/access";
import { isApiAuth } from "@/lib/auth/mode";
import { leadsApi } from "@/lib/api/admin";
import { NewClientForm, type IntakePrefill } from "./new-client-form";

export default async function NewClientPage(props: PageProps) {
  const { ctx, denied } = await checkAccess({ feature: "clients.core" });
  if (denied) return denied;

  const leadId = props.searchParams?.leadId;
  let prefill: IntakePrefill | undefined;
  if (leadId && isApiAuth() && ctx.features.has("leads.inbox")) {
    try {
      const { lead } = await leadsApi.get(leadId);
      if (!lead.convertedClientId) {
        prefill = { lead_id: lead.id, first_name: lead.firstName, last_name: lead.lastName, email: lead.email ?? "", phone: lead.phone ?? "" };
      }
    } catch {
      // The intake still works without the inquiry; it just starts empty.
    }
  }
  return <NewClientForm prefill={prefill} />;
}

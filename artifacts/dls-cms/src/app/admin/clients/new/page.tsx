// app/admin/clients/new/page.tsx — intake (gated by the Client records capability).
import { checkAccess } from "@/lib/rbac/access";
import { NewClientForm } from "./new-client-form";

export default async function NewClientPage() {
  const { denied } = await checkAccess({ feature: "clients.core" });
  if (denied) return denied;
  return <NewClientForm />;
}

// app/page.tsx — route to the right surface by (effective) role
import { redirect } from "next/navigation";
import { homePathForRole } from "@workspace/features";
import { getSessionContext } from "@/lib/auth/session";

export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  redirect(homePathForRole(ctx.effectiveUser.role));
}

// app/page.tsx — route to the right surface by (effective) role
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";

export default async function Home() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  redirect(ctx.effectiveUser.role === "Field_Staff" ? "/field" : "/admin");
}

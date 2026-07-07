// app/admin/layout.tsx — desktop-first admin shell (Admin + Scheduler only)
import { redirect } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("users").select("role,status").eq("id", user.id).single();
  if (!profile || profile.status !== "Active") redirect("/login");
  if (profile.role === "Field_Staff") redirect("/field");

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-x-auto p-6">{children}</main>
    </div>
  );
}

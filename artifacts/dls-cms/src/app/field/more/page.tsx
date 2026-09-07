// app/field/more/page.tsx — More tab: training, documents, incident report,
// sign-out. Sign-out wipes local (encrypted) data — lost-device protocol.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getSessionContext } from "@/lib/auth/session";
import { SignOutButton } from "@/components/field/sign-out-button";

export default async function MorePage() {
  const ctx = await getSessionContext();
  if (!ctx.effectiveUser) redirect("/login");
  const user = ctx.effectiveUser!;

  const items = [
    { href: "/field/training", label: "Training & Learning", sub: "Credentials + Relias courses" },
    { href: "/field/documents", label: "My uploads", sub: "Photos & documents from visits" },
    { href: "/field/incident", label: "Report an incident", sub: "Abuse/neglect & critical incidents" }
  ];

  return (
    <div className="space-y-4">
      <h1 className="page-title">More</h1>

      <div className="rounded-card-m border border-border bg-card p-4">
        <div className="font-medium">{user.full_name}</div>
        <div className="text-sm text-muted-foreground">{user.email}</div>
        {user.license_number && (
          <div className="mt-1 text-xs text-muted-foreground">
            License {user.license_number} · expires {user.license_expiration_date ?? "—"}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-card-m border border-border bg-card">
        {items.map((item, i) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-touch items-center justify-between gap-3 p-4 active:bg-muted ${i > 0 ? "border-t border-border" : ""}`}
          >
            <span>
              <span className="block font-medium">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <SignOutButton />
      <p className="text-center text-xs text-muted-foreground">
        Signing out removes all care data from this device.
      </p>
    </div>
  );
}

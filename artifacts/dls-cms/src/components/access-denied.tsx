// components/access-denied.tsx — what a page shows instead of its content
// when the feature is switched off or the role has no access. Explains WHO
// can change that, so nobody files a bug for a switch that is simply off.
import Link from "next/link";
import { Lock, ToggleLeft } from "lucide-react";
import { ROLE_LABELS, type FeatureDef, type Role } from "@workspace/features";

export type DenialReason =
  | { kind: "feature_off"; def: FeatureDef; platformEnabled: boolean; viewerRole: Role }
  | { kind: "role"; allowed: Role[]; viewerRole: Role };

export function AccessDenied({ reason }: { reason: DenialReason }) {
  const homeHref = reason.viewerRole === "Super_Admin" ? "/admin/platform" : reason.viewerRole === "Field_Staff" ? "/field" : "/admin";
  if (reason.kind === "feature_off") {
    const { def, platformEnabled, viewerRole } = reason;
    let hint: string;
    if (!platformEnabled) {
      hint = "This capability is not enabled by your provider yet. It will light up here as soon as it is made available.";
    } else if (viewerRole === "Admin") {
      hint = def.adminConfigurable
        ? "It is switched off for your organization. Turn it on in Settings → Feature access."
        : "It is not switched on for your organization yet.";
    } else {
      hint = "Your administrator has not turned this on for your role. Ask them to enable it in Settings → Feature access.";
    }
    return (
      <div className="mx-auto max-w-lg space-y-4 pt-10">
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <ToggleLeft className="mx-auto mb-3 h-8 w-8 text-plum-accent" />
          <h1 className="font-serif text-xl font-semibold text-plum">{def.label} is switched off</h1>
          <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
          <Link href={homeHref} className="mt-4 inline-block text-sm text-plum underline">Back to home</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg space-y-4 pt-10">
      <div className="rounded-card border border-border bg-card p-6 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-plum-accent" />
        <h1 className="font-serif text-xl font-semibold text-plum">This area is for {reason.allowed.map((r) => ROLE_LABELS[r]).join(" and ")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You are signed in as {ROLE_LABELS[reason.viewerRole]}.
          {reason.viewerRole === "Super_Admin" && " The provider account manages the platform and does not open client records."}
        </p>
        <Link href={homeHref} className="mt-4 inline-block text-sm text-plum underline">Back to home</Link>
      </div>
    </div>
  );
}

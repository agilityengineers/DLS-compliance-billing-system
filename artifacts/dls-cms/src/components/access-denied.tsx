// components/access-denied.tsx — what a page shows instead of its content
// when the feature is switched off or the role has no access. Explains WHO
// can change that, so nobody files a bug for a switch that is simply off.
import Link from "next/link";
import { Lock, ToggleLeft } from "lucide-react";
import {
  PLATFORM_CAPABILITY_LABELS,
  ROLE_LABELS,
  type FeatureDef,
  type PlatformCapability,
  type Role,
} from "@workspace/features";

export type DenialReason =
  | { kind: "feature_off"; def: FeatureDef; platformEnabled: boolean; viewerRole: Role }
  | { kind: "role"; allowed: Role[]; viewerRole: Role }
  | { kind: "capability"; capability: PlatformCapability; viewerRole: Role };

export function AccessDenied({ reason }: { reason: DenialReason }) {
  const isProvider = reason.viewerRole === "Super_Admin" || reason.viewerRole === "Platform_Support";
  const homeHref = isProvider ? "/admin/platform" : reason.viewerRole === "Field_Staff" ? "/field" : "/admin";
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
  if (reason.kind === "capability") {
    // Naming the capability rather than a role list: the reader wants to know
    // what this screen needs, not to guess which job titles happen to hold it.
    return (
      <div className="mx-auto max-w-lg space-y-4 pt-10">
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-plum-accent" />
          <h1 className="font-serif text-xl font-semibold text-plum">Your account cannot open this screen</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            It needs permission to {PLATFORM_CAPABILITY_LABELS[reason.capability].toLowerCase()}, which
            {ROLE_LABELS[reason.viewerRole] === "Support" ? " a support account does not hold" : " your account does not hold"}.
            {reason.viewerRole === "Platform_Support" && " A Super Admin can make the change for you."}
          </p>
          <Link href={homeHref} className="mt-4 inline-block text-sm text-plum underline">Back to the console</Link>
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
          {reason.viewerRole === "Platform_Support" &&
            " A support account can read the console and work an incident, but does not change configuration."}
        </p>
        <Link href={homeHref} className="mt-4 inline-block text-sm text-plum underline">Back to home</Link>
      </div>
    </div>
  );
}

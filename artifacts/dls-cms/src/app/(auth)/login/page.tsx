// app/(auth)/login/page.tsx — the front door of the portal.
// Real accounts sign in with email + password (verified by the API server);
// the password-free demo role picker appears only in demo sign-in mode.
import { redirect } from "next/navigation";
import { homePathForRole } from "@workspace/features";
import { isDemoMode } from "@/lib/demo/mode";
import { isApiAuth } from "@/lib/auth/mode";
import { getSessionContext } from "@/lib/auth/session";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { DemoRolePicker } from "@/components/auth/demo-role-picker";

export default async function LoginPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  const ctx = await getSessionContext();
  if (ctx.effectiveUser) {
    redirect(homePathForRole(ctx.effectiveUser.role));
  }
  const demo = isDemoMode();
  const apiAuth = isApiAuth();

  const errors: Record<string, string> = {
    suspended: "This account is suspended. Contact your administrator.",
    not_provisioned: "This account has not been set up for DLS. Ask your administrator to invite you.",
    idle_timeout: "You were signed out after a period of inactivity. Sign in again to continue.",
    session_revoked: "Your session ended. Sign in again to continue.",
    session_expired: "Your session expired. Sign in again — unsynced work on this device is kept and will sync.",
    oauth_failed: "Sign-in did not complete. Try again.",
    missing_code: "Sign-in link was incomplete. Try again.",
  };
  const errorText = searchParams.error
    ? errors[searchParams.error] ?? "Sign-in failed. Try again."
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-sm">
          {/* Brand — the full DLS logo on the white card so its artwork sits on its own background */}
          <div className="border-b border-border bg-white px-8 pb-5 pt-7">
            <img
              src="/brand/dls-logo.png"
              alt="Durable Life Skills, Inc. — Because it's a jungle out there"
              width={1538}
              height={760}
              className="mx-auto h-auto w-full max-w-[340px]"
              decoding="async"
              fetchPriority="high"
            />
          </div>

          <div className="space-y-4 p-6">
            <div>
              <h1 className="font-serif text-xl font-semibold text-plum">Sign in to the DLS Portal</h1>
              <p className="text-sm text-muted-foreground">Care management, compliance and billing.</p>
            </div>
            {apiAuth ? <CredentialsForm /> : <DemoRolePicker />}
            {ctx.apiError && (
              <p className="rounded-btn bg-pill-warning px-3 py-2 text-sm text-pill-warning-fg" role="alert">
                {ctx.apiError}
              </p>
            )}
            {errorText && <p className="text-sm text-destructive" role="alert">{errorText}</p>}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {apiAuth
            ? "Access is by invitation. Your administrator creates your account and can reset your password."
            : "Demo mode — synthetic data only, no PHI."}
          {demo && apiAuth && " Client records shown after sign-in are synthetic demo data."}
        </p>
      </div>
    </main>
  );
}

// app/(auth)/login/page.tsx — brand sign-in. Demo mode shows the role picker;
// real mode shows Google Sign-In + email/password (no verification).
import Image from "next/image";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo/mode";
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
    redirect(ctx.effectiveUser.role === "Field_Staff" ? "/field" : "/admin");
  }
  const demo = isDemoMode();

  const errorText =
    searchParams.error === "suspended"
      ? "This account is suspended. Contact your administrator."
      : searchParams.error
        ? "Sign-in failed. Try again."
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/dls-mascot.png"
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-full border border-border object-cover"
            priority
          />
          <div>
            <div className="font-serif text-xl font-semibold leading-tight text-plum">Durable Life Skills</div>
            <div className="label-caps text-muted-foreground">Care Management</div>
          </div>
        </div>

        <div className="rounded-card border border-border bg-card p-5 shadow-sm">
          {demo ? <DemoRolePicker /> : <CredentialsForm />}
          {errorText && <p className="mt-3 text-sm text-destructive" role="alert">{errorText}</p>}
        </div>

        {demo && (
          <p className="text-center text-xs text-muted-foreground">
            Demo mode — synthetic data only, no PHI. Configure Supabase in
            .env.local for real sign-in (see README).
          </p>
        )}
      </div>
    </main>
  );
}

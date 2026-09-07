// components/impersonation-banner.tsx — REQUIRED by the impersonation spec:
// a visible banner during impersonation with one-tap exit. Server component;
// exit posts the stopImpersonation server action.
import { getSessionContext } from "@/lib/auth/session";
import { stopImpersonation } from "@/lib/auth/impersonation";
import { redirect } from "next/navigation";

export async function ImpersonationBanner() {
  const ctx = await getSessionContext();
  if (!ctx.impersonating || !ctx.effectiveUser || !ctx.realUser) return null;

  async function exit() {
    "use server";
    await stopImpersonation();
    redirect("/");
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-plum px-3 py-1.5 text-white">
      <span className="text-xs">
        <strong className="font-semibold">Viewing as {ctx.effectiveUser.full_name}</strong>
        {" · "}every action is logged under your identity ({ctx.realUser.full_name})
      </span>
      <form action={exit}>
        <button
          type="submit"
          className="rounded-pill bg-white/15 px-3 py-0.5 text-xs font-semibold text-white hover:bg-white/25"
        >
          Exit
        </button>
      </form>
    </div>
  );
}

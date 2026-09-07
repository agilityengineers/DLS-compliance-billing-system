// app/api/jobs/credential-expiry/route.ts — daily credential-expiry sweep
// (30/14/3-day SendGrid warnings). Call from a scheduler (Replit cron /
// GitHub Action) with the x-cron-secret header, or as a signed-in Admin.
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { runCredentialExpirySweep } from "@/lib/integrations/email";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  let authorized = !!secret && provided === secret;
  if (!authorized) {
    const ctx = await getSessionContext();
    authorized = ctx.effectiveUser?.role === "Admin";
  }
  if (!authorized) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const result = await runCredentialExpirySweep();
  return NextResponse.json(result);
}

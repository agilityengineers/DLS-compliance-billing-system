// lib/integrations/hipaaGate.ts — the live-PHI tripwire.
// Every outbound integration (S3, SendGrid, Relias, Sandata, Drive) calls
// assertBaaGate() before touching a real service. Until BAAs are executed
// with every vendor and BAA_SIGNED_ALL_VENDORS=true is set, integrations
// refuse to run against live services (PRODUCTION-READINESS.md §1).
import "server-only";
import { isDemoMode } from "@/lib/demo/mode";

export function baaGateOpen(): boolean {
  return process.env.BAA_SIGNED_ALL_VENDORS === "true";
}

export function assertBaaGate(integration: string): void {
  if (isDemoMode()) return; // demo adapters never leave the process
  if (!baaGateOpen()) {
    throw new Error(
      `HIPAA_GATE: ${integration} is disabled until BAAs are executed with all vendors ` +
      `and BAA_SIGNED_ALL_VENDORS=true is set. See PRODUCTION-READINESS.md §1.`
    );
  }
}

// lib/auth/mode.ts — how people sign in.
//
//   "api"  — real accounts: the API server verifies email + password and
//            issues an httpOnly session cookie (default).
//   "demo" — the password-free role picker backed by the synthetic dataset,
//            kept for design reviews that run without the API server.
//
// Independent of demo DATA mode (lib/demo/mode.ts): today the identity and
// feature configuration are real while client/visit/billing records are still
// the synthetic demo dataset.
export function isApiAuth(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_MODE !== "demo";
}

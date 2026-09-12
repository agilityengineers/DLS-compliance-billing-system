// Time-based one-time passwords (RFC 6238) on Node's own crypto — no
// dependency, and nothing here touches the database.
//
// Why this exists: a password is a single secret that can be read over a
// shoulder, reused from another site, or phished. The provider account is the
// master key to every organization's configuration, so it should not rest on
// one secret alone.
//
// Shape of the scheme: the server and the authenticator app share a random
// secret, each derives a 6-digit code from that secret and the current
// 30-second step, and the codes agree. It is the same trick as two people
// holding identical one-time pads and reading the same line at the same
// minute — no network, no round trip, nothing to intercept.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Seconds per code. 30 is what every authenticator app assumes. */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/**
 * How many steps either side of "now" are accepted. One step forward and back
 * covers a phone whose clock has drifted by up to half a minute, which is the
 * usual cause of a rejected code that the user swears is right.
 */
export const TOTP_WINDOW_STEPS = 1;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Not a base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, base32 encoded — what the QR code and the app hold. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function currentStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
}

/** The code for one step. Exported so tests can pin a moment in time. */
export function totpCodeForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  // Dynamic truncation (RFC 4226 §5.3): the last nibble picks the offset.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function totpCodeNow(secret: string, now: Date = new Date()): string {
  return totpCodeForStep(secret, currentStep(now));
}

export interface TotpVerification {
  ok: boolean;
  /** The step the code belonged to — store it to stop the same code twice. */
  step?: number;
  reason?: "malformed" | "mismatch" | "replayed";
}

/**
 * Check a code against the accepted window.
 *
 * `lastUsedStep` is the highest step already spent by this account. A correct
 * code is refused when it is not newer than that, because a code read off a
 * screen stays valid for up to a minute and must not be usable twice.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { now?: Date; lastUsedStep?: number | null; window?: number } = {}
): TotpVerification {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return { ok: false, reason: "malformed" };
  const now = options.now ?? new Date();
  const window = options.window ?? TOTP_WINDOW_STEPS;
  const center = currentStep(now);
  for (let offset = -window; offset <= window; offset++) {
    const step = center + offset;
    if (step < 0) continue;
    const expected = Buffer.from(totpCodeForStep(secret, step));
    const given = Buffer.from(digits);
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      if (options.lastUsedStep != null && step <= options.lastUsedStep) {
        return { ok: false, reason: "replayed" };
      }
      return { ok: true, step };
    }
  }
  return { ok: false, reason: "mismatch" };
}

/**
 * The `otpauth://` URI an authenticator app reads. The label carries the
 * account so someone with several DLS logins can tell the entries apart.
 */
export function totpUri(input: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Secret in readable groups of four, for someone typing it in by hand. */
export function formatSecretForDisplay(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? []).join(" ");
}

export const RECOVERY_CODE_COUNT = 10;

/** Codes are shown once and stored only as hashes, like passwords. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = base32Encode(randomBytes(10)).slice(0, 10);
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export interface StoredRecoveryCode {
  hash: string;
  usedAt: string | null;
}

export function toStoredRecoveryCodes(codes: string[]): StoredRecoveryCode[] {
  return codes.map((c) => ({ hash: hashRecoveryCode(c), usedAt: null }));
}

/**
 * Spend a recovery code. Returns the updated list when it matched, so the
 * caller writes back a version with that code marked used; a code works once.
 */
export function spendRecoveryCode(
  stored: readonly StoredRecoveryCode[] | null | undefined,
  code: string,
  now: Date = new Date()
): { ok: boolean; codes: StoredRecoveryCode[]; remaining: number } {
  const codes = (stored ?? []).map((c) => ({ ...c }));
  const hash = hashRecoveryCode(code);
  const match = codes.find((c) => c.usedAt === null && c.hash === hash);
  if (!match) return { ok: false, codes, remaining: codes.filter((c) => c.usedAt === null).length };
  match.usedAt = now.toISOString();
  return { ok: true, codes, remaining: codes.filter((c) => c.usedAt === null).length };
}

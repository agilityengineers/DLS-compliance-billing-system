// TOTP against the RFC 6238 test vectors, plus the two rules that matter in
// practice: a code works inside a small clock-drift window, and never twice.
import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  currentStep,
  formatSecretForDisplay,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  spendRecoveryCode,
  toStoredRecoveryCodes,
  totpCodeForStep,
  totpUri,
  verifyTotp,
  TOTP_STEP_SECONDS,
} from "../lib/totp";

/** The RFC's shared secret is the ASCII string "12345678901234567890". */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const at = (unixSeconds: number) => new Date(unixSeconds * 1000);

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const bytes of [[0], [255], [1, 2, 3], [0, 0, 0, 0, 0], Array.from({ length: 20 }, (_, i) => i * 7)]) {
      const buf = Buffer.from(bytes);
      expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    }
  });

  it("matches the known encoding of the RFC secret and ignores spacing", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv-gy3t qojq GEZDGNBVGY3TQOJQ").toString("ascii")).toBe("12345678901234567890");
  });

  it("rejects a secret that is not base32", () => {
    expect(() => base32Decode("not base32 – 1890!")).toThrow(/base32/);
  });
});

describe("RFC 6238 test vectors (SHA-1)", () => {
  // The RFC publishes 8-digit codes; a 6-digit code is the last six digits.
  const vectors: [number, string][] = [
    [59, "287082"],
    [1_111_111_109, "081804"],
    [1_111_111_111, "050471"],
    [1_234_567_890, "005924"],
    [2_000_000_000, "279037"],
    [20_000_000_000, "353130"],
  ];

  it.each(vectors)("time %i produces %s", (unixSeconds, expected) => {
    const step = Math.floor(unixSeconds / TOTP_STEP_SECONDS);
    expect(totpCodeForStep(RFC_SECRET, step)).toBe(expected);
    expect(currentStep(at(unixSeconds))).toBe(step);
    expect(verifyTotp(RFC_SECRET, expected, { now: at(unixSeconds) })).toEqual({ ok: true, step });
  });
});

describe("verification", () => {
  const now = at(1_111_111_111);
  const step = currentStep(now);

  it("accepts a code one step either side, and refuses one further out", () => {
    expect(verifyTotp(RFC_SECRET, totpCodeForStep(RFC_SECRET, step - 1), { now }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCodeForStep(RFC_SECRET, step + 1), { now }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpCodeForStep(RFC_SECRET, step + 2), { now })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("reports the step it matched so the caller can spend it", () => {
    const result = verifyTotp(RFC_SECRET, totpCodeForStep(RFC_SECRET, step - 1), { now });
    expect(result.step).toBe(step - 1);
  });

  it("refuses a code that has already been used", () => {
    const code = totpCodeForStep(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step - 5 }).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET, code, { now, lastUsedStep: step })).toEqual({ ok: false, reason: "replayed" });
    // An older-but-still-in-window code is spent too: only forward progress counts.
    expect(verifyTotp(RFC_SECRET, totpCodeForStep(RFC_SECRET, step - 1), { now, lastUsedStep: step })).toEqual({
      ok: false,
      reason: "replayed",
    });
  });

  it("rejects anything that is not six digits without touching the secret", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12-34-56"]) {
      expect(verifyTotp(RFC_SECRET, bad, { now })).toEqual({ ok: false, reason: "malformed" });
    }
    // Spacing inside a six-digit code is forgiven, since apps display it that
    // way; a wrong code that happens to be spaced is a mismatch, not garbage.
    expect(verifyTotp(RFC_SECRET, "12 34 56", { now })).toEqual({ ok: false, reason: "mismatch" });
    const code = totpCodeForStep(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { now }).ok).toBe(true);
  });

  it("does not accept another account's code", () => {
    const other = generateTotpSecret();
    expect(verifyTotp(other, totpCodeForStep(RFC_SECRET, step), { now }).ok).toBe(false);
  });
});

describe("enrolment", () => {
  it("generates a 160-bit secret and a URI an authenticator app understands", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    const uri = new URL(totpUri({ secret, account: "emailme@clarencewilliams.com", issuer: "DLS Portal" }));
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.host).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe("/DLS Portal:emailme@clarencewilliams.com");
    expect(uri.searchParams.get("secret")).toBe(secret);
    expect(uri.searchParams.get("issuer")).toBe("DLS Portal");
    expect(uri.searchParams.get("digits")).toBe("6");
    expect(uri.searchParams.get("period")).toBe("30");
  });

  it("formats the secret in groups of four for hand entry", () => {
    expect(formatSecretForDisplay("GEZDGNBVGY3TQOJQ")).toBe("GEZD GNBV GY3T QOJQ");
  });
});

describe("recovery codes", () => {
  it("issues ten distinct codes and stores only their hashes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    const stored = toStoredRecoveryCodes(codes);
    expect(stored.every((s) => s.usedAt === null && /^[0-9a-f]{64}$/.test(s.hash))).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(codes[0]!.split("-")[0]!);
  });

  it("spends a code once, forgiving case and punctuation", () => {
    const codes = generateRecoveryCodes(3);
    let stored = toStoredRecoveryCodes(codes);
    const first = spendRecoveryCode(stored, codes[1]!.toLowerCase().replace("-", " "));
    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(2);
    stored = first.codes;
    // The same code a second time is refused, and the others still work.
    expect(spendRecoveryCode(stored, codes[1]!).ok).toBe(false);
    expect(spendRecoveryCode(stored, codes[0]!).ok).toBe(true);
    expect(spendRecoveryCode(stored, "AAAAA-AAAAA").ok).toBe(false);
    expect(spendRecoveryCode(null, codes[0]!)).toEqual({ ok: false, codes: [], remaining: 0 });
  });

  it("hashes a code the same way however it is written", () => {
    expect(hashRecoveryCode("abcde-fghij")).toBe(hashRecoveryCode("ABCDE FGHIJ"));
  });
});

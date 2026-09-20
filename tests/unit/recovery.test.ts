import { describe, expect, it } from "vitest";
import { decodeRecoveryCode, encodeRecoveryCode, RECOVERY_FIXTURE, RECOVERY_MAX_FILE_BYTES, RECOVERY_PREFIX } from "@/lib/recovery";
import { base64UrlEncode } from "@/lib/crypto";

describe("recovery codes", () => {
  it("round-trips the shared deterministic fixture", () => {
    const code = encodeRecoveryCode(RECOVERY_FIXTURE);
    expect(code.startsWith(RECOVERY_PREFIX)).toBe(true);
    expect(decodeRecoveryCode(code)).toEqual(RECOVERY_FIXTURE);
  });

  it("rejects unknown fields", () => {
    const body = JSON.stringify({ version: 1, origin: RECOVERY_FIXTURE.origin, submission_id: RECOVERY_FIXTURE.submission_id, secret: RECOVERY_FIXTURE.secret, extra: 1 });
    const code = RECOVERY_PREFIX + base64UrlEncode(new TextEncoder().encode(body));
    expect(() => decodeRecoveryCode(code)).toThrow();
  });

  it("rejects oversized files", () => {
    const big = "a".repeat(RECOVERY_MAX_FILE_BYTES);
    expect(() => decodeRecoveryCode(`${RECOVERY_PREFIX}${big}`)).toThrow();
  });

  it("rejects invalid secret length", () => {
    const body = JSON.stringify({ version: 1, origin: RECOVERY_FIXTURE.origin, submission_id: RECOVERY_FIXTURE.submission_id, secret: "AAAA" });
    const code = RECOVERY_PREFIX + base64UrlEncode(new TextEncoder().encode(body));
    expect(() => decodeRecoveryCode(code)).toThrow();
  });

  it("rejects invalid submission uuid", () => {
    const body = JSON.stringify({ version: 1, origin: RECOVERY_FIXTURE.origin, submission_id: "not-a-uuid", secret: RECOVERY_FIXTURE.secret });
    const code = RECOVERY_PREFIX + base64UrlEncode(new TextEncoder().encode(body));
    expect(() => decodeRecoveryCode(code)).toThrow();
  });

  it("rejects unexpected service origin", () => {
    const code = encodeRecoveryCode(RECOVERY_FIXTURE);
    expect(() => decodeRecoveryCode(code, "https://other.example.test")).toThrow();
  });

  it("rejects non-https origins except debug loopback", () => {
    expect(() => encodeRecoveryCode({ ...RECOVERY_FIXTURE, origin: "http://example.com" })).toThrow();
    expect(() =>
      encodeRecoveryCode({ ...RECOVERY_FIXTURE, origin: "http://localhost:3000" }),
    ).not.toThrow();
  });
});

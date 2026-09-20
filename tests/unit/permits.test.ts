import { describe, expect, it } from "vitest";
import {
  mintUploadPermit, ownerHashFor, ownerHashMatches, parseOwnerBearer, permitExpiryForSession,
  signManagementSessionId, verifyManagementSessionCookie, verifyUploadPermit,
} from "@/lib/permits";

const SECRET = "test-permit-secret-0123456789abcdef";
const SUBMISSION = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-000000000002";
const BODY = "a".repeat(64);
const OWNER = "b".repeat(64);

describe("owner proof", () => {
  it("parses bearer secrets and stores hashes only", () => {
    const secret = "A".repeat(43);
    expect(parseOwnerBearer(`Bearer ${secret}`)).toBe(secret);
    expect(() => parseOwnerBearer(null)).toThrow();
    expect(() => parseOwnerBearer("Bearer short")).toThrow();
    const hash = ownerHashFor(secret);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(ownerHashMatches(secret, hash)).toBe(true);
    expect(ownerHashMatches("B".repeat(43), hash)).toBe(false);
  });
});

describe("upload permits", () => {
  const sessionExpires = 10 * 60_000;
  const verifiedAt = 60_000;
  const boundExpiry = permitExpiryForSession(sessionExpires, verifiedAt);

  it("binds the permit expiry to the stored session, not to poll time", () => {
    expect(boundExpiry).toBe(Math.min(sessionExpires, verifiedAt + 5 * 60_000));
    // verifiedAt (60s) + 5min binds below the 10min session expiry.
    expect(boundExpiry).toBe(verifiedAt + 5 * 60_000);
  });

  it("mints deterministic HMAC permits verifiable against the session cap", () => {
    const { permit } = mintUploadPermit({
      permitSecret: SECRET, sessionId: SESSION, submissionId: SUBMISSION,
      bodySha256: BODY, ownerHash: OWNER, expiresAtMs: boundExpiry,
    });
    const verify = (permitText: string, nowMs: number, max: number): boolean =>
      verifyUploadPermit({
        permitSecret: SECRET, permit: permitText, sessionId: SESSION, submissionId: SUBMISSION,
        bodySha256: BODY, ownerHash: OWNER, maxExpiresAtMs: max, nowMs,
      });
    expect(verify(permit, 2_000, sessionExpires)).toBe(true);
    // Same inputs mint the identical permit (response-loss tolerant polling).
    const again = mintUploadPermit({
      permitSecret: SECRET, sessionId: SESSION, submissionId: SUBMISSION,
      bodySha256: BODY, ownerHash: OWNER, expiresAtMs: boundExpiry,
    });
    expect(again.permit).toBe(permit);
    // Wrong binding fails.
    expect(verify(permit, 2_000, sessionExpires) && verifyUploadPermit({
      permitSecret: SECRET, permit, sessionId: SESSION, submissionId: SUBMISSION,
      bodySha256: "c".repeat(64), ownerHash: OWNER, maxExpiresAtMs: sessionExpires, nowMs: 2_000,
    })).toBe(false);
    // Expired fails.
    expect(verify(permit, boundExpiry + 1, sessionExpires)).toBe(false);
    // Permit bound beyond the stored session expiry is rejected.
    const rogue = mintUploadPermit({
      permitSecret: SECRET, sessionId: SESSION, submissionId: SUBMISSION,
      bodySha256: BODY, ownerHash: OWNER, expiresAtMs: sessionExpires + 60_000,
    });
    expect(verify(rogue.permit, 2_000, sessionExpires)).toBe(false);
  });
});

describe("management session cookies", () => {
  it("signs and verifies session ids", () => {
    const signed = signManagementSessionId(SECRET, SESSION);
    expect(verifyManagementSessionCookie(SECRET, signed)).toBe(SESSION);
    expect(verifyManagementSessionCookie("wrong-secret-0123456789abcdef", signed)).toBeNull();
    expect(verifyManagementSessionCookie(SECRET, "tampered.payload")).toBeNull();
  });
});

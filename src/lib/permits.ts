import { createHmac, timingSafeEqual } from "node:crypto";
import { assertBase64Url32, assertUuidV4, base64UrlDecode, base64UrlEncode, constantTimeEqualHex, sha256HexUtf8 } from "./crypto";

export const UPLOAD_PERMIT_TTL_MS = 5 * 60 * 1000;
export const UPLOAD_SESSION_TTL_MS = 5 * 60 * 1000;
export const MANAGEMENT_SESSION_TTL_MS = 30 * 60 * 1000;

/** Owner proof: Authorization: Bearer <32-byte base64url secret>. Server stores SHA-256 hash only. */
export function parseOwnerBearer(authHeader: string | null): string {
  if (!authHeader || !authHeader.startsWith("Bearer ")) throw new Error("ownership_missing");
  const token = authHeader.slice("Bearer ".length).trim();
  try {
    assertBase64Url32(token);
  } catch {
    throw new Error("ownership_missing");
  }
  return token;
}

export function ownerHashFor(secret: string): string {
  return sha256HexUtf8(secret);
}

export function ownerHashMatches(secret: string, expectedHash: string): boolean {
  return constantTimeEqualHex(ownerHashFor(secret), expectedHash.toLowerCase());
}

function hmacB64Url(secret: string, message: string): string {
  const sig = createHmac("sha256", secret).update(message, "utf8").digest();
  return base64UrlEncode(sig);
}

/**
 * Deterministic server-HMAC upload permit bound to session/submission/body/owner
 * with an explicit expiry. The expiry is the stored session binding
 * (min(session expires_at, verified_at + 5min)), never "now + 5min" at poll
 * time, so verified sessions cannot mint forever and repeated polling returns
 * the identical value while valid, tolerating response loss without storing
 * raw secrets.
 */
export function mintUploadPermit(args: {
  permitSecret: string;
  sessionId: string;
  submissionId: string;
  bodySha256: string;
  ownerHash: string;
  expiresAtMs: number;
}): { permit: string; expiresAtMs: number } {
  assertUuidV4(args.sessionId);
  assertUuidV4(args.submissionId);
  if (!/^[a-f0-9]{64}$/.test(args.bodySha256)) throw new Error("Invalid body hash.");
  if (!Number.isSafeInteger(args.expiresAtMs)) throw new Error("Invalid permit expiry.");
  const payload = `v1|${args.sessionId}|${args.submissionId}|${args.bodySha256}|${args.ownerHash}|${args.expiresAtMs}`;
  const sig = hmacB64Url(args.permitSecret, payload);
  return { permit: `${args.expiresAtMs}.${sig}`, expiresAtMs: args.expiresAtMs };
}

export function verifyUploadPermit(args: {
  permitSecret: string;
  permit: string;
  sessionId: string;
  submissionId: string;
  bodySha256: string;
  ownerHash: string;
  /** Stored session expiry cap: permits bound beyond it are rejected. */
  maxExpiresAtMs: number;
  nowMs?: number;
}): boolean {
  const now = args.nowMs ?? Date.now();
  const dot = args.permit.indexOf(".");
  if (dot <= 0) return false;
  const expiresAtMs = Number(args.permit.slice(0, dot));
  const sig = args.permit.slice(dot + 1);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now) return false;
  if (expiresAtMs > args.maxExpiresAtMs) return false;
  const payload = `v1|${args.sessionId}|${args.submissionId}|${args.bodySha256}|${args.ownerHash}|${expiresAtMs}`;
  const expected = hmacB64Url(args.permitSecret, payload);
  try {
    const a = Buffer.from(base64UrlDecode(sig));
    const b = Buffer.from(base64UrlDecode(expected));
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Permit expiry bound to the stored session: min(expires_at, verified_at + 5min). */
export function permitExpiryForSession(sessionExpiresAtMs: number, verifiedAtMs: number): number {
  return Math.min(sessionExpiresAtMs, verifiedAtMs + UPLOAD_PERMIT_TTL_MS);
}

/** Management session cookie signing: `sessionId.signature` with HMAC(MANAGEMENT_SECRET, sessionId). */
export function signManagementSessionId(secret: string, sessionId: string): string {
  assertUuidV4(sessionId);
  return `${sessionId}.${hmacB64Url(secret, `mgmt-v1|${sessionId}`)}`;
}

export function verifyManagementSessionCookie(secret: string, cookieValue: string): string | null {
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return null;
  const sessionId = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  try {
    assertUuidV4(sessionId);
  } catch {
    return null;
  }
  const expected = hmacB64Url(secret, `mgmt-v1|${sessionId}`);
  try {
    const a = Buffer.from(base64UrlDecode(sig));
    const b = Buffer.from(base64UrlDecode(expected));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return sessionId;
  } catch {
    return null;
  }
}

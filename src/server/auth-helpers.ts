import { timingSafeEqual } from "node:crypto";
import { sha256HexUtf8 } from "../lib/crypto";
import { getServiceOrigin } from "../lib/env";
import { ownerHashMatches, parseOwnerBearer, verifyManagementSessionCookie } from "../lib/permits";
import { decodeRecoveryCode } from "../lib/recovery";
import { csrfTokenHash } from "./repository";
import type { BenchmarkStore } from "./repository";

/** Extract owner secret from Authorization header; throws ownership_missing. */
export function requireOwnerSecret(headers: Headers): string {
  return parseOwnerBearer(headers.get("authorization"));
}

export function ownerHashOf(secret: string): string {
  return sha256HexUtf8(secret);
}

export function ownerMatches(secret: string, expectedHash: string): boolean {
  return ownerHashMatches(secret, expectedHash);
}

/** Resolve recovery code to (submission_id, secret) with service-origin binding. */
export function parseRecovery(body: { recovery_code?: unknown }, serviceOrigin: string): { submission_id: string; secret: string } {
  if (!body || typeof body.recovery_code !== "string") throw new Error("Invalid recovery code.");
  const payload = decodeRecoveryCode(body.recovery_code, serviceOrigin);
  return { submission_id: payload.submission_id, secret: payload.secret };
}

export function hashCsrfToken(token: string): string {
  return csrfTokenHash(token);
}

function timingSafeEqualText(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function managementCookieName(): string {
  return "aiolm_mgmt";
}

/** Secure is conditional so the HTTP loopback used in development still works. */
function secureAttribute(): string {
  return process.env["NODE_ENV"] === "production" ? "; Secure" : "";
}

export function buildManagementCookie(sessionId: string, signed: string): string {
  return `${managementCookieName()}=${signed}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1800${secureAttribute()}`;
}

/**
 * The clearing cookie repeats every attribute of the one it replaces. Removal
 * matches on name/domain/path, so the old form did clear the cookie, but an
 * expiry that drops Secure and HttpOnly is a needless divergence between the
 * two halves of one cookie's lifecycle.
 */
export function clearManagementCookie(): string {
  return `${managementCookieName()}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureAttribute()}`;
}

export function readManagementCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === managementCookieName()) return rest.join("=");
  }
  return null;
}

export interface ValidManagementSession {
  id: string;
  submission_id: string;
  csrf_token_hash: string;
  expires_at: string;
}

async function loadSession(request: Request, store: BenchmarkStore): Promise<ValidManagementSession | null> {
  const raw = readManagementCookie(request.headers.get("cookie"));
  const secret = process.env["MANAGEMENT_HMAC_SECRET"];
  if (!raw || !secret) return null;
  const sessionId = verifyManagementSessionCookie(secret, raw);
  if (!sessionId) return null;
  const session = await store.getManagementSession(sessionId);
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;
  return session;
}

/**
 * Read visibility: a valid (unexpired, unrevoked) cookie session for this
 * submission may view hidden records. No CSRF needed for reads.
 */
export async function managedSubmissionForRead(
  request: Request,
  store: BenchmarkStore,
): Promise<string | null> {
  const session = await loadSession(request, store);
  return session ? session.submission_id : null;
}

/**
 * Mutation authorization: the session must be bound to this submission AND
 * the request must carry the exact configured Origin plus a timing-safe
 * X-CSRF-Token match. Missing/wrong token or cross-origin requests fail.
 * Never falls back to visibility-only checks.
 */
export async function requireMutationSession(
  request: Request,
  store: BenchmarkStore,
  submissionId: string,
): Promise<{ ok: true; session: ValidManagementSession } | { ok: false; reason: string }> {
  const session = await loadSession(request, store);
  if (!session) return { ok: false, reason: "Management session required." };
  if (session.submission_id !== submissionId) {
    return { ok: false, reason: "Management session does not cover this record." };
  }
  let expectedOrigin: string;
  try {
    expectedOrigin = getServiceOrigin();
  } catch {
    return { ok: false, reason: "Service origin is not configured." };
  }
  // Origins are public values compared as exact canonical strings. Parsing the
  // header with new URL() and reading .origin would silently accept values the
  // Origin serialization can never produce - credentials, a path, a query or a
  // fragment - so a header like "https://site.example/evil" would pass. The
  // configured value is already canonical (scheme + lowercased host, no path).
  const origin = request.headers.get("origin");
  const originOk = origin === expectedOrigin;
  const token = request.headers.get("x-csrf-token");
  // The CSRF token is a secret: timing-safe comparison against the stored hash.
  const csrfOk = !!token && timingSafeEqualText(hashCsrfToken(token), session.csrf_token_hash);
  if (!originOk || !csrfOk) {
    return { ok: false, reason: "Valid Origin and X-CSRF-Token are required." };
  }
  return { ok: true, session };
}

/** Owner bearer proof OR authorized mutation session. */
export async function isOwnerOrMutationSession(
  request: Request,
  store: BenchmarkStore,
  submissionId: string,
  ownerHash: string,
): Promise<boolean> {
  try {
    const secret = parseOwnerBearer(request.headers.get("authorization"));
    if (ownerHashMatches(secret, ownerHash)) return true;
  } catch {
    // fall through to cookie session
  }
  const mutation = await requireMutationSession(request, store, submissionId);
  return mutation.ok;
}

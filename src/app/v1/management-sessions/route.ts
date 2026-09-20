import { randomUUID } from "node:crypto";
import { randomBase64Url32 } from "@/lib/crypto";
import { getServiceOrigin, quotaConfigFromEnv } from "@/lib/env";
import { serviceError } from "@/lib/errors";
import { getClientIp, quotaKeyForIp, quotaWindowMinute } from "@/lib/ip";
import { MANAGEMENT_SESSION_TTL_MS, ownerHashMatches, signManagementSessionId, verifyManagementSessionCookie } from "@/lib/permits";
import { BoundedBodyError, SMALL_JSON_MAX_BYTES, readBoundedJson } from "@/lib/request";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";
import type { ValidManagementSession } from "@/server/auth-helpers";
import {
  buildManagementCookie, clearManagementCookie, hashCsrfToken,
  parseRecovery, readManagementCookie, requireMutationSession,
} from "@/server/auth-helpers";

export const dynamic = "force-dynamic";

/**
 * POST /v1/management-sessions body {recovery_code}; verifies owner and
 * establishes a result-scoped 30min HttpOnly/Secure/SameSite=Strict cookie;
 * never exposes the secret to client storage. Returns {id,csrf_token}.
 *
 * Invalid attempts are budgeted at 10/min/IP (atomic, 429 + Retry-After).
 * The entry probe runs BEFORE the body is read and before the owner-hash
 * lookup so flooded IPs cannot force unlimited expensive auth work; valid
 * owner operations never consume the invalid budget.
 *
 * Creating a NEW session is the only abusable path here, so it fails CLOSED
 * with a structured 503 whenever the abuse budget cannot be enforced: no
 * trusted client IP, no QUOTA_HMAC_SECRET, or a quota store that errors.
 * Owner bearer flows (edit, delete) and the GET/DELETE of an existing session
 * do not consult this budget and stay usable in that state.
 */
export async function POST(request: Request): Promise<Response> {
  // Abuse protection must be available before any owner work or row creation.
  const gate = invalidManageGate(request);
  if (!gate) return abuseProtectionUnavailable();
  // Store construction itself throws when DATABASE_URL is missing, so it sits
  // inside the same boundary: a misconfigured deployment answers a structured
  // 503, never an unhandled 500. Store errors are never echoed to the client.
  let store: BenchmarkStore;
  let used: number;
  try {
    store = getStore();
    used = await store.quotaProbe(gate.key);
  } catch {
    return abuseProtectionUnavailable();
  }
  if (used >= gate.limit) {
    return serviceError(429, "rate_limited", "Too many attempts. Try again shortly.", Math.ceil(gate.windowMs / 1000));
  }

  // Configuration required to mint a session at all. Checked before any DB row
  // is written, so a missing signing key never leaves an unusable session row.
  const mgmtSecret = process.env["MANAGEMENT_HMAC_SECRET"];
  if (!mgmtSecret) return serviceError(503, "service_unavailable", "Management is not configured.", 60);
  let serviceOrigin: string;
  try {
    serviceOrigin = getServiceOrigin();
  } catch {
    return serviceError(503, "service_unavailable", "Management is not configured.", 60);
  }

  // Malformed/oversized bodies are cheap to generate, so they consume the
  // invalid budget rather than offering an unaccounted flood path.
  let parsed: unknown;
  try {
    ({ parsed } = await readBoundedJson(request, SMALL_JSON_MAX_BYTES));
  } catch (err) {
    return err instanceof BoundedBodyError
      ? chargeInvalid(store, gate, () => serviceError(413, "payload_too_large", "Request is too large."))
      : chargeInvalid(store, gate, () => serviceError(400, "invalid_request", "Invalid JSON body."));
  }

  let submissionId: string;
  let secret: string;
  try {
    ({ submission_id: submissionId, secret } = parseRecovery(parsed as { recovery_code?: unknown }, serviceOrigin));
  } catch {
    return chargeInvalid(store, gate, invalidRecovery);
  }
  let run: Awaited<ReturnType<BenchmarkStore["getRunBySubmission"]>>;
  try {
    run = await store.getRunBySubmission(submissionId);
  } catch {
    // A database that cannot answer the owner lookup is an availability
    // problem, not a failed authentication: never leak it as 401 or 500.
    return managementUnavailable();
  }
  if (!run || !ownerHashMatches(secret, run.owner_hash)) {
    return chargeInvalid(store, gate, invalidRecovery);
  }

  const id = randomUUID();
  const csrfToken = randomBase64Url32();
  const expiresAt = new Date(Date.now() + MANAGEMENT_SESSION_TTL_MS).toISOString();
  try {
    await store.createManagementSession({ id, submission_id: submissionId, csrf_token_hash: hashCsrfToken(csrfToken), expires_at: expiresAt });
  } catch {
    return managementUnavailable();
  }

  const signed = signManagementSessionId(mgmtSecret, id);
  return Response.json(
    { id, csrf_token: csrfToken },
    { headers: { "cache-control": "no-store", "set-cookie": buildManagementCookie(id, signed) } },
  );
}

/**
 * GET /v1/management-sessions returns current scoped management info, including
 * hidden state. Every store call sits inside a boundary: a database outage is an
 * availability problem, so it answers a structured 503 rather than a bare 500 or
 * a misleading 401 that would make a client discard a still-valid session.
 */
export async function GET(request: Request): Promise<Response> {
  let store: BenchmarkStore;
  try {
    store = getStore();
  } catch {
    return managementUnavailable();
  }
  let session: ValidManagementSession | null;
  try {
    session = await currentSession(request, store);
  } catch {
    return managementUnavailable();
  }
  if (!session) return serviceError(401, "ownership_missing", "Management session required.");
  let run: Awaited<ReturnType<BenchmarkStore["getRunBySubmission"]>>;
  try {
    run = await store.getRunBySubmission(session.submission_id);
  } catch {
    return managementUnavailable();
  }
  if (!run || run.deleted) return serviceError(404, "not_found", "Benchmark not found.");
  return Response.json(
    {
      id: session.id,
      submission_id: run.submission_id,
      public_id: run.public_id,
      hidden: run.hidden,
      revision: run.revision,
      description_md: run.description_md,
      expires_at: session.expires_at,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * DELETE /v1/management-sessions clears the session. With a session cookie
 * present, exact Origin + CSRF are required; without any cookie there is
 * nothing to clear. A database outage answers 503 instead of reporting the
 * session as cleared: a caller must be able to tell "revoked" from "the store
 * could not be reached", because only the former actually ends the session.
 */
export async function DELETE(request: Request): Promise<Response> {
  const raw = readManagementCookie(request.headers.get("cookie"));
  if (!raw) return clearedResponse();
  const secret = process.env["MANAGEMENT_HMAC_SECRET"];
  if (!secret) return serviceError(503, "service_unavailable", "Management is not configured.", 60);
  const sessionId = verifyManagementSessionCookie(secret, raw);
  if (!sessionId) return clearedResponse();
  let store: BenchmarkStore;
  try {
    store = getStore();
  } catch {
    return managementUnavailable();
  }
  let session: Awaited<ReturnType<BenchmarkStore["getManagementSession"]>>;
  try {
    session = await store.getManagementSession(sessionId);
  } catch {
    return managementUnavailable();
  }
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) {
    return clearedResponse();
  }
  let mutation: Awaited<ReturnType<typeof requireMutationSession>>;
  try {
    mutation = await requireMutationSession(request, store, session.submission_id);
  } catch {
    return managementUnavailable();
  }
  if (!mutation.ok) return serviceError(403, "invalid_csrf", mutation.reason);
  try {
    await store.revokeManagementSession(session.id);
  } catch {
    return managementUnavailable();
  }
  return clearedResponse();
}

/** 204 + cookie clear: no live session is left to revoke. */
function clearedResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearManagementCookie(), "cache-control": "no-store" },
  });
}

/**
 * Resolve the signed cookie to a live session. Store failures propagate so the
 * caller answers 503; an absent, expired or revoked session returns null.
 */
async function currentSession(request: Request, store: BenchmarkStore): Promise<ValidManagementSession | null> {
  const raw = readManagementCookie(request.headers.get("cookie"));
  const secret = process.env["MANAGEMENT_HMAC_SECRET"];
  if (!raw || !secret) return null;
  const sessionId = verifyManagementSessionCookie(secret, raw);
  if (!sessionId) return null;
  const session = await store.getManagementSession(sessionId);
  if (!session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;
  return session;
}

/** Structured, detail-free answer when the management store cannot be reached. */
function managementUnavailable(): Response {
  return serviceError(503, "service_unavailable", "Management is temporarily unavailable.", 60);
}

interface InvalidManageGate {
  key: string;
  windowMs: number;
  limit: number;
}

/** Quota context for the invalid-attempt budget; null when IP/quota secrets are unavailable. */
function invalidManageGate(request: Request): InvalidManageGate | null {
  const quotaSecret = process.env["QUOTA_HMAC_SECRET"] ?? null;
  const ip = getClientIp(request.headers);
  if (!ip || !quotaSecret) return null;
  const config = quotaConfigFromEnv();
  return {
    key: quotaKeyForIp(quotaSecret, ip, "invalid-manage", quotaWindowMinute(Date.now())),
    windowMs: 60_000,
    limit: config.invalidManagePerMinIp,
  };
}

/** Structured fail-closed answer when the invalid-attempt budget cannot be enforced. */
function abuseProtectionUnavailable(): Response {
  return serviceError(503, "service_unavailable", "Abuse protection is unavailable.", 60);
}

function invalidRecovery(): Response {
  return serviceError(401, "ownership_missing", "Recovery code is invalid.");
}

/**
 * Record one invalid attempt atomically, then answer. Budget overflow answers
 * 429 + Retry-After; a quota store that errors answers 503 rather than letting
 * the unaccounted attempt through.
 */
async function chargeInvalid(
  store: BenchmarkStore,
  gate: InvalidManageGate,
  onAllowed: () => Response,
): Promise<Response> {
  let result: { allowed: boolean; retryAfterSec: number };
  try {
    result = await store.quotaGateAtomic(gate.key, gate.windowMs, gate.limit);
  } catch {
    return abuseProtectionUnavailable();
  }
  if (!result.allowed) {
    return serviceError(429, "rate_limited", "Too many attempts. Try again shortly.", result.retryAfterSec);
  }
  return onAllowed();
}

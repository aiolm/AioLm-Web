import { randomUUID } from "node:crypto";
import { assertBodySha256 } from "@aiolm/benchmark-contracts";
import { UUID_V4_RE } from "@/lib/crypto";
import { getServiceOrigin, quotaConfigFromEnv } from "@/lib/env";
import { serviceError, unavailable } from "@/lib/errors";
import { getClientIp, quotaKeyForIp, quotaWindowMinute } from "@/lib/ip";
import { UPLOAD_SESSION_TTL_MS, ownerHashFor, parseOwnerBearer } from "@/lib/permits";
import { BoundedBodyError, SMALL_JSON_MAX_BYTES, readBoundedJson } from "@/lib/request";
import { logRequest } from "@/server/logging";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * POST /v1/upload-sessions — authenticated by owner proof.
 * Body {submission_id, body_sha256}. Returns {session_id, verification_url, expires_at}.
 * Creates a pending 5min session bound to submission/body/owner. Request limits run before DB allocation.
 */
export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const respond = (status: number, res: Response): Response => {
    logRequest({ route: "POST /v1/upload-sessions", method: "POST", status, ms: Date.now() - started, bytesIn: 0 });
    return res;
  };
  let parsed: unknown;
  try {
    ({ parsed } = await readBoundedJson(request, SMALL_JSON_MAX_BYTES));
  } catch (err) {
    if (err instanceof BoundedBodyError) return respond(413, serviceError(413, "payload_too_large", "Upload session request is too large."));
    return respond(400, serviceError(400, "invalid_request", "Invalid JSON body."));
  }
  let ownerSecret: string;
  try {
    ownerSecret = parseOwnerBearer(request.headers.get("authorization"));
  } catch {
    return respond(401, serviceError(401, "ownership_missing", "Owner proof is required."));
  }
  const record = parsed as { submission_id?: unknown; body_sha256?: unknown };
  if (typeof record.submission_id !== "string" || !UUID_V4_RE.test(record.submission_id)) {
    return respond(400, serviceError(400, "invalid_request", "submission_id and body_sha256 are required."));
  }
  let bodySha: string;
  try {
    bodySha = assertBodySha256(record.body_sha256 as string);
  } catch {
    return respond(400, serviceError(400, "invalid_request", "submission_id and body_sha256 are required."));
  }

  const config = quotaConfigFromEnv();
  const quotaSecret = process.env["QUOTA_HMAC_SECRET"] ?? null;
  const ip = getClientIp(request.headers);
  if (!ip || !quotaSecret) {
    return respond(429, serviceError(429, "rate_limited", "Too many verification sessions. Try again shortly.", 60));
  }
  let store: BenchmarkStore;
  let gate: { allowed: boolean; retryAfterSec: number };
  try {
    // Store construction throws with no DATABASE_URL, and the atomic gate is a
    // database write: both answer a retryable 503 rather than an opaque 500.
    store = getStore();
    gate = await store.quotaGateAtomic(
      quotaKeyForIp(quotaSecret, ip, "session-create", quotaWindowMinute(Date.now())),
      60_000,
      config.sessionCreatePerMinIp,
    );
  } catch {
    return respond(503, unavailable("Service unavailable."));
  }
  if (!gate.allowed) {
    return respond(429, serviceError(429, "rate_limited", "Too many verification sessions. Try again shortly.", gate.retryAfterSec));
  }

  const ownerHash = ownerHashFor(ownerSecret);
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + UPLOAD_SESSION_TTL_MS).toISOString();
  try {
    await store.createUploadSession({
      session_id: sessionId, submission_id: record.submission_id, body_sha256: bodySha, owner_hash: ownerHash, expires_at: expiresAt,
    });
  } catch {
    return respond(503, unavailable("Service unavailable."));
  }

  let origin: string;
  try {
    origin = getServiceOrigin();
  } catch {
    return respond(503, serviceError(503, "service_unavailable", "Publishing is not configured.", 60));
  }
  return respond(
    201,
    Response.json(
      { session_id: sessionId, verification_url: `${origin}/verify/${sessionId}`, expires_at: expiresAt },
      { status: 201, headers: { "cache-control": "no-store" } },
    ),
  );
}

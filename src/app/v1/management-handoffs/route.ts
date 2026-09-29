import { randomUUID } from "node:crypto";
import { UUID_V4_RE, randomBase64Url32 } from "@/lib/crypto";
import { quotaConfigFromEnv } from "@/lib/env";
import { serviceError } from "@/lib/errors";
import { getClientIp, quotaKeyForIp, quotaWindowMinute } from "@/lib/ip";
import { ownerHashMatches, parseOwnerBearer } from "@/lib/permits";
import { BoundedBodyError, SMALL_JSON_MAX_BYTES, readBoundedJson } from "@/lib/request";
import { MANAGEMENT_HANDOFF_TTL_MS, hashHandoffToken } from "@/server/auth-helpers";
import { abuseProtectionUnavailable, chargeInvalid, invalidManageGate, managementUnavailable } from "@/server/manage-gate";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * POST /v1/management-handoffs body {submission_id} with
 * `Authorization: Bearer <owner secret>`: the desktop app asks for a
 * single-use, 2-minute ticket so the browser can open a management session
 * without the owner secret ever reaching it. Returns 201
 * {handoff_id, handoff_token, expires_at}; the app opens
 * `<origin>/manage#handoff=<handoff_id>.<handoff_token>` and the page redeems
 * it at /v1/management-handoffs/<id>/redeem.
 *
 * Unknown submissions and wrong secrets answer the same 401 and are charged to
 * the invalid-manage budget; valid issuance is limited separately per IP. Like
 * session creation, this fails CLOSED with a structured 503 when the budget
 * cannot be enforced.
 */
export async function POST(request: Request): Promise<Response> {
  const gate = invalidManageGate(request);
  if (!gate) return abuseProtectionUnavailable();
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
  // A ticket is only useful if the browser can later be given a session.
  if (!process.env["MANAGEMENT_HMAC_SECRET"]) return serviceError(503, "service_unavailable", "Management is not configured.", 60);

  let parsed: unknown;
  try {
    ({ parsed } = await readBoundedJson(request, SMALL_JSON_MAX_BYTES));
  } catch (err) {
    return err instanceof BoundedBodyError
      ? chargeInvalid(store, gate, () => serviceError(413, "payload_too_large", "Request is too large."))
      : chargeInvalid(store, gate, () => serviceError(400, "invalid_request", "Invalid JSON body."));
  }
  const submissionId = (parsed as { submission_id?: unknown } | null)?.submission_id;
  if (typeof submissionId !== "string" || !UUID_V4_RE.test(submissionId)) {
    return chargeInvalid(store, gate, () => serviceError(400, "invalid_request", "submission_id is required."));
  }
  let secret: string;
  try {
    secret = parseOwnerBearer(request.headers.get("authorization"));
  } catch {
    return chargeInvalid(store, gate, ownershipMissing);
  }
  let run: Awaited<ReturnType<BenchmarkStore["getRunBySubmission"]>>;
  try {
    run = await store.getRunBySubmission(submissionId);
  } catch {
    return managementUnavailable();
  }
  if (!run || !ownerHashMatches(secret, run.owner_hash)) {
    return chargeInvalid(store, gate, ownershipMissing);
  }
  if (run.deleted) return serviceError(410, "submission_deleted", "This benchmark has been deleted.");

  const quotaSecret = process.env["QUOTA_HMAC_SECRET"]!;
  const ip = getClientIp(request.headers)!;
  let issued: { allowed: boolean; retryAfterSec: number };
  try {
    issued = await store.quotaGateAtomic(
      quotaKeyForIp(quotaSecret, ip, "handoff-create", quotaWindowMinute(Date.now())),
      60_000,
      quotaConfigFromEnv().sessionCreatePerMinIp,
    );
  } catch {
    return abuseProtectionUnavailable();
  }
  if (!issued.allowed) {
    return serviceError(429, "rate_limited", "Too many attempts. Try again shortly.", issued.retryAfterSec);
  }

  const handoffId = randomUUID();
  const handoffToken = randomBase64Url32();
  const expiresAt = new Date(Date.now() + MANAGEMENT_HANDOFF_TTL_MS).toISOString();
  try {
    await store.createManagementSession({
      id: handoffId, submission_id: submissionId, csrf_token_hash: hashHandoffToken(handoffToken), expires_at: expiresAt,
    });
  } catch {
    return managementUnavailable();
  }
  return Response.json(
    { handoff_id: handoffId, handoff_token: handoffToken, expires_at: expiresAt },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

function ownershipMissing(): Response {
  return serviceError(401, "ownership_missing", "Owner proof is required.");
}

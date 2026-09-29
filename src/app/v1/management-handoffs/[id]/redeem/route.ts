import { randomUUID } from "node:crypto";
import { UUID_V4_RE, assertBase64Url32, randomBase64Url32 } from "@/lib/crypto";
import { getServiceOrigin } from "@/lib/env";
import { serviceError } from "@/lib/errors";
import { MANAGEMENT_SESSION_TTL_MS, signManagementSessionId } from "@/lib/permits";
import { BoundedBodyError, SMALL_JSON_MAX_BYTES, readBoundedJson } from "@/lib/request";
import { buildManagementCookie, hashCsrfToken, hashHandoffToken } from "@/server/auth-helpers";
import { abuseProtectionUnavailable, chargeInvalid, invalidManageGate, managementUnavailable } from "@/server/manage-gate";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * POST /v1/management-handoffs/<id>/redeem body {handoff_token}: the
 * management page exchanges an app handoff ticket for an ordinary 30-minute
 * management session. Requires the exact service Origin. The ticket is
 * consumed and the session created in one atomic unit, so a ticket works once.
 * Answers exactly like POST /v1/management-sessions: {id, csrf_token} plus the
 * HttpOnly/SameSite=Strict session cookie. Unknown, used, expired, revoked and
 * mismatched tickets all answer the same 401 and are charged to the
 * invalid-manage budget.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
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

  const mgmtSecret = process.env["MANAGEMENT_HMAC_SECRET"];
  if (!mgmtSecret) return serviceError(503, "service_unavailable", "Management is not configured.", 60);
  let serviceOrigin: string;
  try {
    serviceOrigin = getServiceOrigin();
  } catch {
    return serviceError(503, "service_unavailable", "Management is not configured.", 60);
  }
  // Only the management page itself may redeem: exact canonical Origin, as for mutations.
  if (request.headers.get("origin") !== serviceOrigin) {
    return chargeInvalid(store, gate, () => serviceError(403, "invalid_csrf", "A same-origin request is required."));
  }

  let parsed: unknown;
  try {
    ({ parsed } = await readBoundedJson(request, SMALL_JSON_MAX_BYTES));
  } catch (err) {
    return err instanceof BoundedBodyError
      ? chargeInvalid(store, gate, () => serviceError(413, "payload_too_large", "Request is too large."))
      : chargeInvalid(store, gate, () => serviceError(400, "invalid_request", "Invalid JSON body."));
  }
  const { id: handoffId } = await params;
  const token = (parsed as { handoff_token?: unknown } | null)?.handoff_token;
  if (!UUID_V4_RE.test(handoffId) || typeof token !== "string" || !isBase64Url32(token)) {
    return chargeInvalid(store, gate, invalidHandoff);
  }

  const id = randomUUID();
  const csrfToken = randomBase64Url32();
  const expiresAt = new Date(Date.now() + MANAGEMENT_SESSION_TTL_MS).toISOString();
  let redeemed: Awaited<ReturnType<BenchmarkStore["redeemManagementHandoff"]>>;
  try {
    redeemed = await store.redeemManagementHandoff(handoffId, hashHandoffToken(token), {
      id, csrf_token_hash: hashCsrfToken(csrfToken), expires_at: expiresAt,
    });
  } catch {
    return managementUnavailable();
  }
  if (redeemed.outcome === "deleted") return serviceError(410, "submission_deleted", "This benchmark has been deleted.");
  if (redeemed.outcome === "invalid") return chargeInvalid(store, gate, invalidHandoff);

  return Response.json(
    { id, csrf_token: csrfToken },
    { headers: { "cache-control": "no-store", "set-cookie": buildManagementCookie(id, signManagementSessionId(mgmtSecret, id)) } },
  );
}

function isBase64Url32(value: string): boolean {
  try {
    assertBase64Url32(value);
    return true;
  } catch {
    return false;
  }
}

function invalidHandoff(): Response {
  return serviceError(401, "ownership_missing", "Handoff is invalid or expired.");
}

import { mintUploadPermit, ownerHashMatches, parseOwnerBearer, permitExpiryForSession } from "@/lib/permits";
import { serviceError, unavailable } from "@/lib/errors";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * GET /v1/upload-sessions/<id> with owner proof returns
 * {status:'pending'|'verified'|'expired',expires_at,permit?}. The permit is
 * deterministic for the stored session binding (min(session expiry,
 * verified_at + 5min)), so repeated polling returns the identical value while
 * valid, tolerating response loss. Verified sessions expire too: once the
 * bound expiry passes, polling reports expired and acceptance rejects.
 */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  let ownerSecret: string;
  try {
    ownerSecret = parseOwnerBearer(request.headers.get("authorization"));
  } catch {
    return serviceError(401, "ownership_missing", "Owner proof is required.");
  }
  const now = Date.now();
  let session: Awaited<ReturnType<BenchmarkStore["getUploadSession"]>>;
  try {
    session = await getStore().getUploadSession(id, now);
  } catch {
    // An unreachable store is an availability problem, not a missing session:
    // a 404 or a 500 here would end a publish the client could have retried.
    return unavailable("Service unavailable.");
  }
  if (!session) return serviceError(404, "not_found", "Upload session not found.");
  if (!ownerHashMatches(ownerSecret, session.owner_hash)) {
    return serviceError(403, "ownership_missing", "Owner proof does not match this session.");
  }
  if (session.status !== "verified" || !session.verified_at) {
    return Response.json(
      { status: session.status, expires_at: session.expires_at },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const permitExpiresAtMs = permitExpiryForSession(Date.parse(session.expires_at), Date.parse(session.verified_at));
  if (permitExpiresAtMs <= now) {
    return Response.json(
      { status: "expired", expires_at: session.expires_at },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const permitSecret = process.env["PERMIT_HMAC_SECRET"];
  if (!permitSecret) return serviceError(503, "service_unavailable", "Publishing is not configured.", 60);
  const { permit } = mintUploadPermit({
    permitSecret, sessionId: session.session_id, submissionId: session.submission_id,
    bodySha256: session.body_sha256, ownerHash: session.owner_hash, expiresAtMs: permitExpiresAtMs,
  });
  return Response.json(
    { status: "verified", expires_at: session.expires_at, permit },
    { headers: { "cache-control": "no-store" } },
  );
}

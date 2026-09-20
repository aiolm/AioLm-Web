import { serviceError, unavailable } from "@/lib/errors";
import { BoundedBodyError, SMALL_JSON_MAX_BYTES, readBoundedJson } from "@/lib/request";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";
import { verifyTurnstileToken } from "@/server/turnstile";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * POST /v1/upload-sessions/<id>/verify body {token}; called by the website
 * Turnstile page. Server siteverify checks hostname/action benchmark_publish.
 * Session completion discloses neither owner credential nor benchmark body.
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  let parsed: unknown;
  try {
    ({ parsed } = await readBoundedJson(request, SMALL_JSON_MAX_BYTES));
  } catch (err) {
    if (err instanceof BoundedBodyError) return serviceError(413, "payload_too_large", "Verification request is too large.");
    return serviceError(400, "invalid_request", "Invalid JSON body.");
  }
  const token = (parsed as { token?: unknown })?.token;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    return serviceError(400, "verification_required", "A valid verification token is required.");
  }
  let store: BenchmarkStore;
  let session: Awaited<ReturnType<BenchmarkStore["getUploadSession"]>>;
  try {
    store = getStore();
    session = await store.getUploadSession(id);
  } catch {
    return unavailable("Service unavailable.");
  }
  if (!session) return serviceError(404, "not_found", "Upload session not found.");
  if (session.status === "expired") return serviceError(410, "verification_expired", "Verification session expired.");
  if (session.status === "verified") return Response.json({ status: "verified" }, { headers: { "cache-control": "no-store" } });

  const expectedAction = process.env["TURNSTILE_VERIFY_ACTION"] ?? "benchmark_publish";
  let result: { ok: boolean; errorCodes?: string[] };
  try {
    result = await verifyTurnstileToken({ token, expectedAction });
  } catch {
    return serviceError(503, "service_unavailable", "Verification is not configured.", 60);
  }
  if (!result.ok) {
    return serviceError(403, "verification_required", "Verification failed. Please try again.");
  }
  let updated: Awaited<ReturnType<BenchmarkStore["markSessionVerified"]>>;
  try {
    updated = await store.markSessionVerified(id);
  } catch {
    return unavailable("Service unavailable.");
  }
  if (!updated) return serviceError(410, "verification_expired", "Verification session expired.");
  return Response.json({ status: "verified" }, { headers: { "cache-control": "no-store" } });
}

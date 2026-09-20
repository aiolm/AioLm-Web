import { serviceError, unavailable } from "@/lib/errors";
import { getClientIp, quotaKeyForIp, quotaWindowHour } from "@/lib/ip";
import { validateReportReason } from "@/lib/validation";
import { BoundedBodyError, SMALL_JSON_MAX_BYTES, readBoundedJson } from "@/lib/request";
import { logRequest } from "@/server/logging";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";
import { quotaConfigFromEnv } from "@/lib/env";
import { verifyTurnstileToken } from "@/server/turnstile";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * POST /v1/benchmark-runs/<id>/reports body {reason,token}; bounded 2000 chars
 * and server Turnstile validation (action benchmark_report); rate-limited.
 * Missing, hidden, and deleted records all return 404 (no existence oracle).
 */
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const started = Date.now();
  const { id } = await ctx.params;
  let parsed: unknown;
  try {
    ({ parsed } = await readBoundedJson(request, SMALL_JSON_MAX_BYTES));
  } catch (err) {
    if (err instanceof BoundedBodyError) return serviceError(413, "payload_too_large", "Report is too large.");
    return serviceError(400, "invalid_request", "Invalid JSON body.");
  }
  const record = parsed as { reason?: unknown; token?: unknown };
  let reason: string;
  try {
    reason = validateReportReason(record.reason);
  } catch (err) {
    return serviceError(400, "invalid_request", err instanceof Error ? err.message : "Invalid report reason.");
  }
  if (typeof record.token !== "string" || record.token.length === 0) {
    return serviceError(400, "verification_required", "A valid verification token is required.");
  }
  let store: BenchmarkStore;
  let run: Awaited<ReturnType<BenchmarkStore["getRunByPublicId"]>>;
  try {
    store = getStore();
    run = await store.getRunByPublicId(id);
  } catch {
    return unavailable("Service unavailable.");
  }
  if (!run || run.deleted || run.hidden) return serviceError(404, "not_found", "Benchmark not found.");

  const ip = getClientIp(request.headers);
  const quotaSecret = process.env["QUOTA_HMAC_SECRET"] ?? null;
  const config = quotaConfigFromEnv();
  if (!ip || !quotaSecret) {
    return serviceError(429, "rate_limited", "Too many reports. Try again later.", 60);
  }
  let gate: { allowed: boolean; retryAfterSec: number };
  try {
    gate = await store.quotaGateAtomic(
      quotaKeyForIp(quotaSecret, ip, "report", quotaWindowHour(Date.now())),
      3600_000,
      config.reportPerHourIp,
    );
  } catch {
    // An unenforceable budget must not let the report through unaccounted.
    return unavailable("Service unavailable.");
  }
  if (!gate.allowed) {
    return serviceError(429, "rate_limited", "Too many reports. Try again later.", gate.retryAfterSec);
  }

  try {
    const result = await verifyTurnstileToken({ token: record.token, expectedAction: process.env["TURNSTILE_REPORT_ACTION"] ?? "benchmark_report" });
    if (!result.ok) return serviceError(403, "verification_required", "Verification failed. Please try again.");
  } catch {
    return serviceError(503, "service_unavailable", "Verification is not configured.", 60);
  }

  const reporterHmac = quotaKeyForIp(quotaSecret, ip, "report", "static");
  try {
    await store.createReport({ target_submission_id: run.submission_id, reason, reporter_ip_hmac: reporterHmac });
  } catch {
    // 202 would tell the reporter their report was accepted when it was not.
    return unavailable("Service unavailable.");
  }
  logRequest({ route: "POST /v1/benchmark-runs/[id]/reports", method: "POST", status: 202, ms: Date.now() - started, bytesIn: reason.length });
  return Response.json({ accepted: true }, { status: 202, headers: { "cache-control": "no-store" } });
}

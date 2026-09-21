import { DiscoveryQueryError } from "@/lib/benchmark-discovery";
import { parsePublicationSnapshot, utf8ByteLength } from "@aiolm/benchmark-contracts";
import { randomPublicId, sha256Hex } from "@/lib/crypto";
import { capacityConfigFromEnv, getServiceOrigin, quotaConfigFromEnv } from "@/lib/env";
import { rateLimited, serviceError, unavailable } from "@/lib/errors";
import { getClientIp } from "@/lib/ip";
import { clampListLimit, decodeDiscoveryCursor } from "@/lib/pagination";
import { ownerHashFor, parseOwnerBearer } from "@/lib/permits";
import { BoundedBodyError, PUBLICATION_MAX_BYTES, readBoundedBytes, decodeUtf8Fatal } from "@/lib/request";
import { parseFilters, summarizeBenchmark } from "@/lib/summary";
import { logCapacityWarn, logRequest } from "@/server/logging";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * POST /v1/benchmark-runs accepts wrapper or legacy body. Hashes EXACT incoming
 * request bytes. Under a submission anchor lock, same ID+owner+body returns the
 * existing receipt 200 even without a fresh permit or quota; wrong owner is
 * rejected; changed body 409s; deleted submission with correct owner 410s.
 * New creation validates the permit and consumes it, writes run+chunks, and
 * charges all quotas in ONE transaction, returning 201. Duplicate replay never
 * edits the description or recreates deleted data.
 */
export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBytes(request, PUBLICATION_MAX_BYTES + 1);
  } catch (err) {
    if (err instanceof BoundedBodyError) {
      return serviceError(413, "payload_too_large", "Publication request exceeds 4MiB.");
    }
    return unavailable("Service unavailable.");
  }
  if (bytes.byteLength > PUBLICATION_MAX_BYTES) {
    return serviceError(413, "payload_too_large", "Publication request exceeds 4MiB.");
  }
  let raw: string;
  try {
    raw = decodeUtf8Fatal(bytes);
  } catch {
    return serviceError(400, "invalid_request", "Publication request must be UTF-8 JSON.");
  }
  try {
    let ownerSecret: string;
    try {
      ownerSecret = parseOwnerBearer(request.headers.get("authorization"));
    } catch {
      return serviceError(401, "ownership_missing", "Owner proof is required.");
    }
    const permit = request.headers.get("x-upload-permit")?.trim() || null;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? null;

    let parsed: ReturnType<typeof parsePublicationSnapshot>;
    try {
      parsed = parsePublicationSnapshot(raw);
    } catch (err) {
      return serviceError(400, "invalid_request", err instanceof Error ? err.message : "Invalid publication request.");
    }
    const measurements = parsed.benchmark.measurements;
    if (measurements.status !== "complete" || measurements.rows.length === 0 || measurements.rows.some(row => row.failed)) {
      return serviceError(400, "invalid_request", "Only completed benchmarks with successful measurements can be published.");
    }
    const submissionId = parsed.benchmark.submission_id;
    if (idempotencyKey !== null && idempotencyKey !== submissionId) {
      return serviceError(400, "invalid_request", "Idempotency-Key must equal benchmark.submission_id.");
    }
    const bodySha = sha256Hex(bytes);
    const ownerHash = ownerHashFor(ownerSecret);
    const permitSecret = process.env["PERMIT_HMAC_SECRET"] ?? null;
    const quotaSecret = process.env["QUOTA_HMAC_SECRET"] ?? null;
    if (!permitSecret || !quotaSecret) return unavailable("Publishing is not configured.");
    const ip = getClientIp(request.headers);
    if (!ip) {
      return rateLimited("Client address unavailable. Try again shortly.", 60);
    }
    // Deployed configuration must define the service origin; fail closed otherwise.
    try {
      getServiceOrigin();
    } catch {
      return unavailable("Publishing is not configured.");
    }

    const store = getStore();
    const summary = summarizeBenchmark(parsed.benchmark);
    const benchmarkMeta = { ...parsed.benchmark, measurements: { ...parsed.benchmark.measurements, rows: [] } };
    const outcome = await store.acceptRunAtomic({
      submission_id: submissionId,
      public_id: randomPublicId(),
      owner_hash: ownerHash,
      body_sha256: bodySha,
      benchmarkMeta,
      rows: parsed.benchmark.measurements.rows,
      description_md: parsed.description_md,
      summary,
      byte_size: bytes.byteLength,
      row_count: parsed.benchmark.measurements.rows.length,
      permit,
      permitSecret,
      quotaSecret,
      ip,
      nowMs: Date.now(),
      quota: quotaConfigFromEnv(),
      capacity: capacityConfigFromEnv(),
    });

    switch (outcome.outcome) {
      case "created": {
        if (outcome.capacityWarn) logCapacityWarn(usageHint(outcome.run.byte_size, outcome.run.row_count));
        const receipt = { submission_id: submissionId, id: outcome.run.public_id };
        if (utf8ByteLength(JSON.stringify(receipt)) > 16 * 1024) {
          return serviceError(500, "internal_error", "Receipt overflow.");
        }
        logRequest({ route: "POST /v1/benchmark-runs", method: "POST", status: 201, ms: Date.now() - started, bytesIn: bytes.byteLength });
        return Response.json(receipt, { status: 201, headers: { "cache-control": "no-store" } });
      }
      case "replay":
        return Response.json(
          { submission_id: submissionId, id: outcome.run.public_id },
          { status: 200, headers: { "cache-control": "no-store" } },
        );
      case "conflict-owner":
        return serviceError(403, "ownership_missing", "Owner proof does not match this submission.");
      case "conflict-body":
        return serviceError(409, "body_mismatch", "This submission id already exists with different content.");
      case "deleted":
        return serviceError(410, "submission_deleted", "This submission was deleted.");
      case "no-session":
      case "bad-permit":
        return serviceError(403, "verification_required", "A fresh upload permit is required.");
      case "quota":
        return rateLimited(`Upload budget reached (${outcome.limit}).`, outcome.retryAfterSec);
      case "capacity":
        return serviceError(503, "service_unavailable", outcome.message, 300);
    }
  } catch {
    return unavailable("Service unavailable.");
  }
}

function usageHint(byteSize: number, rowCount: number): string {
  return `accepted bytes=${byteSize} rows=${rowCount}`;
}

/**
 * GET /v1/benchmark-runs returns {items,next_cursor} with keyset pagination
 * (default 25, max 100), validated discovery filters and stable sort choices.
 * Items carry public fields only: no submission ids, no owner info.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limit = clampListLimit(url.searchParams.get("limit"));
    const filters = parseFilters(url.searchParams);
    const cursor = decodeDiscoveryCursor(url.searchParams.get("cursor"), filters);
    const result = await getStore().listRuns(filters, limit, cursor);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DiscoveryQueryError) return serviceError(400, "invalid_request", error.message);
    return unavailable("Service unavailable.");
  }
}

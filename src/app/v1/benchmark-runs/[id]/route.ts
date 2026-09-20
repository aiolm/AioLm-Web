import { serviceError, unavailable } from "@/lib/errors";
import { ownerHashMatches, parseOwnerBearer } from "@/lib/permits";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";
import { isOwnerOrMutationSession, managedSubmissionForRead } from "@/server/auth-helpers";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** GET /v1/benchmark-runs/<public id> — public metadata/summary/description/revision. No owner info, no submission id. */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  let store: BenchmarkStore;
  let run: Awaited<ReturnType<BenchmarkStore["getRunByPublicId"]>>;
  try {
    store = getStore();
    run = await store.getRunByPublicId(id);
  } catch {
    return unavailable("Service unavailable.");
  }
  if (!run || run.deleted) return serviceError(404, "not_found", "Benchmark not found.");
  if (run.hidden) {
    let allowed: boolean;
    try {
      allowed = await canSeeHidden(request, store, run.submission_id, run.owner_hash);
    } catch {
      // Cannot establish visibility, so cannot safely reveal a hidden record.
      return unavailable("Service unavailable.");
    }
    if (!allowed) return serviceError(404, "not_found", "Benchmark not found.");
  }
  const benchmark = run.benchmark as {
    environment?: unknown; measurements?: { status?: unknown };
    model?: unknown; runtime?: unknown; workload?: unknown; execution?: unknown; app_version?: unknown; method?: unknown;
  };
  return Response.json(
    {
      id: run.public_id,
      benchmark: {
        model: benchmark.model,
        runtime: benchmark.runtime,
        workload: benchmark.workload,
        environment: benchmark.environment,
        execution: benchmark.execution,
        method: benchmark.method,
        app_version: benchmark.app_version,
        status: benchmark.measurements?.status ?? null,
      },
      summary: run.summary,
      description_md: run.description_md,
      revision: run.revision,
      created_at: run.created_at,
      updated_at: run.updated_at,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** DELETE /v1/benchmark-runs/<public id> — owner proof or authorized mutation session required. */
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  let store: BenchmarkStore;
  let run: Awaited<ReturnType<BenchmarkStore["getRunByPublicId"]>>;
  let authorized: boolean;
  try {
    store = getStore();
    run = await store.getRunByPublicId(id);
  } catch {
    return unavailable("Service unavailable.");
  }
  if (!run) return serviceError(404, "not_found", "Benchmark not found.");

  try {
    authorized = await isOwnerOrMutationSession(request, store, run.submission_id, run.owner_hash);
  } catch {
    // Never answer 403 because the store was unreachable: that reads as a
    // rejected owner and would send a legitimate owner to recover a code.
    return unavailable("Service unavailable.");
  }
  if (!authorized) return serviceError(403, "ownership_missing", "Owner proof or management session is required.");
  if (run.deleted) return serviceError(410, "submission_deleted", "This submission was deleted.");

  try {
    await store.deleteRun(run.submission_id);
  } catch {
    // 204 would claim a deletion that did not happen.
    return unavailable("Service unavailable.");
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

async function canSeeHidden(
  request: Request, store: ReturnType<typeof getStore>, submissionId: string, ownerHash: string,
): Promise<boolean> {
  try {
    const secret = parseOwnerBearer(request.headers.get("authorization"));
    if (ownerHashMatches(secret, ownerHash)) return true;
  } catch {
    // fall through to cookie session
  }
  // Read visibility only: a valid cookie session for this record. Mutations
  // always go through requireMutationSession (Origin + CSRF), never this path.
  return (await managedSubmissionForRead(request, store)) === submissionId;
}

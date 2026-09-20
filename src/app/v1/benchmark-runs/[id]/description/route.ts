import { validateDescriptionMd } from "@aiolm/benchmark-contracts";
import { serviceError, unavailable } from "@/lib/errors";
import { BoundedBodyError, SMALL_JSON_MAX_BYTES, readBoundedJson } from "@/lib/request";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";
import { isOwnerOrMutationSession } from "@/server/auth-helpers";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /v1/benchmark-runs/<public id>/description body {description_md,expected_revision};
 * owner proof or authorized mutation session (exact Origin + CSRF); conflict 409.
 * Description edits never unhide.
 */
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  let parsed: unknown;
  try {
    ({ parsed } = await readBoundedJson(request, SMALL_JSON_MAX_BYTES));
  } catch (err) {
    if (err instanceof BoundedBodyError) return serviceError(413, "payload_too_large", "Description update is too large.");
    return serviceError(400, "invalid_request", "Invalid JSON body.");
  }
  const record = parsed as { description_md?: unknown; expected_revision?: unknown };
  let descriptionMd: string;
  try {
    descriptionMd = validateDescriptionMd(record.description_md);
  } catch (err) {
    return serviceError(400, "invalid_request", err instanceof Error ? err.message : "Invalid description.");
  }
  if (typeof record.expected_revision !== "number" || !Number.isSafeInteger(record.expected_revision)) {
    return serviceError(400, "invalid_request", "expected_revision is required.");
  }

  let store: BenchmarkStore;
  let run: Awaited<ReturnType<BenchmarkStore["getRunByPublicId"]>>;
  try {
    store = getStore();
    run = await store.getRunByPublicId(id);
  } catch {
    return unavailable("Service unavailable.");
  }
  if (!run || run.deleted) {
    if (run?.deleted) return serviceError(410, "submission_deleted", "This submission was deleted.");
    return serviceError(404, "not_found", "Benchmark not found.");
  }
  let authorized: boolean;
  try {
    authorized = await isOwnerOrMutationSession(request, store, run.submission_id, run.owner_hash);
  } catch {
    // An unreachable store is not a rejected owner: 403 would be a lie.
    return unavailable("Service unavailable.");
  }
  if (!authorized) return serviceError(403, "ownership_missing", "Owner proof or management session is required.");

  let updated: Awaited<ReturnType<BenchmarkStore["updateDescription"]>>;
  try {
    updated = await store.updateDescription(run.submission_id, descriptionMd, record.expected_revision);
  } catch {
    // 409 would send the owner to reload against a revision nobody could read.
    return unavailable("Service unavailable.");
  }
  if (!updated) return serviceError(409, "revision_conflict", "The description changed. Reload and retry.");
  return Response.json(
    { id: updated.public_id, revision: updated.revision, updated_at: updated.updated_at },
    { headers: { "cache-control": "no-store" } },
  );
}

import { serviceError, unavailable } from "@/lib/errors";
import { decodeRowsCursor, encodeRowsCursor, ROWS_PAGE_SIZE, ROWS_MAX_TOTAL } from "@/lib/pagination";
import type { BenchmarkStore } from "@/server/repository";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** GET /v1/benchmark-runs/<id>/measurements returns {rows,next_cursor,total}. Rows page in chunks of 1000, at most 10000. */
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const offset = decodeRowsCursor(url.searchParams.get("cursor"));
  const limit = Math.min(ROWS_PAGE_SIZE, ROWS_MAX_TOTAL - offset);
  let run: Awaited<ReturnType<BenchmarkStore["getRunByPublicId"]>>;
  let slice: Awaited<ReturnType<BenchmarkStore["getRowSlice"]>>;
  let store: BenchmarkStore;
  try {
    store = getStore();
    run = await store.getRunByPublicId(id);
  } catch {
    return unavailable("Service unavailable.");
  }
  if (!run || run.deleted || run.hidden) return serviceError(404, "not_found", "Benchmark not found.");
  try {
    slice = await store.getRowSlice(run.submission_id, offset, limit);
  } catch {
    return unavailable("Service unavailable.");
  }
  return Response.json(
    { rows: slice.rows, next_cursor: slice.nextOffset === null ? null : encodeRowsCursor(slice.nextOffset), total: slice.total },
    { headers: { "cache-control": "no-store" } },
  );
}

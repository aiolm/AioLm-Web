import { serviceError, unavailable } from "@/lib/errors";
import { normalizeModelInfo } from "@/lib/model-info";
import { lookupHuggingFaceModelInformation } from "@/server/huggingface-model-information";
import type { StoredRun } from "@/server/repository";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Later public catalog evidence, kept separate from the frozen benchmark. */
export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  let run: StoredRun | null;
  try {
    run = await getStore().getRunByPublicId(id);
  } catch {
    return unavailable("Service unavailable.");
  }
  // Never allow owner credentials to bypass moderation on this public lookup.
  if (!run || run.deleted || run.hidden) return serviceError(404, "not_found", "Benchmark not found.");
  const benchmark = run.benchmark;
  const info = normalizeModelInfo(benchmark);
  const result = await lookupHuggingFaceModelInformation({
    sha256: benchmark.model.sha256,
    size_bytes: benchmark.model.size_bytes,
    name: info?.name ?? null,
    repository: info?.repository ?? null,
    format: benchmark.schema_version === 1 ? "gguf" : benchmark.model.format ?? null,
  });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}

import { cache } from 'react';
import { getStore } from './store';

/** Request-scoped only: moderation changes must never sit in a shared page cache. */
export const getPublicBenchmark = cache(async (id: string) => {
  const run = await getStore().getRunByPublicId(id);
  if (!run || run.deleted) return { state: 'missing' as const };
  // Preserve the existing authenticated client view without exposing hidden data in HTML.
  if (run.hidden) return { state: 'hidden' as const };
  const b = run.benchmark;
  return { state: 'public' as const, data: {
    id: run.public_id,
    benchmark: { model: b.model, runtime: b.runtime, workload: b.workload, environment: b.environment, execution: b.execution, method: b.method, app_version: b.app_version, status: b.measurements?.status ?? null },
    summary: run.summary, description_md: run.description_md, revision: run.revision,
    created_at: run.created_at, updated_at: run.updated_at,
  } };
});

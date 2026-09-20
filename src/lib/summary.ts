import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";

/**
 * Summary and filter columns computed once at acceptance. Public list filters
 * are model/hardware/method/workload; no combined leaderboard is presented.
 */
export interface BenchmarkSummary {
  model_label: string;
  hardware_label: string;
  method_label: string;
  workload_label: string;
  corpus: string;
  row_count: number;
  failed_rows: number;
  status: string;
  mean_tg_tps: number | null;
  mean_e2e_ms: number | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeBenchmark(benchmark: PublicBenchmarkSubmission): BenchmarkSummary {
  const rows = benchmark.measurements.rows;
  const tg = rows.map((r) => r.tg_tps).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const e2e = rows.map((r) => r.e2e_ms).filter((v) => Number.isFinite(v));
  const modelLabel =
    benchmark.model.status === "sha256" && benchmark.model.sha256
      ? `sha256:${benchmark.model.sha256.slice(0, 12)}`
      : benchmark.model.status;
  const gpus = benchmark.environment?.execution.selected_gpus ?? benchmark.environment?.installed_gpus ?? [];
  const hardwareLabel =
    gpus.length > 0
      ? gpus.map((g) => g.name ?? g.vendor ?? "gpu").join(" + ")
      : (benchmark.environment?.execution.mode ?? "unknown");
  return {
    model_label: modelLabel,
    hardware_label: hardwareLabel,
    method_label: benchmark.method ? `${benchmark.method.id}@${benchmark.method.version}` : "unknown",
    workload_label: `${benchmark.workload.corpus}`,
    corpus: benchmark.workload.corpus,
    row_count: rows.length,
    failed_rows: rows.filter((r) => r.failed).length,
    status: benchmark.measurements.status,
    mean_tg_tps: mean(tg),
    mean_e2e_ms: mean(e2e),
  };
}

/** Filter values for list queries: model/hardware/method/workload substring match. */
export interface BenchmarkFilters {
  model?: string;
  hardware?: string;
  method?: string;
  workload?: string;
}

export function parseFilters(search: URLSearchParams): BenchmarkFilters {
  const out: BenchmarkFilters = {};
  for (const key of ["model", "hardware", "method", "workload"] as const) {
    const v = search.get(key)?.trim();
    if (v) out[key] = v.slice(0, 120);
  }
  return out;
}

import { normalizePromptLengths, normalizeSetup, selectedExecutionGpus, type BenchmarkSetup } from "./benchmark-discovery";
export { parseFilters, type BenchmarkFilters } from "./benchmark-discovery";
import { summarizePoints, type BenchmarkPoint } from "./benchmark-points";
export { type BenchmarkPoint } from "./benchmark-points";
import { modelLabelFor, normalizeModelInfo, type BenchmarkModelInfo } from "./model-info";
export { normalizeModelInfo, type BenchmarkModelInfo } from "./model-info";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";

/**
 * Public summary and execution metadata computed once at acceptance.
 * Measurement rows remain in separately paged storage.
 */
export interface BenchmarkSummary {
  setup?: BenchmarkSetup;
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
  /** Configured input lengths, ascending and deduplicated. Absent on summaries stored before migration 009. */
  prompt_lengths?: number[];
  /** Prefill throughput mean over the rows that measured it. Absent on summaries stored before migration 009. */
  mean_pp_tps?: number | null;
  /**
   * Per-operating-point aggregates, ascending by input length then concurrency.
   * This is what the pages read: the three mean_* fields above average across
   * input lengths and concurrencies at once, which describes no configuration
   * that ran, so they are kept for stored results but are no longer displayed
   * or sorted on. Absent on summaries stored before migration 012.
   */
  points?: BenchmarkPoint[];
  /** True when the run measured more points than POINT_LIMIT and the stored list was cut. */
  points_truncated?: boolean;
  /**
   * Model metadata exactly as submitted. Absent on summaries stored before
   * migration 010 and null when the submission described no model, so a reader
   * can tell "never recorded" from a described model with unknown fields.
   */
  model_info?: BenchmarkModelInfo | null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function summarizeBenchmark(benchmark: PublicBenchmarkSubmission): BenchmarkSummary {
  const rows = benchmark.measurements.rows.filter(row => !row.failed);
  const tg = rows.map((r) => r.tg_tps).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const e2e = rows.map((r) => r.e2e_ms).filter((v) => Number.isFinite(v));
  // Prefill is only measured on rows that ran: a failed row reports no throughput,
  // and averaging it in would understate every result that recovered around it.
  const pp = rows.filter((r) => !r.failed).map((r) => r.pp_tps).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const modelInfo = normalizeModelInfo(benchmark);
  // Points read every row the run published, failed ones included, because the
  // grouping itself decides what each row belongs to and drops the failures.
  const measured = summarizePoints(benchmark.measurements.rows);
  const gpus = selectedExecutionGpus(benchmark);
  const hardwareLabel =
    gpus.length > 0
      ? gpus.map((g) => g.name ?? g.vendor ?? "gpu").join(" + ")
      : (benchmark.environment?.execution.mode ?? "unknown");
  return {
    setup: normalizeSetup(benchmark),
    model_label: modelLabelFor(benchmark, modelInfo),
    hardware_label: hardwareLabel,
    method_label: benchmark.method ? `${benchmark.method.id}@${benchmark.method.version}` : "unknown",
    workload_label: `${benchmark.workload.corpus}`,
    corpus: benchmark.workload.corpus,
    row_count: rows.length,
    failed_rows: rows.filter((r) => r.failed).length,
    status: benchmark.measurements.status,
    mean_tg_tps: mean(tg),
    mean_e2e_ms: mean(e2e),
    prompt_lengths: normalizePromptLengths(benchmark.workload.prompt_lengths),
    mean_pp_tps: mean(pp),
    points: measured.points,
    points_truncated: measured.truncated,
    model_info: modelInfo,
  };
}

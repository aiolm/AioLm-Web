import { normalizePromptLengths, normalizeSetup, selectedExecutionGpus, type BenchmarkSetup } from "./benchmark-discovery";
export { parseFilters, type BenchmarkFilters } from "./benchmark-discovery";
import { summarizePoints, summarizeServingPoints, type BenchmarkPoint, type ServingBenchmarkPoint } from "./benchmark-points";
export { type BenchmarkPoint, type ServingBenchmarkPoint } from "./benchmark-points";
import { modelLabelFor, normalizeModelInfo, type BenchmarkModelInfo } from "./model-info";
export { normalizeModelInfo, type BenchmarkModelInfo } from "./model-info";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import { formatGpuLabels } from "./gpu-labels";

/** Raw accepted identity: exactly the generated-column projection, never display parsing. */
export type BenchmarkIdentity = {
  engine_name: string | null;
  engine_version: string | null;
  engine_variant: string | null;
  engine_build: string | null;
  engine_plugin_version: string | null;
  model_format: string | null;
  model_sha256: string | null;
  model_size_bytes: number | null;
  model_repository: string | null;
  model_revision: string | null;
  app_version: string | null;
  method_id: string | null;
  method_version: number | null;
};

export function normalizeIdentity(benchmark: PublicBenchmarkSubmission): BenchmarkIdentity {
  const source = benchmark.schema_version === 3 ? benchmark.model.source : undefined;
  return {
    engine_name: benchmark.runtime.name,
    engine_version: benchmark.runtime.version,
    engine_variant: benchmark.runtime.variant ?? null,
    engine_build: benchmark.runtime.build,
    engine_plugin_version: benchmark.runtime.plugin_version ?? null,
    model_format: benchmark.schema_version === 1 ? "gguf" : benchmark.model.format ?? null,
    model_sha256: benchmark.model.sha256,
    model_size_bytes: benchmark.model.size_bytes,
    model_repository: source?.repository ?? benchmark.model.metadata?.repository ?? null,
    model_revision: source?.revision ?? null,
    app_version: benchmark.app_version,
    method_id: benchmark.method?.id ?? null,
    method_version: benchmark.method?.version ?? null,
  };
}

/** Enrich old stored summaries on read only; preserve their labels, metrics and body. */
export function withCanonicalIdentity<T extends { summary: BenchmarkSummary }>(item: T, benchmark: PublicBenchmarkSubmission): T & { summary: BenchmarkSummary } {
  if (item.summary.identity !== undefined && item.summary.schema_version !== undefined) return item;
  return {
    ...item,
    summary: {
      ...item.summary,
      identity: item.summary.identity ?? normalizeIdentity(benchmark),
      schema_version: item.summary.schema_version ?? benchmark.schema_version,
    },
  };
}

/**
 * Public summary and execution metadata computed once at acceptance.
 * Measurement rows remain in separately paged storage.
 */
export interface BenchmarkSummary {
  schema_version?: 1 | 2 | 3;
  setup?: BenchmarkSetup;
  /** Absent only on older stored summaries; reconstructed from their own stored metadata on read. */
  identity?: BenchmarkIdentity;
  input_unit?: "utf8_bytes";
  /** Shared contract medians and per-metric samples, never legacy token measurements. */
  serving_points?: ServingBenchmarkPoint[];
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
  const modelInfo = normalizeModelInfo(benchmark);
  const gpus = selectedExecutionGpus(benchmark);
  const hardwareLabel = gpus.length > 0
    ? formatGpuLabels(gpus.map((g) => g.name ?? g.vendor ?? "gpu")).join(" + ")
    : (benchmark.environment?.execution.mode ?? "unknown");
  const common = {
    schema_version: benchmark.schema_version,
    identity: normalizeIdentity(benchmark),
    setup: normalizeSetup(benchmark),
    model_label: modelLabelFor(benchmark, modelInfo),
    hardware_label: hardwareLabel,
    method_label: benchmark.method ? `${benchmark.method.id}@${benchmark.method.version}` : "unknown",
    workload_label: benchmark.workload.corpus,
    corpus: benchmark.workload.corpus,
    status: benchmark.measurements.status,
    model_info: modelInfo,
  };
  if (benchmark.schema_version === 3) {
    return {
      ...common,
      input_unit: "utf8_bytes",
      serving_points: summarizeServingPoints(benchmark.measurements.rows),
      row_count: benchmark.measurements.rows.length,
      failed_rows: 0,
      mean_tg_tps: null,
      mean_e2e_ms: null,
      mean_pp_tps: null,
    };
  }
  const rows = benchmark.measurements.rows.filter(row => !row.failed);
  const tg = rows.map((r) => r.tg_tps).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const e2e = rows.map((r) => r.e2e_ms).filter((v) => Number.isFinite(v));
  // Prefill is only measured on rows that ran: a failed row reports no throughput,
  // and averaging it in would understate every result that recovered around it.
  const pp = rows.filter((r) => !r.failed).map((r) => r.pp_tps).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  // Points read every row the run published, failed ones included, because the
  // grouping itself decides what each row belongs to and drops the failures.
  const measured = summarizePoints(benchmark.measurements.rows);
  return {
    ...common,
    row_count: rows.length,
    failed_rows: 0,
    mean_tg_tps: mean(tg),
    mean_e2e_ms: mean(e2e),
    prompt_lengths: normalizePromptLengths(benchmark.workload.prompt_lengths),
    mean_pp_tps: mean(pp),
    points: measured.points,
    points_truncated: measured.truncated,
  };
}

import { normalizeSetup, selectedExecutionGpus, type BenchmarkSetup } from "./benchmark-discovery";
export { parseFilters, type BenchmarkFilters } from "./benchmark-discovery";
import { summarizeServingPoints, type ServingBenchmarkPoint } from "./benchmark-points";
export { type ServingBenchmarkPoint } from "./benchmark-points";
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
  const source = benchmark.model.source;
  return {
    engine_name: benchmark.runtime.name,
    engine_version: benchmark.runtime.version,
    engine_variant: benchmark.runtime.variant,
    engine_build: benchmark.runtime.build,
    engine_plugin_version: benchmark.runtime.plugin_version,
    model_format: benchmark.model.format,
    model_sha256: benchmark.model.sha256,
    model_size_bytes: benchmark.model.size_bytes,
    model_repository: source?.repository ?? benchmark.model.metadata?.repository ?? null,
    model_revision: source?.revision ?? null,
    app_version: benchmark.app_version,
    method_id: benchmark.method.id,
    method_version: benchmark.method.version,
  };
}

function withHostCpuLabel(label: string, benchmark: PublicBenchmarkSubmission): string {
  const cpu = benchmark.environment?.cpu.name;
  return label === "unknown" && cpu ? `Host CPU: ${cpu}` : label;
}

/**
 * Public summary and execution metadata computed once at acceptance.
 * Measurement rows remain in separately paged storage.
 */
export interface BenchmarkSummary {
  schema_version: 4;
  setup: BenchmarkSetup;
  identity: BenchmarkIdentity;
  input_unit: "utf8_bytes";
  /** Shared contract medians and per-metric samples, one per operating point. */
  serving_points: ServingBenchmarkPoint[];
  model_label: string;
  hardware_label: string;
  method_label: string;
  workload_label: string;
  corpus: string;
  row_count: number;
  failed_rows: number;
  status: string;
  /** Model metadata exactly as submitted; null when the submission described no model. */
  model_info: BenchmarkModelInfo | null;
}

export function summarizeBenchmark(benchmark: PublicBenchmarkSubmission): BenchmarkSummary {
  const modelInfo = normalizeModelInfo(benchmark);
  const gpus = selectedExecutionGpus(benchmark);
  const hardwareLabel = gpus.length > 0
    ? formatGpuLabels(gpus.map((g) => g.name ?? g.vendor ?? "gpu")).join(" + ")
    : (benchmark.environment?.execution.mode ?? "unknown");
  return {
    schema_version: benchmark.schema_version,
    identity: normalizeIdentity(benchmark),
    setup: normalizeSetup(benchmark),
    input_unit: "utf8_bytes",
    serving_points: summarizeServingPoints(benchmark.measurements.rows),
    model_label: modelLabelFor(benchmark, modelInfo),
    hardware_label: withHostCpuLabel(hardwareLabel, benchmark),
    method_label: `${benchmark.method.id}@${benchmark.method.version}`,
    workload_label: benchmark.workload.corpus,
    corpus: benchmark.workload.corpus,
    row_count: benchmark.measurements.rows.length,
    failed_rows: 0,
    status: benchmark.measurements.status,
    model_info: modelInfo,
  };
}

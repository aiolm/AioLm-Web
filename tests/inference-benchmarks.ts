import { syntheticSubmission } from "@/lib/fixtures";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";

export type PythonEngine = "vllm" | "mlx-vlm" | "vllm-metal";

/** Synthetic contract-v2 records; no real hardware, model or inference claims. */
export function pythonBenchmark(engine: PythonEngine, submissionId = syntheticSubmission().submission_id): PublicBenchmarkSubmission {
  const metal = engine === "vllm-metal";
  const benchmark = syntheticSubmission({
    schema_version: 2,
    submission_id: submissionId,
    method: { id: "cold-prompt-serving", version: 2 },
    model: { format: engine === "mlx-vlm" ? "mlx" : "hf-safetensors", status: "multipart", sha256: null, size_bytes: 1024 },
    runtime: {
      name: metal ? "vllm" : engine,
      version: engine === "mlx-vlm" ? "0.7.6" : metal ? "0.30.0" : "0.31.0",
      backend: engine === "vllm" ? "cuda" : "metal",
      build: null,
      ...(metal ? { variant: "vllm-metal", plugin_version: "0.30.0" } : {}),
    },
    execution: { context_size: 4096, parallel: 2, settings: null },
  });
  benchmark.measurements.rows[0] = { ...benchmark.measurements.rows[0], timing_source: "client", pp_tps: null };
  return benchmark;
}

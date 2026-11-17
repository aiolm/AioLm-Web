import { syntheticSubmission } from "@/lib/fixtures";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";

export type PythonEngine = "vllm" | "mlx-vlm" | "vllm-metal";

/** Synthetic @5 records for Python engines; no real hardware, model or inference claims. */
export function pythonBenchmark(engine: PythonEngine, submissionId = syntheticSubmission().submission_id): PublicBenchmarkSubmission {
  const metal = engine === "vllm-metal";
  return syntheticSubmission({
    submission_id: submissionId,
    model: { format: engine === "mlx-vlm" ? "mlx" : "hf-safetensors", status: "multipart", sha256: null, size_bytes: 1024 },
    runtime: {
      name: metal ? "vllm" : engine,
      version: engine === "mlx-vlm" ? "0.7.6" : metal ? "0.30.0" : "0.31.0",
      backend: engine === "vllm" ? "cuda" : "metal",
      build: null,
      variant: metal ? "vllm-metal" : null,
      plugin_version: metal ? "0.30.0" : null,
    },
  });
}

/** Same API measurements for arbitrary public names, including fully unknown identity. */
export function servingBenchmark(
  name: string | null = "sglang",
  submissionId = syntheticSubmission().submission_id,
): PublicBenchmarkSubmission {
  const benchmark = syntheticSubmission({ submission_id: submissionId });
  benchmark.runtime.name = name;
  if (name === null) {
    benchmark.runtime = { name: null, version: null, backend: null, build: null, variant: null, plugin_version: null };
  }
  return benchmark;
}

/** A source revision is provenance, not a content hash or model-format inference. */
export function sourcedServingBenchmark(name: string | null = "sglang"): PublicBenchmarkSubmission {
  const benchmark = servingBenchmark(name);
  benchmark.model = {
    format: "hf-safetensors", status: "multipart", sha256: null, size_bytes: 1024,
    source: { kind: "huggingface", repository: "synthetic-org/example-model", revision: "b".repeat(40) },
  };
  return benchmark;
}

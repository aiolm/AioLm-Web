import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import { RECOVERY_FIXTURE } from "@aiolm/benchmark-contracts";

/**
 * Synthetic fixtures for isolated local tests. NEVER enabled in production and
 * never derived from real user data. Guarded by SYNTHETIC_TEST_MODE=1 + NODE_ENV=test.
 */

export function isSyntheticTestMode(): boolean {
  return process.env["SYNTHETIC_TEST_MODE"] === "1" && process.env["NODE_ENV"] === "test";
}

export function syntheticSubmission(overrides: Partial<PublicBenchmarkSubmission> = {}): PublicBenchmarkSubmission {
  return {
    schema_version: 1,
    submission_id: "00000000-0000-4000-8000-000000000001",
    app_version: "0.0.0-synthetic",
    method: { id: "cold-prompt-serving", version: 1 },
    workload: {
      corpus: "code_python",
      corpus_version: 1,
      corpus_sha256: null,
      prompt_lengths: [512],
      generation_length: 128,
      batch_sizes: [1],
      repetitions: 1,
      warmup: false,
    },
    model: { status: "unidentified", sha256: null, size_bytes: null },
    runtime: { name: "llama.cpp", version: null, backend: null, build: null },
    environment: {
      os: "synthetic",
      arch: "x64",
      cpu: { name: "synthetic-cpu", logical_cores: 4 },
      installed_gpus: [],
      execution: { mode: "cpu", selected_gpus: [], selection_complete: true },
    },
    execution: { context_size: 2048, parallel: 1, settings: null },
    measurements: {
      status: "complete",
      rows: [
        {
          prompt_tokens: 512,
          generation_length: 128,
          concurrency: 1,
          repetition: 1,
          completion_tokens: 128,
          cached_tokens: 0,
          ttft_ms: 10,
          tpot_ms: 20,
          pp_tps: 100,
          tg_tps: 50,
          e2e_ms: 2560,
          total_tps: 60,
          peak_memory_bytes: null,
          timing_source: "server",
          failed: false,
        },
      ],
    },
    ...overrides,
  };
}

export function syntheticPublicationBody(submissionId = "00000000-0000-4000-8000-000000000001"): string {
  const benchmark = syntheticSubmission({ submission_id: submissionId });
  return JSON.stringify({ benchmark, description_md: "Synthetic description." });
}

export { RECOVERY_FIXTURE };

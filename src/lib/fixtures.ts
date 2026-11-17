import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import { RECOVERY_FIXTURE } from "@aiolm/benchmark-contracts";

/**
 * Synthetic fixtures for isolated local tests. NEVER enabled in production and
 * never derived from real user data. Guarded by SYNTHETIC_TEST_MODE=1 + NODE_ENV=test.
 */

/** Contract-valid openai-chat-serving@5 submission with optional usage intentionally missing. */
export function syntheticSubmission(overrides: Partial<PublicBenchmarkSubmission> = {}): PublicBenchmarkSubmission {
  return {
    schema_version: 4,
    submission_id: "00000000-0000-4000-8000-000000000001",
    app_version: "0.0.0-synthetic",
    method: { id: "openai-chat-serving", version: 5 },
    runtime: { name: "sglang", version: "0.5.0", backend: null, build: null, variant: "custom-safe-variant", plugin_version: null },
    model: { format: "unknown", status: "unidentified", sha256: null, size_bytes: null },
    workload: {
      corpus: "code_python", corpus_version: 2,
      inputs: [{ bytes: 4096, sha256: "a".repeat(64) }],
      max_output_tokens: 128, concurrencies: [1], repetitions: 1,
      warmup: false, request_usage: false, cache_policy: "cold_prompt",
      prompt_nonce: "0123456789abcdef0123456789abcdef",
    },
    environment: {
      scope: "aiolm_host", os: "synthetic", arch: "arm64",
      cpu: { name: "synthetic-cpu", logical_cores: 8, physical_cores: 4 },
      system_memory_bytes: 16 * 1024 ** 3,
      installed_gpus: [],
      execution: { mode: "cpu", selected_gpus: [], selection_complete: true },
    },
    execution: {
      topology: "attached", memory_scope: "unavailable",
      settings: [
        { target: "request", scope: [], name: "max_tokens", value: 128, unit: "tokens", role: null },
        { target: "request", scope: [], name: "stream", value: true, unit: null, role: null },
        { target: "request", scope: [], name: "temperature", value: 0, unit: null, role: null },
      ],
    },
    measurements: {
      status: "complete",
      rows: [{
        input_bytes: 4096, max_output_tokens: 128, concurrency: 1, repetition: 1,
        input_sha256_by_request: ["a".repeat(64)],
        first_output_ms: 20, e2e_ms: 200, output_bytes: 12,
        reported_prompt_tokens: null, reported_completion_tokens: null,
        prefill_tokens_per_second: null, decode_tokens_per_second: null, tpot_ms: null,
        usage_status: "missing", finish_reasons: ["stop"],
        peak_memory_bytes: null, timing_source: "client", failed: false,
      }],
    },
    ...overrides,
  };
}

export { RECOVERY_FIXTURE };

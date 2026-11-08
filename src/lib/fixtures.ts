import type { LegacyPublicBenchmarkSubmission, ServingPublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import { RECOVERY_FIXTURE } from "@aiolm/benchmark-contracts";

/**
 * Synthetic fixtures for isolated local tests. NEVER enabled in production and
 * never derived from real user data. Guarded by SYNTHETIC_TEST_MODE=1 + NODE_ENV=test.
 */

export function syntheticSubmission(overrides: Partial<LegacyPublicBenchmarkSubmission> = {}): LegacyPublicBenchmarkSubmission {
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

/** Contract-valid schema3 fixture for isolated tests, with optional usage intentionally missing. */
export function syntheticServingSubmission(overrides: Partial<ServingPublicBenchmarkSubmission> = {}): ServingPublicBenchmarkSubmission {
  return {
    schema_version: 3,
    submission_id: "00000000-0000-4000-8000-000000000003",
    app_version: "0.0.0-synthetic",
    method: { id: "openai-chat-serving", version: 1 },
    runtime: { name: "sglang", version: "0.5.0", backend: null, build: null, variant: "custom-safe-variant", plugin_version: null },
    model: { format: "unknown", status: "unidentified", sha256: null, size_bytes: null },
    workload: {
      corpus: "code_python", corpus_version: 1,
      inputs: [{ bytes: 4096, sha256: "a".repeat(64) }],
      max_output_tokens: 128, concurrencies: [1], repetitions: 1,
      warmup: false, request_usage: false, cache_policy: "as_configured",
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
        first_output_ms: 50, first_content_ms: 100, first_reasoning_ms: 50,
        e2e_ms: 200, content_bytes: 6, reasoning_bytes: 6, output_bytes: 12,
        reported_prompt_tokens: null, reported_completion_tokens: null, reported_cached_tokens: null,
        usage_status: "missing", finish_reasons: ["not_reported"],
        peak_memory_bytes: null, timing_source: "client", failed: false,
      }],
    },
    ...overrides,
  };
}

/**
 * Contract-valid openai-chat-serving@2 fixture: every request reports exactly the
 * fixed target. Synthetic evidence only; it describes no real model or engine.
 */
export function syntheticFixedOutputSubmission(target = 1024, overrides: Partial<ServingPublicBenchmarkSubmission> = {}): ServingPublicBenchmarkSubmission {
  const historical = syntheticServingSubmission();
  const concurrency = 2;
  return syntheticServingSubmission({
    submission_id: "00000000-0000-4000-8000-000000000004",
    method: { id: "openai-chat-serving", version: 2 },
    workload: { ...historical.workload, max_output_tokens: target, concurrencies: [concurrency], request_usage: true },
    execution: {
      ...historical.execution,
      // ASCII-sorted request identities, including the declared fixed-output control.
      settings: [
        { target: "request", scope: [], name: "ignore_eos", value: true, unit: null, role: null },
        { target: "request", scope: [], name: "max_tokens", value: target, unit: "tokens", role: null },
        { target: "request", scope: [], name: "stream", value: true, unit: null, role: null },
        { target: "request", scope: [], name: "stream_options.include_usage", value: true, unit: null, role: null },
        { target: "request", scope: [], name: "temperature", value: 0, unit: null, role: null },
      ],
    },
    measurements: {
      status: "complete",
      rows: [{
        input_bytes: 4096, max_output_tokens: target, concurrency, repetition: 1,
        first_output_ms: 50, first_content_ms: 50, first_reasoning_ms: null,
        e2e_ms: 4000, content_bytes: target * 8, reasoning_bytes: 0, output_bytes: target * 8,
        reported_prompt_tokens: null, reported_completion_tokens: target * concurrency, reported_cached_tokens: null,
        reported_completion_tokens_by_request: [target, target],
        usage_status: "partial", finish_reasons: ["length", "length"],
        peak_memory_bytes: null, timing_source: "client", failed: false,
      }],
    },
    ...overrides,
  });
}

export { RECOVERY_FIXTURE };

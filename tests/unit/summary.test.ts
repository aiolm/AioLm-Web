import { describe, expect, it } from "vitest";
import { SERVING_METRIC_KEYS, summarizeServingPoints, validatePublicBenchmark } from "@aiolm/benchmark-contracts";
import { syntheticSubmission } from "@/lib/fixtures";
import { normalizeIdentity, summarizeBenchmark } from "@/lib/summary";
import { servingBenchmark, sourcedServingBenchmark } from "../inference-benchmarks";

describe("canonical benchmark identity", () => {
  it.each(["llama.cpp", "vllm", "mlx-vlm", "sglang", null])("accepts and summarizes the same API fixture for %s", (name) => {
    const benchmark = servingBenchmark(name);
    const validated = validatePublicBenchmark(benchmark);
    const summary = summarizeBenchmark(validated);
    expect(summary.identity).toEqual({
      engine_name: name, engine_version: name === null ? null : "0.5.0",
      engine_variant: name === null ? null : "custom-safe-variant", engine_build: null,
      engine_plugin_version: null, model_format: "unknown", model_sha256: null,
      model_size_bytes: null, model_repository: null, model_revision: null,
      app_version: "0.0.0-synthetic", method_id: "openai-chat-serving", method_version: 5,
    });
    expect(summary.schema_version).toBe(4);
    expect(summary.method_label).toBe("openai-chat-serving@5");
    expect(summary.input_unit).toBe("utf8_bytes");
    expect(summary.serving_points).toEqual(summarizeServingPoints(benchmark.measurements.rows));
  });

  it("copies all thirteen raw identities without parsing display labels", () => {
    const benchmark = sourcedServingBenchmark();
    benchmark.runtime = { name: "new engine", version: "version 2", backend: "backend", build: "build 3", variant: "arbitrary", plugin_version: "plugin 4" };
    benchmark.model.size_bytes = 0;
    benchmark.app_version = "app 5";
    expect(normalizeIdentity(benchmark)).toEqual({
      engine_name: "new engine", engine_version: "version 2", engine_variant: "arbitrary",
      engine_build: "build 3", engine_plugin_version: "plugin 4", model_format: "hf-safetensors",
      model_sha256: null, model_size_bytes: 0, model_repository: "synthetic-org/example-model",
      model_revision: "b".repeat(40), app_version: "app 5", method_id: "openai-chat-serving", method_version: 5,
    });
  });

  it("stores exactly the single-method summary shape", () => {
    const summary = summarizeBenchmark(syntheticSubmission());
    expect(Object.keys(summary).sort()).toEqual([
      "corpus", "failed_rows", "hardware_label", "identity", "input_unit", "method_label", "model_info", "model_label",
      "row_count", "schema_version", "serving_points", "setup", "status", "workload_label",
    ]);
    expect(Object.keys(summary.serving_points[0]!).sort()).toEqual(["concurrency", "input_bytes", "max_output_tokens", "samples", ...SERVING_METRIC_KEYS].sort());
    for (const legacy of ["context_size", "parallel", "threads", "gpu_layers", "flash_attention", "cache_type_k", "cache_type_v", "split_mode", "prompt_length"]) {
      expect(summary.setup).not.toHaveProperty(legacy);
    }
  });
});

describe("API serving summary", () => {
  it("preserves configured workload maxima even when local rows only completed the smallest point", () => {
    const benchmark = syntheticSubmission();
    benchmark.workload.inputs.push({ bytes: 16384, sha256: "b".repeat(64) });
    benchmark.workload.concurrencies = [1, 2, 4];
    benchmark.workload.repetitions = 3;
    // Deliberately incomplete local data is not a public acceptance fixture.
    const summary = summarizeBenchmark(benchmark);
    expect(summary.setup).toMatchObject({
      max_input_bytes: 16384, max_concurrency: 4, max_output_tokens: 128,
      repetitions: 3, warmup: false, request_usage: false,
      inputs: benchmark.workload.inputs, corpus: "code_python", corpus_version: 2, cache_policy: "cold_prompt",
      prompt_nonce: "0123456789abcdef0123456789abcdef", concurrencies: [1, 2, 4],
    });
    expect(summary.serving_points.map((point) => [point.input_bytes, point.concurrency])).toEqual([[4096, 1]]);
  });

  it("retains generic settings including zero, false and unknown", () => {
    const benchmark = syntheticSubmission();
    benchmark.execution.settings.unshift(
      { target: "launch", scope: [], name: "disabled", value: false, unit: null, role: null },
      { target: "launch", scope: ["serve"], name: "unknown", value: null, unit: "tokens", role: "context.per_sequence_tokens" },
      { target: "launch", scope: ["serve"], name: "zero", value: 0, unit: "count", role: null },
    );
    const summary = summarizeBenchmark(validatePublicBenchmark(benchmark));
    expect(summary.setup.settings).toEqual(benchmark.execution.settings);
  });

  it("preserves host observations and does not report attached proxy memory as engine memory", () => {
    const benchmark = syntheticSubmission();
    benchmark.environment!.cpu = { name: "Host CPU", logical_cores: 16, physical_cores: 8 };
    benchmark.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [
      { name: "GPU", vendor: "Vendor", vram_mb: 0, driver: null, integrated: false },
    ] };
    expect(summarizeBenchmark(benchmark).setup).toMatchObject({
      cpu: "Host CPU", cores: 16, physical_cores: 8, ram_bytes: 16 * 1024 ** 3,
      gpus: ["GPU"], vendors: ["Vendor"], vram_mb: 0,
    });
    expect(summarizeBenchmark(benchmark).serving_points[0]!.peak_memory_bytes).toBeNull();
  });

  it("matches shared statistics and never puts a nonfinite derived rate into JSON", () => {
    const benchmark = syntheticSubmission();
    benchmark.workload.repetitions = 3;
    const base = benchmark.measurements.rows[0]!;
    benchmark.measurements.rows = [
      { ...base, repetition: 1, e2e_ms: 100 },
      { ...base, repetition: 2, e2e_ms: 200, input_sha256_by_request: ["b".repeat(64)] },
      { ...base, repetition: 3, e2e_ms: 1e-320, input_sha256_by_request: ["c".repeat(64)] },
    ];
    validatePublicBenchmark(benchmark);
    const before = JSON.stringify(benchmark);
    const summary = summarizeBenchmark(benchmark);
    expect(summary.serving_points).toEqual(summarizeServingPoints(benchmark.measurements.rows));
    expect(summary.serving_points[0]!.output_bytes_per_second).toEqual({ median: 90, min: 60, max: 120, samples: 2 });
    expect(summary.serving_points[0]!.reported_tokens_per_second).toBeNull();
    expect(JSON.stringify(summary)).not.toMatch(/Infinity|NaN/);
    expect(JSON.stringify(benchmark)).toBe(before);
  });

  it("observes bytes and first output without filling unreported token metrics", () => {
    const benchmark = validatePublicBenchmark(syntheticSubmission());
    const summary = summarizeBenchmark(benchmark);
    expect(summary.setup).toMatchObject({ max_output_tokens: 128, request_usage: false });
    expect(summary.serving_points[0]).toMatchObject({
      max_output_tokens: 128,
      first_output_ms: { median: 20, min: 20, max: 20, samples: 1 },
      output_bytes_per_second: { median: 60, min: 60, max: 60, samples: 1 },
      e2e_ms: { median: 200, min: 200, max: 200, samples: 1 },
      reported_tokens_per_second: null, prefill_tokens_per_second: null, decode_tokens_per_second: null, tpot_ms: null,
    });
    expect(benchmark.measurements.rows[0]).toMatchObject({ finish_reasons: ["stop"], reported_completion_tokens: null });
  });

  it("summarizes engine-reported usage into the per-request and batch token metrics", () => {
    const benchmark = syntheticSubmission();
    benchmark.workload.request_usage = true;
    benchmark.execution.settings.splice(2, 0, { target: "request", scope: [], name: "stream_options.include_usage", value: true, unit: null, role: null });
    Object.assign(benchmark.measurements.rows[0]!, {
      reported_prompt_tokens: 55, reported_completion_tokens: 10, usage_status: "complete",
      prefill_tokens_per_second: 2750, decode_tokens_per_second: 50, tpot_ms: 20,
    });
    const summary = summarizeBenchmark(validatePublicBenchmark(benchmark));
    expect(summary.serving_points[0]).toMatchObject({
      prefill_tokens_per_second: { median: 2750, min: 2750, max: 2750, samples: 1 },
      decode_tokens_per_second: { median: 50, min: 50, max: 50, samples: 1 },
      tpot_ms: { median: 20, min: 20, max: 20, samples: 1 },
      // 10 completion tokens over a 200 ms batch.
      reported_tokens_per_second: { median: 50, min: 50, max: 50, samples: 1 },
    });
    expect(summary.serving_points[0]).not.toHaveProperty("output_bytes");
    expect(summary.serving_points[0]).not.toHaveProperty("reported_completion_tokens");
  });
});

describe("installed host GPU inventory", () => {
  const integrated = { name: "Integrated Host GPU", vendor: "Host Vendor", vram_mb: null, driver: null, integrated: true };
  const selected = { name: "Selected Compute GPU", vendor: "Compute Vendor", vram_mb: 8192, driver: "compute-driver", integrated: false };

  it("keeps per-device host facts separate from selected execution devices and memory", () => {
    const benchmark = syntheticSubmission();
    benchmark.environment!.cpu.name = "Distinct Host CPU";
    benchmark.environment!.installed_gpus = [integrated, { ...selected, name: "Installed Discrete GPU", vram_mb: 16384 }];
    benchmark.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [selected] };
    const summary = summarizeBenchmark(validatePublicBenchmark(benchmark));
    expect(summary.setup).toMatchObject({
      cpu: "Distinct Host CPU", host_gpus: [integrated, { ...selected, name: "Installed Discrete GPU", vram_mb: 16384 }],
      gpus: ["Selected Compute GPU"], vendors: ["Compute Vendor"], vram_mb: 8192,
      execution_selection_complete: true,
    });
    expect(summary.hardware_label).toBe("Selected Compute GPU");
  });

  it("labels an unknown execution device by the host CPU at acceptance", () => {
    const benchmark = syntheticSubmission();
    benchmark.environment!.cpu.name = "Distinct Host CPU";
    benchmark.environment!.installed_gpus = [integrated];
    benchmark.environment!.execution = { mode: "unknown", selection_complete: false, selected_gpus: [] };
    const summary = summarizeBenchmark(benchmark);
    expect(summary.setup).toMatchObject({
      host_gpus: [integrated], execution_selection_complete: false,
      gpus: [], vendors: [], vram_mb: null, mode: "unknown",
    });
    expect(summary.hardware_label).toBe("Host CPU: Distinct Host CPU");
  });

  it("distinguishes a recorded empty inventory from unavailable host metadata without inferring a device", () => {
    const benchmark = syntheticSubmission();
    benchmark.environment!.execution = { mode: "unknown", selection_complete: false, selected_gpus: [] };
    expect(summarizeBenchmark(benchmark).setup).toMatchObject({ host_gpus: [], gpus: [], vendors: [], vram_mb: null, execution_selection_complete: false });
    benchmark.environment = null;
    expect(summarizeBenchmark(benchmark)).toMatchObject({
      hardware_label: "unknown",
      setup: { host_gpus: null, execution_selection_complete: null, cpu: null, gpus: [], vendors: [], vram_mb: null },
    });
  });
});

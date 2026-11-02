import { describe, expect, it } from "vitest";
import { summarizeServingPoints, validatePublicBenchmark } from "@aiolm/benchmark-contracts";
import { syntheticServingSubmission, syntheticSubmission } from "@/lib/fixtures";
import { normalizeIdentity, summarizeBenchmark, withCanonicalIdentity } from "@/lib/summary";
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
      app_version: "0.0.0-synthetic", method_id: "openai-chat-serving", method_version: 1,
    });
    expect(summary.schema_version).toBe(3);
    expect(summary.input_unit).toBe("utf8_bytes");
    expect(summary.serving_points).toEqual(summarizeServingPoints(benchmark.measurements.rows));
    expect(summary.points).toBeUndefined();
    expect(summary.prompt_lengths).toBeUndefined();
    expect(summary.mean_tg_tps).toBeNull();
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
      model_revision: "b".repeat(40), app_version: "app 5", method_id: "openai-chat-serving", method_version: 1,
    });
  });

  it("reads old summaries from their own metadata without changing labels or mutating either object", () => {
    const benchmark = syntheticSubmission({ method: null });
    const { identity, schema_version, ...stored } = summarizeBenchmark(benchmark);
    void identity; void schema_version;
    const item = { summary: { ...stored, model_label: "Curated label" }, other: "preserved" };
    const before = JSON.stringify({ item, benchmark });
    const projected = withCanonicalIdentity(item, benchmark);
    expect(projected.summary).toEqual({ ...item.summary, identity: normalizeIdentity(benchmark), schema_version: 1 });
    expect(projected.summary.identity).toMatchObject({ model_format: "gguf", method_id: null, method_version: null });
    expect(JSON.stringify({ item, benchmark })).toBe(before);
    expect(withCanonicalIdentity(projected, benchmark)).toBe(projected);
  });
});

describe("API serving summary", () => {
  it("preserves configured workload maxima even when local rows only completed the smallest point", () => {
    const benchmark = syntheticServingSubmission();
    benchmark.workload.inputs.push({ bytes: 16384, sha256: "b".repeat(64) });
    benchmark.workload.concurrencies = [1, 2, 4];
    benchmark.workload.repetitions = 3;
    // Deliberately incomplete local data is not a public acceptance fixture.
    const summary = summarizeBenchmark(benchmark);
    expect(summary.setup).toMatchObject({
      max_input_bytes: 16384, max_concurrency: 4, max_output_tokens: 128,
      repetitions: 3, warmup: false, request_usage: false,
      inputs: benchmark.workload.inputs, corpus: "code_python", corpus_version: 1, cache_policy: "as_configured",
    });
    expect(summary.serving_points!.map((point) => [point.input_bytes, point.concurrency])).toEqual([[4096, 1]]);
  });

  it("retains generic settings including zero, false and unknown without deriving legacy tuning", () => {
    const benchmark = syntheticServingSubmission();
    benchmark.execution.settings.unshift(
      { target: "launch", scope: [], name: "disabled", value: false, unit: null, role: null },
      { target: "launch", scope: ["serve"], name: "unknown", value: null, unit: "tokens", role: "context.per_sequence_tokens" },
      { target: "launch", scope: ["serve"], name: "zero", value: 0, unit: "count", role: null },
    );
    const summary = summarizeBenchmark(validatePublicBenchmark(benchmark));
    expect(summary.setup!.settings).toEqual(benchmark.execution.settings);
    expect(summary.setup).toMatchObject({ context_size: null, parallel: null, threads: null, gpu_layers: null });
  });

  it("preserves host observations and does not report attached proxy memory as engine memory", () => {
    const benchmark = syntheticServingSubmission();
    benchmark.environment!.cpu = { name: "Host CPU", logical_cores: 16, physical_cores: 8 };
    benchmark.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [
      { name: "GPU", vendor: "Vendor", vram_mb: 0, driver: null, integrated: false },
    ] };
    expect(summarizeBenchmark(benchmark).setup).toMatchObject({
      cpu: "Host CPU", cores: 16, physical_cores: 8, ram_bytes: 16 * 1024 ** 3,
      gpus: ["GPU"], vendors: ["Vendor"], vram_mb: 0,
    });
    expect(summarizeBenchmark(benchmark).serving_points![0]!.peak_memory_bytes).toBeNull();
  });

  it("matches shared statistics and never puts a nonfinite derived rate into JSON", () => {
    const benchmark = syntheticServingSubmission();
    benchmark.workload.repetitions = 3;
    const base = benchmark.measurements.rows[0]!;
    benchmark.measurements.rows = [
      { ...base, repetition: 1, e2e_ms: 100 },
      { ...base, repetition: 2, e2e_ms: 200 },
      { ...base, repetition: 3, e2e_ms: 1e-320 },
    ];
    validatePublicBenchmark(benchmark);
    const before = JSON.stringify(benchmark);
    const summary = summarizeBenchmark(benchmark);
    expect(summary.serving_points).toEqual(summarizeServingPoints(benchmark.measurements.rows));
    expect(summary.serving_points![0]!.output_bytes_per_second).toEqual({ median: 90, min: 60, max: 120, samples: 2 });
    expect(summary.serving_points![0]!.reported_tokens_per_second).toBeNull();
    expect(JSON.stringify(summary)).not.toMatch(/Infinity|NaN/);
    expect(JSON.stringify(benchmark)).toBe(before);
  });

  it("keeps legacy token points and means out of the serving measurement shape", () => {
    const summary = summarizeBenchmark(syntheticSubmission());
    expect(summary.points![0]).toMatchObject({ prompt_tokens: 512, tg_tps: { median: 50, min: 50, max: 50 } });
    expect(summary.mean_tg_tps).toBe(50);
    expect(summary.mean_e2e_ms).toBe(2560);
    expect(summary.input_unit).toBeUndefined();
    expect(summary.serving_points).toBeUndefined();
  });
});

describe("installed host GPU inventory", () => {
  const integrated = { name: "Integrated Host GPU", vendor: "Host Vendor", vram_mb: null, driver: null, integrated: true };
  const selected = { name: "Selected Compute GPU", vendor: "Compute Vendor", vram_mb: 8192, driver: "compute-driver", integrated: false };

  it("keeps per-device host facts separate from selected execution devices and memory", () => {
    const benchmark = syntheticServingSubmission();
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

  it("enriches an already identified stored summary without changing measurements or the original record", () => {
    const benchmark = syntheticServingSubmission();
    benchmark.environment!.cpu.name = "Distinct Host CPU";
    benchmark.environment!.installed_gpus = [integrated];
    benchmark.environment!.execution = { mode: "unknown", selection_complete: false, selected_gpus: [] };
    const summary = summarizeBenchmark(benchmark);
    delete summary.setup!.host_gpus;
    delete summary.setup!.execution_selection_complete;
    summary.hardware_label = "unknown";
    // Stored aggregates are authoritative; metadata-only projection must not rebuild them.
    summary.serving_points![0]!.output_bytes_per_second = { median: 321, min: 123, max: 456, samples: 7 };
    benchmark.measurements.rows = [];
    const item = { summary, revision: 12 };
    const before = JSON.stringify({ item, benchmark });
    const projected = withCanonicalIdentity(item, benchmark);
    expect(projected.summary.setup).toMatchObject({
      host_gpus: [integrated], execution_selection_complete: false,
      gpus: [], vendors: [], vram_mb: null, mode: "unknown",
    });
    expect(projected.summary.hardware_label).toBe("Host CPU: Distinct Host CPU");
    expect(projected.summary.serving_points).toBe(summary.serving_points);
    expect(projected.summary.serving_points![0]!.output_bytes_per_second).toEqual({ median: 321, min: 123, max: 456, samples: 7 });
    expect(projected.revision).toBe(12);
    expect(JSON.stringify({ item, benchmark })).toBe(before);
    expect(withCanonicalIdentity(projected, benchmark)).toBe(projected);
  });

  it("distinguishes a recorded empty inventory from unavailable host metadata without inferring a device", () => {
    const benchmark = syntheticServingSubmission();
    benchmark.environment!.execution = { mode: "unknown", selection_complete: false, selected_gpus: [] };
    expect(summarizeBenchmark(benchmark).setup).toMatchObject({ host_gpus: [], gpus: [], vendors: [], vram_mb: null, execution_selection_complete: false });
    benchmark.environment = null;
    expect(summarizeBenchmark(benchmark)).toMatchObject({
      hardware_label: "unknown",
      setup: { host_gpus: null, execution_selection_complete: null, cpu: null, gpus: [], vendors: [], vram_mb: null },
    });
  });
});

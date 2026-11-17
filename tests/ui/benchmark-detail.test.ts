import { describe, expect, it } from "vitest";
import { syntheticSubmission } from "@/lib/fixtures";
import { pythonBenchmark, servingBenchmark, sourcedServingBenchmark } from "../inference-benchmarks";
import {
  describeGpu,
  describeGpuList,
  displayText,
  formatByteSize,
  formatCellValue,
  formatCompactBytes,
  formatCount,
  formatMegabytes,
  describeGpuDetails,
  formatMilliseconds,
  DETAIL_MISSING,
} from "@/components/benchmark-detail-format";
import { buildSetupGroups, type BenchmarkSetup, type SetupGroup } from "@/components/benchmark-detail-fields";
import { buildRowColumns, isFailedRow } from "@/components/benchmark-detail-rows";

/** The `benchmark` object exactly as GET /v1/benchmark-runs/<id> assembles it. */
function publicSetup(overrides: Partial<BenchmarkSetup> = {}): BenchmarkSetup {
  const submission = syntheticSubmission();
  return {
    model: submission.model,
    runtime: submission.runtime,
    workload: submission.workload,
    environment: submission.environment,
    execution: submission.execution,
    method: submission.method,
    app_version: submission.app_version,
    status: submission.measurements.status,
    ...overrides,
  };
}

function labelsOf(groups: SetupGroup[]): string[] {
  return groups.flatMap((group) => group.fields.map((f) => (f.unit ? `${f.label} (${f.unit})` : f.label)));
}

function valueOf(groups: SetupGroup[], label: string, unit?: string): string | string[] | undefined {
  for (const group of groups) {
    for (const field of group.fields) {
      if (field.label === label && field.unit === unit) return field.value;
    }
  }
  return undefined;
}

describe("setup groups", () => {
  it.each(["vllm", "mlx-vlm", "vllm-metal"] as const)("labels %s model format and workload without llama.cpp assumptions", engine => {
    const benchmark = pythonBenchmark(engine);
    const groups = buildSetupGroups(publicSetup(benchmark));
    expect(valueOf(groups, "Weights format")).toBe(engine === "mlx-vlm" ? "MLX" : "safetensors");
    expect(valueOf(groups, "Maximum output token request", "tokens")).toBe("128");
    expect(labelsOf(groups)).toContain("Input UTF-8 bytes and SHA256");
    expect(labelsOf(groups)).not.toContain("Prompt lengths (tokens)");
    expect(labelsOf(groups)).not.toContain("llama-server options");
    if (engine === "vllm-metal") expect(valueOf(groups, "Engine version")).toBe("0.30.0");
  });

  it("shows each recorded execution setting with its exact scope and typed value", () => {
    const benchmark = servingBenchmark();
    benchmark.execution.settings = [
      { target: "launch", scope: [], name: "flag", unit: null, role: null, value: false },
      { target: "launch", scope: ["serve"], name: "zero", unit: "count", role: null, value: 0 },
      { target: "launch", scope: [], name: "array", unit: "ratio", role: null, value: [2, 1] },
      { target: "launch", scope: [], name: "redacted", unit: null, role: null, value: null },
    ];
    const group = buildSetupGroups(publicSetup(benchmark)).find(group => group.id === "detail-setup-execution")!;
    expect(group.fields.slice(2, 5).map(field => field.value)).toEqual(["false", "0", "[2,1]"]);
    expect(group.fields[5]!.value).toBe("Value not recorded");
    expect(group.fields[3]!.label).toContain('["serve"]');
  });

  it("separates an absent value from an empty reported list", () => {
    const groups = buildSetupGroups(publicSetup());
    expect(valueOf(groups, "Installed host GPUs")).toBe("None reported");
    expect(valueOf(groups, "Selected graphics")).toBe("CPU");
    expect(valueOf(groups, "Selection record complete")).toBe("Yes");

    const missing = buildSetupGroups(publicSetup({ environment: null, execution: null, method: null }));
    expect(valueOf(missing, "Installed host GPUs")).toBe("Unknown");
    expect(valueOf(missing, "Selected graphics")).toBe("Execution GPU selection not recorded");
    expect(valueOf(missing, "Operating system")).toBe("Unknown");
    expect(valueOf(missing, "Method")).toBe("Unknown");
    expect(valueOf(missing, "Recorded settings")).toBe("None reported");
  });

  it("reports booleans and sizes in words a reader can use", () => {
    const groups = buildSetupGroups(
      publicSetup({ model: { status: "sha256", sha256: "a".repeat(64), size_bytes: 4_294_967_296 } }),
    );
    expect(valueOf(groups, "Warmup")).toBe("No");
    expect(valueOf(groups, "Selection record complete")).toBe("Yes");
    expect(valueOf(groups, "Model size")).toBe("4.00 GiB (4,294,967,296 B)");
    expect(valueOf(groups, "Model checksum")).toBe("a".repeat(64));
  });

  it("never shows a structured value as [object Object]", () => {
    const groups = buildSetupGroups(publicSetup({ app_version: { name: "aiolm" }, status: ["complete"] }));
    for (const group of groups) {
      for (const field of group.fields) {
        for (const text of Array.isArray(field.value) ? field.value : [field.value]) {
          expect(text).not.toContain("[object Object]");
        }
      }
    }
    expect(valueOf(groups, "App version")).toBe('{"name":"aiolm"}');
  });
});

describe("engine-neutral serving setup and measurements", () => {
  it.each(["sglang", "llama.cpp", "vllm", "mlx-vlm", null])("shows frozen identity and byte workload for %s", (engine) => {
    const benchmark = sourcedServingBenchmark(engine);
    benchmark.runtime.variant = "arbitrary-safe-variant";
    const groups = buildSetupGroups(publicSetup(benchmark));
    expect(valueOf(groups, "Inference engine name")).toBe(engine ?? "Unknown");
    expect(valueOf(groups, "Runtime variant")).toBe("arbitrary-safe-variant");
    expect(valueOf(groups, "Source revision (recorded)")).toBe("b".repeat(40));
    expect(valueOf(groups, "Repository (recorded)")).toBe("synthetic-org/example-model");
    expect(valueOf(groups, "Environment scope")).toBe("aiolm_host");
    expect(labelsOf(groups)).toContain("Input UTF-8 bytes and SHA256");
    expect(labelsOf(groups)).not.toContain("Prompt lengths (tokens)");
    expect(labelsOf(groups)).not.toContain("llama-server options");
  });

  it("shows the eight shared metrics and honest evidence columns, never legacy timing columns", () => {
    const columns = buildRowColumns(undefined, true);
    const keys = columns.map(column => column.key);
    expect(keys).toEqual([
      "input_bytes", "concurrency", "max_output_tokens", "repetition",
      "first_output_ms", "prefill_tokens_per_second", "decode_tokens_per_second", "tpot_ms",
      "reported_tokens_per_second", "output_bytes_per_second", "e2e_ms", "peak_memory_bytes",
      "input_sha256_by_request", "usage_status", "finish_reasons", "timing_source",
    ]);
    for (const key of ["ttft_ms", "tg_tps", "pp_tps", "prompt_tokens", "reported_completion_tokens", "output_bytes", "first_reasoning_ms", "reasoning_bytes"]) expect(keys).not.toContain(key);
    expect(columns.find(column => column.key === "reported_tokens_per_second")?.format(null)).toBe(DETAIL_MISSING);
  });

  it("shows per-request input hashes and usage evidence only in detailed mode", () => {
    const rows = servingBenchmark().measurements.rows as unknown as Record<string, unknown>[];
    const detailed = buildRowColumns(undefined, true);
    expect(detailed.find(column => column.key === "input_sha256_by_request")?.format(rows[0]!.input_sha256_by_request)).toBe("a".repeat(64));
    const core = buildRowColumns();
    for (const key of ["input_sha256_by_request", "usage_status", "finish_reasons", "timing_source"]) expect(core.map(column => column.key)).not.toContain(key);
  });
});

describe("graphics devices", () => {
  const discrete = {
    name: "synthetic-gpu-a",
    vendor: "synthetic-vendor",
    vram_mb: 24576,
    driver: "0.0.0-synthetic",
    integrated: false,
  };
  const partial = { name: null, vendor: "synthetic-vendor", vram_mb: null, driver: null, integrated: true };

  function environmentWith(installed: unknown, selected: unknown): BenchmarkSetup {
    return publicSetup({
      environment: {
        os: "synthetic",
        arch: "x64",
        cpu: { name: "synthetic-cpu", logical_cores: 4 },
        installed_gpus: installed,
        execution: { mode: "selected", selected_gpus: selected, selection_complete: true },
      },
    });
  }

  it("shows installed devices and selected graphics as separate facts", () => {
    const groups = buildSetupGroups(environmentWith([discrete, partial], [discrete]));
    expect(valueOf(groups, "Installed host GPUs")).toEqual(describeGpuList([discrete, partial]));
    expect(valueOf(groups, "Selected graphics")).toBe("synthetic-gpu-a");
  });

  it("never infers a driver, a VRAM size or a device name that was not reported", () => {
    const text = describeGpu(partial);
    expect(text).toContain("Name: Unknown");
    expect(text).toContain("Driver: Unknown");
    // The vendor was reported, so it must not stand in for the missing name.
    expect(text).toContain("Vendor: synthetic-vendor");
    expect(describeGpu("gpu")).toBe("Unknown device");
  });

  it("keeps a reported false apart from an unreported value", () => {
    expect(describeGpu(discrete)).toContain("Integrated: No");
    expect(describeGpu(partial)).toContain("Integrated: Yes");
    expect(describeGpu({ ...discrete, integrated: null })).toContain("Integrated: Unknown");
  });

  it("formats VRAM in gibibytes for display", () => {
    expect(formatMegabytes(24576)).toBe("24.00 GiB");
    expect(formatMegabytes(0)).toBe("0 B");
    expect(formatMegabytes(null)).toBe("Unknown");
    const text = describeGpu(discrete);
    expect(text).toContain("24.00 GiB");
  });

  it("keeps no devices apart from no list at all", () => {
    expect(describeGpuList([])).toBe("None reported");
    expect(describeGpuList(null)).toBe("Unknown");
    expect(describeGpuList(undefined)).toBe("Unknown");
    expect(valueOf(buildSetupGroups(environmentWith([], null)), "Selected graphics")).toBe("None reported");
    expect(valueOf(buildSetupGroups(environmentWith([], [])), "Selected graphics")).toBe("None reported");
  });
});

describe("measurement columns", () => {
  it("declares coordinates, the eight shared metrics and detailed evidence in one order", () => {
    const core = buildRowColumns();
    expect(core.map(column => column.key)).toEqual([
      "input_bytes", "concurrency", "max_output_tokens", "repetition",
      "first_output_ms", "prefill_tokens_per_second", "decode_tokens_per_second", "tpot_ms",
      "reported_tokens_per_second", "output_bytes_per_second", "e2e_ms", "peak_memory_bytes",
    ]);
    expect(core.every(column => column.numeric)).toBe(true);
    expect(core.find(column => column.key === "first_output_ms")).toMatchObject({ unit: "ms", numeric: true });
    expect(core.find(column => column.key === "e2e_ms")).toMatchObject({ unit: "s", numeric: true });
  });

  it("detects failed rows defensively for UI exclusion while omitting an outcome column", () => {
    expect(isFailedRow({ failed: true })).toBe(true);
    expect(isFailedRow({ failed: false })).toBe(false);
    expect(isFailedRow({})).toBe(false);
    expect(buildRowColumns(undefined, true).find((c) => c.key === "failed")).toBeUndefined();
  });

  it("formats each cell in the unit its column promises", () => {
    const byKey = new Map(buildRowColumns(undefined, true).map((c) => [c.key, c]));
    expect(byKey.get("first_output_ms")?.format(620)).toBe("620.0");
    expect(byKey.get("e2e_ms")?.format(2560)).toBe("2.56");
    expect(byKey.get("reported_tokens_per_second")?.format(51.27)).toBe("51.3");
    expect(byKey.get("reported_tokens_per_second")?.format(null)).toBe(DETAIL_MISSING);
    expect(byKey.get("input_bytes")?.format(4096)).toBe("4,096");
    expect(byKey.get("peak_memory_bytes")?.format(1_073_741_824)).toBe("1.00 GiB");
    expect(byKey.get("peak_memory_bytes")?.format(null)).toBe(DETAIL_MISSING);
    expect(byKey.get("timing_source")?.format("client")).toBe("client");
  });
});

describe("detail value formatting", () => {
  it("marks missing setup values as unknown and missing measurements as a gap", () => {
    expect(displayText(null)).toBe("Unknown");
    expect(displayText(false)).toBe("No");
    expect(formatCellValue(null)).toBe(DETAIL_MISSING);
    expect(formatCellValue("")).toBe(DETAIL_MISSING);
    expect(formatCount(Number.NaN)).toBe(DETAIL_MISSING);
    expect(formatMilliseconds("12")).toBe(DETAIL_MISSING);
  });

  it("renders structured values as bounded JSON", () => {
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}');
    expect(formatCellValue([1, 2])).toBe("[1,2]");
    expect(formatCellValue({ note: "x".repeat(400) })).toHaveLength(120);
    expect(formatCellValue({ note: "x".repeat(400) }).endsWith("…")).toBe(true);
  });

  it("keeps byte counts readable without losing the published number", () => {
    expect(formatByteSize(512)).toBe("512 B");
    expect(formatByteSize(1536)).toBe("1.5 KiB (1,536 B)");
    expect(formatByteSize(null)).toBe("Unknown");
    expect(formatCompactBytes(1536)).toBe("1.5 KiB");
    expect(formatCompactBytes(512)).toBe("512 B");
  });
});

describe("structured measurement devices", () => {
  it("keeps device names intact and separates their reported facts", () => {
    const devices = describeGpuDetails([{ name: "Synthetic GPU · Revision B", vendor: "Example", vram_mb: 8192, driver: null, integrated: false }]);
    expect(devices[0].name).toBe("Synthetic GPU · Revision B");
    expect(devices[0].facts).toEqual([
      { label: "Vendor", value: "Example" }, { label: "VRAM", value: "8.00 GiB" },
      { label: "Driver", value: "Unknown" }, { label: "Integrated", value: "No" },
    ]);
    expect(describeGpuDetails(null)).toEqual([]);
  });

  it("aggregates identical GPUs with count x N using device identity including VRAM", () => {
    const gpu1 = { name: "NVIDIA GeForce RTX 4090", vendor: "NVIDIA", vram_mb: 24576, driver: "550.54.14", integrated: false };
    const gpu2 = { name: "NVIDIA GeForce RTX 4090", vendor: "NVIDIA", vram_mb: 24576, driver: "550.54.14", integrated: false };
    const gpuDiffVram = { name: "NVIDIA GeForce RTX 4090", vendor: "NVIDIA", vram_mb: 16384, driver: "550.54.14", integrated: false };

    const aggregated = describeGpuDetails([gpu1, gpu2]);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].name).toBe("NVIDIA GeForce RTX 4090 x 2");
    expect(aggregated[0].facts).toEqual([
      { label: "Vendor", value: "NVIDIA" }, { label: "VRAM", value: "24.00 GiB" },
      { label: "Driver", value: "550.54.14" }, { label: "Integrated", value: "No" },
    ]);

    const mixedVram = describeGpuDetails([gpu1, gpu2, gpuDiffVram]);
    expect(mixedVram).toHaveLength(2);
    expect(mixedVram[0].name).toBe("NVIDIA GeForce RTX 4090 x 2");
    expect(mixedVram[1].name).toBe("NVIDIA GeForce RTX 4090");
    expect(mixedVram[1].facts.find(f => f.label === "VRAM")?.value).toBe("16.00 GiB");

    const listText = describeGpuList([gpu1, gpu2]);
    expect(listText).toHaveLength(1);
    expect(listText[0]).toContain("Name: NVIDIA GeForce RTX 4090 x 2");
  });

  it("formats CPU topology with physical and logical cores as N Core / M Thread", () => {
    const withPhysical = buildSetupGroups(publicSetup({
      environment: { cpu: { name: "AMD Ryzen 9 7950X", physical_cores: 16, logical_cores: 32 } }
    }));
    expect(valueOf(withPhysical, "CPU cores")).toBe("16 Core / 32 Thread");

    const withoutPhysical = buildSetupGroups(publicSetup({
      environment: { cpu: { name: "AMD Ryzen 9 7950X", logical_cores: 32 } }
    }));
    expect(valueOf(withoutPhysical, "CPU cores")).toBe("32 Thread");
  });
});

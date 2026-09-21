import { describe, expect, it } from "vitest";
import { syntheticSubmission } from "@/lib/fixtures";
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
  statusTone,
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
  it("reads as titled groups instead of one long list, with the machine split from the software", () => {
    const groups = buildSetupGroups(publicSetup());
    expect(groups.map((g) => g.title)).toEqual([
      "Model",
      "Hardware",
      "Operating system",
      "Runtime and backend",
      "Workload and method",
      "Execution settings",
    ]);
    expect(new Set(groups.map((g) => g.id)).size).toBe(groups.length);
    for (const group of groups) expect(group.fields.length).toBeGreaterThan(0);
  });

  it("keeps every field the earlier flat list published except omitted result status and installed graphics", () => {
    const labels = labelsOf(buildSetupGroups(publicSetup()));
    for (const label of [
      "App version",
      "Model identity",
      "Model checksum",
      "Model size",
      "Runtime",
      "Method",
      "Corpus",
      "Prompt lengths (tokens)",
      "Generation length (tokens)",
      "Batch sizes",
      "Repetitions",
      "Warmup",
      "Operating system",
      "Architecture",
      "CPU",
      "CPU cores (logical)",
      "Run mode",
      "Selected graphics",
      "Allocated context size (tokens)",
      "Parallel requests",
      "Threads",
      "Graphics layers",
    ]) {
      expect(labels).toContain(label);
    }
    // Outcome/status badges and redundant installed graphics are intentionally omitted
    expect(labels).not.toContain("Result status");
    expect(labels).not.toContain("Installed graphics");

    // System memory is shown when reported
    const withRam = buildSetupGroups(publicSetup({ environment: { system_memory_bytes: 34_359_738_368 } }));
    expect(labelsOf(withRam)).toContain("System memory");
    expect(valueOf(withRam, "System memory")).toBe("32.0 GiB (34,359,738,368 bytes)");
  });

  it("publishes the contract fields the flat list left out", () => {
    const labels = labelsOf(buildSetupGroups(publicSetup()));
    for (const label of [
      "Runtime version",
      "Runtime backend",
      "Runtime build",
      "Method version",
      "Corpus version",
      "Corpus checksum",
      "Graphics selection complete",
      "Batch threads",
      "Flash attention",
      "KV cache type (keys)",
      "KV cache type (values)",
      "Split mode",
      "Tensor split",
    ]) {
      expect(labels).toContain(label);
    }
  });

  it("never renders a label twice with the same unit", () => {
    const labels = labelsOf(buildSetupGroups(publicSetup()));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("separates an absent value from an empty reported list", () => {
    const groups = buildSetupGroups(publicSetup());
    // The synthetic environment reports no GPUs at all, and no settings block.
    expect(valueOf(groups, "Installed graphics")).toBeUndefined();
    expect(valueOf(groups, "Selected graphics")).toBe("None reported");
    expect(valueOf(groups, "Threads")).toBe("Unknown");
    expect(valueOf(groups, "Tensor split")).toBe("Unknown");

    const missing = buildSetupGroups(publicSetup({ environment: null, execution: null, method: null }));
    expect(valueOf(missing, "Installed graphics")).toBeUndefined();
    expect(valueOf(missing, "Selected graphics")).toBe("Unknown");
    expect(valueOf(missing, "Operating system")).toBe("Unknown");
    expect(valueOf(missing, "Method")).toBe("Unknown");
    expect(valueOf(missing, "Allocated context size", "tokens")).toBe("Unknown");
  });

  it("reports booleans and sizes in words a reader can use", () => {
    const groups = buildSetupGroups(
      publicSetup({ model: { status: "sha256", sha256: "a".repeat(64), size_bytes: 4_294_967_296 } }),
    );
    expect(valueOf(groups, "Warmup")).toBe("No");
    expect(valueOf(groups, "Graphics selection complete")).toBe("Yes");
    expect(valueOf(groups, "Model size")).toBe("4.00 GiB (4,294,967,296 bytes)");
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

  it("shows every member the contract publishes for a device", () => {
    expect(describeGpu(discrete)).toBe(
      "Name: synthetic-gpu-a · Vendor: synthetic-vendor · VRAM: 24,576 MiB · Driver: 0.0.0-synthetic · Integrated: No",
    );
  });

  it("shows selected devices one entry at a time, in reported order, omitting installed graphics", () => {
    const groups = buildSetupGroups(environmentWith([discrete, partial], [discrete]));
    expect(valueOf(groups, "Installed graphics")).toBeUndefined();
    expect(valueOf(groups, "Selected graphics")).toEqual([describeGpu(discrete)]);
  });

  it("never infers a driver, a VRAM size or a device name that was not reported", () => {
    const text = describeGpu(partial);
    expect(text).toContain("Name: Unknown");
    expect(text).toContain("VRAM: Unknown");
    expect(text).toContain("Driver: Unknown");
    // The vendor was reported, so it must not stand in for the missing name.
    expect(text).toContain("Vendor: synthetic-vendor");
    expect(describeGpu({})).toBe("Name: Unknown · Vendor: Unknown · VRAM: Unknown · Driver: Unknown · Integrated: Unknown");
    expect(describeGpu("gpu")).toBe("Unknown device");
  });

  it("keeps a reported false apart from an unreported value", () => {
    expect(describeGpu(discrete)).toContain("Integrated: No");
    expect(describeGpu(partial)).toContain("Integrated: Yes");
    expect(describeGpu({ ...discrete, integrated: null })).toContain("Integrated: Unknown");
  });

  it("keeps VRAM in the megabytes the contract publishes", () => {
    expect(formatMegabytes(24576)).toBe("24,576 MiB");
    expect(formatMegabytes(0)).toBe("0 MiB");
    expect(formatMegabytes(null)).toBe("Unknown");
    const text = describeGpu(discrete);
    expect(text).not.toMatch(/GiB|GB|bytes/);
  });

  it("keeps no devices apart from no list at all", () => {
    expect(describeGpuList([])).toBe("None reported");
    expect(describeGpuList(null)).toBe("Unknown");
    expect(describeGpuList(undefined)).toBe("Unknown");
    const groups = buildSetupGroups(environmentWith([], null));
    expect(valueOf(groups, "Installed graphics")).toBeUndefined();
    expect(valueOf(groups, "Selected graphics")).toBe("Unknown");
    const groupsEmpty = buildSetupGroups(environmentWith([], []));
    expect(valueOf(groupsEmpty, "Selected graphics")).toBe("None reported");
  });
});

describe("measurement columns", () => {
  const row = syntheticSubmission().measurements.rows[0] as unknown as Record<string, unknown>;

  it("orders core contract metrics and expands detailed metrics upon request", () => {
    const reversed = Object.fromEntries(Object.entries(row).reverse());
    expect(buildRowColumns([reversed]).map((c) => c.key)).toEqual(buildRowColumns([row]).map((c) => c.key));
    // Core columns (default mode)
    expect(buildRowColumns([row]).map((c) => c.key)).toEqual([
      "prompt_tokens",
      "concurrency",
      "repetition",
      "pp_tps",
      "tg_tps",
      "ttft_ms",
      "peak_memory_bytes",
    ]);

    // Detailed columns (when toggle is active)
    expect(buildRowColumns([row], true).map((c) => c.key)).toEqual([
      "prompt_tokens",
      "concurrency",
      "repetition",
      "pp_tps",
      "tg_tps",
      "ttft_ms",
      "peak_memory_bytes",
      "generation_length",
      "completion_tokens",
      "cached_tokens",
      "tpot_ms",
      "e2e_ms",
      "total_tps",
      "timing_source",
    ]);

    // Outcome column is defensively removed from both core and detailed views
    expect(buildRowColumns([row], false).map((c) => c.key)).not.toContain("failed");
    expect(buildRowColumns([row], true).map((c) => c.key)).not.toContain("failed");
  });

  it("labels every metric with its reported unit, bilingual labels, and process memory", () => {
    const byKey = new Map(buildRowColumns([row], true).map((c) => [c.key, c]));
    expect(byKey.get("tg_tps")).toMatchObject({ label: "Decode", unit: "tok/s", numeric: true });
    expect(byKey.get("pp_tps")).toMatchObject({ label: "Prefill", unit: "tok/s", numeric: true });
    expect(byKey.get("e2e_ms")).toMatchObject({ label: "End-to-end duration", unit: "ms", numeric: true });
    expect(byKey.get("ttft_ms")).toMatchObject({ label: "TTFT", unit: "ms" });
    expect(byKey.get("prompt_tokens")).toMatchObject({ label: "Prompt", unit: "tokens" });
    // peak_memory_bytes is specifically labeled Peak process memory, not VRAM or system memory
    expect(byKey.get("peak_memory_bytes")).toMatchObject({ label: "Peak process memory", numeric: true });
    expect(byKey.get("failed")).toBeUndefined();
  });

  it("keeps a metric that only later rows carry, and an unknown key under its own name in detailed mode", () => {
    const partial: Record<string, unknown> = { prompt_tokens: 1 };
    const extended: Record<string, unknown> = { prompt_tokens: 2, tg_tps: 9, scheduler_ms: 4 };
    const coreColumns = buildRowColumns([partial, extended]);
    expect(coreColumns.map((c) => c.key)).toEqual(["prompt_tokens", "tg_tps"]);

    const detailedColumns = buildRowColumns([partial, extended], true);
    expect(detailedColumns.map((c) => c.key)).toEqual(["prompt_tokens", "tg_tps", "scheduler_ms"]);
    expect(detailedColumns[detailedColumns.length - 1]).toMatchObject({ label: "scheduler_ms", numeric: false });
  });

  it("shows only the columns the loaded rows actually carry", () => {
    expect(buildRowColumns([{ e2e_ms: 12 }], true).map((c) => c.key)).toEqual(["e2e_ms"]);
    expect(buildRowColumns([{ tg_tps: 50 }]).map((c) => c.key)).toEqual(["tg_tps"]);
    expect(buildRowColumns([])).toEqual([]);
  });

  it("detects failed rows defensively for UI exclusion while omitting outcome column", () => {
    expect(isFailedRow({ failed: true })).toBe(true);
    expect(isFailedRow({ failed: false })).toBe(false);
    expect(isFailedRow({})).toBe(false);
    expect(buildRowColumns([row], true).find((c) => c.key === "failed")).toBeUndefined();
  });

  it("formats each cell in the unit its column promises", () => {
    const byKey = new Map(buildRowColumns([row], true).map((c) => [c.key, c]));
    expect(byKey.get("ttft_ms")?.format(0.62)).toBe("0.6");
    expect(byKey.get("e2e_ms")?.format(2560)).toBe("2560.0");
    expect(byKey.get("tg_tps")?.format(51.27)).toBe("51.3");
    expect(byKey.get("tg_tps")?.format(null)).toBe(DETAIL_MISSING);
    expect(byKey.get("prompt_tokens")?.format(4096)).toBe("4,096");
    expect(byKey.get("peak_memory_bytes")?.format(1_073_741_824)).toBe("1.00 GiB");
    expect(byKey.get("peak_memory_bytes")?.format(null)).toBe(DETAIL_MISSING);
    expect(byKey.get("timing_source")?.format("server")).toBe("server");
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
    expect(formatByteSize(512)).toBe("512 bytes");
    expect(formatByteSize(1536)).toBe("1.50 KiB (1,536 bytes)");
    expect(formatByteSize(null)).toBe("Unknown");
    expect(formatCompactBytes(1536)).toBe("1.50 KiB");
    expect(formatCompactBytes(512)).toBe("512 bytes");
  });

  it("gives the ok tone only to a run that completed", () => {
    expect(statusTone("complete")).toBe("ok");
    expect(statusTone("failed")).toBe("bad");
    expect(statusTone("partial")).toBe("");
    expect(statusTone("cancelled")).toBe("");
    expect(statusTone(null)).toBe("");
  });
});


describe("structured measurement devices", () => {
  it("keeps device names intact and separates their reported facts", () => {
    const devices = describeGpuDetails([{ name: "Synthetic GPU · Revision B", vendor: "Example", vram_mb: 8192, driver: null, integrated: false }]);
    expect(devices[0].name).toBe("Synthetic GPU · Revision B");
    expect(devices[0].facts).toEqual([
      { label: "Vendor", value: "Example" }, { label: "VRAM", value: "8,192 MiB" },
      { label: "Driver", value: "Unknown" }, { label: "Integrated", value: "No" },
    ]);
    expect(describeGpuDetails(null)).toEqual([]);
  });
});

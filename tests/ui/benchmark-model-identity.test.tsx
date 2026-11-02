import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { createTranslator } from "@/i18n/translate";
import en from "@/i18n/messages/benchmark/en";
import {
  formatBaseModels,
  formatWeightQuantization,
  huggingFaceUrl,
  isRepositoryId,
  modelArtifactKey,
  modelIdentityComparison,
  modelPublisher,
  modelValue,
  readModelInfo,
  type BenchmarkModelInfo,
} from "@/components/benchmark-model-identity";
import { buildSetupGroups } from "@/components/benchmark-detail-fields";
import { BenchmarkExplorerComparison, servingComparisonSignature } from "@/components/benchmark-explorer-comparison";
import { formatComparisonCpu, formatComparisonExecution, formatComparisonOs, formatComparisonRuntime, formatComparisonVram } from "@/components/benchmark-explorer-format";
import { type ExplorerItem, type ExplorerSummary } from "@/components/benchmark-explorer-state";
import { BenchmarkDetail } from "@/components/benchmark-detail";
import { ServingBenchmarkPointsPanel } from "@/components/benchmark-detail-points";
import { summarizeBenchmark } from "@/lib/summary";
import { summarizeServingPoints } from "@/lib/benchmark-points";
import { servingBenchmark, sourcedServingBenchmark } from "../inference-benchmarks";

const fetched = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/components/ui", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/ui")>(),
  useJsonFetch: () => ({ data: fetched.data, error: null, reload: () => {} }),
}));

const t = createTranslator(en);

/** Synthetic metadata only: fabricated namespaces and file names, no published model. */
function info(overrides: Partial<BenchmarkModelInfo> = {}): BenchmarkModelInfo {
  return {
    format: "GGUF",
    name: "synthetic-model",
    architecture: "synthetic-arch",
    size_label: "7B",
    quantization: "Q4_K_M",
    file_type: 15,
    quantized_by: "synthetic-quantizer",
    repository: "synthetic-org/synthetic-repo",
    base_models: ["synthetic-base/synthetic-weights"],
    artifact: "synthetic-model-q4_k_m.gguf",
    source: "gguf+huggingface",
    sha256: "a".repeat(64),
    identity_status: "sha256",
    ...overrides,
  };
}

function summary(overrides: Partial<ExplorerSummary> = {}): ExplorerSummary {
  return {
    model_label: "synthetic-model",
    hardware_label: "synthetic-gpu",
    method_label: "synthetic-method@1",
    workload_label: "synthetic-corpus",
    row_count: 4,
    failed_rows: 0,
    status: "complete",
    mean_tg_tps: 10,
    mean_e2e_ms: 100,
    ...overrides,
  };
}

function item(id: string, overrides: Partial<ExplorerSummary> = {}): ExplorerItem {
  return { public_id: id, revision: 1, created_at: "2026-01-02T03:04:05.000Z", summary: summary(overrides) };
}

const render = (node: React.ReactNode, messages = en) =>
  renderToStaticMarkup(<I18nProvider locale="en" messages={messages}>{node}</I18nProvider>);

describe("who published the weights", () => {
  it("reads the distributor from the repository namespace and from nothing else", () => {
    expect(modelPublisher(info())).toBe("synthetic-org");
    // The party that quantized the file is a different party and never stands in.
    expect(modelPublisher(info({ repository: null }))).toBeNull();
    expect(modelPublisher(info({ repository: null, quantized_by: "synthetic-quantizer" }))).toBeNull();
    expect(modelPublisher(null)).toBeNull();
  });

  it("refuses a repository id that is not a plain namespace and repository", () => {
    for (const value of [
      "https://huggingface.co/synthetic-org/synthetic-repo",
      "synthetic-org",
      "synthetic-org/synthetic-repo/extra",
      "../synthetic-repo",
      "synthetic-org/..",
      "synthetic..org/synthetic-repo",
      "synthetic-org/synthetic..repo",
      "a..b/c",
      "-synthetic-org/synthetic-repo",
      "C:/synthetic/local.gguf",
      "synthetic org/synthetic repo",
      "",
    ]) {
      expect(isRepositoryId(value), value).toBe(false);
      expect(modelPublisher(info({ repository: value })), value).toBeNull();
      expect(huggingFaceUrl(value), value).toBeNull();
    }
  });

  it("links only a repository id it could validate", () => {
    expect(huggingFaceUrl("synthetic-org/synthetic-repo")).toBe("https://huggingface.co/synthetic-org/synthetic-repo");
    expect(huggingFaceUrl(null)).toBeNull();
  });
});

describe("what the weights are", () => {
  it("keeps an unnamed quantization unnamed and reports the raw file type instead", () => {
    expect(formatWeightQuantization(info(), t)).toBe("Q4_K_M");
    expect(formatWeightQuantization(info({ quantization: null }), t)).toBe("Unknown (file type 15)");
    expect(formatWeightQuantization(info({ quantization: null, file_type: null }), t)).toBe("Unknown");
    expect(formatWeightQuantization(null, t)).toBe("Unknown");
  });

  it("says unknown rather than blank for every unreported field", () => {
    expect(modelValue(null, t)).toBe("Unknown");
    expect(modelValue("   ", t)).toBe("Unknown");
    expect(modelValue(0, t)).toBe("0");
    expect(formatBaseModels(info({ base_models: [] }), t)).toBe("Unknown");
    expect(formatBaseModels(info(), t)).toBe("synthetic-base/synthetic-weights");
  });


  it("drops members of the wrong type and bounds the base model list", () => {
    const parsed = readModelInfo({
      format: "GGUF",
      name: 42,
      quantization: "",
      file_type: 1.5,
      base_models: [...Array.from({ length: 12 }, (_, index) => `synthetic-${index}/repo`), null, 7],
      repository: "synthetic-org/synthetic-repo",
    });
    expect(parsed?.name).toBeNull();
    expect(parsed?.quantization).toBeNull();
    expect(parsed?.file_type).toBeNull();
    expect(parsed?.base_models).toHaveLength(8);
    expect(readModelInfo(null)).toBeNull();
    expect(readModelInfo("synthetic")).toBeNull();
  });
});

describe("which file was measured", () => {
  it("pins a result by verified checksum only, never by repository and artifact alone", () => {
    expect(modelArtifactKey(info())).toBe(`sha256:${"a".repeat(64)}`);
    // The same repository path can change across revisions, so without a hash it proves nothing.
    expect(modelArtifactKey(info({ sha256: null }))).toBeNull();
    expect(modelArtifactKey(info({ sha256: null, artifact: null }))).toBeNull();
    // A checksum without a verified identity status is not a pin either.
    expect(modelArtifactKey(info({ identity_status: "unidentified" }))).toBeNull();
    expect(modelArtifactKey(info({ identity_status: null }))).toBeNull();
    expect(modelArtifactKey(null)).toBeNull();
    expect(modelArtifactKey(info({ sha256: "abcd" }))).toBeNull();
    expect(modelArtifactKey(info({ sha256: "z".repeat(64) }))).toBeNull();
  });

  it("separates a set that ran one file from one that did not say", () => {
    expect(modelIdentityComparison([info(), info()])).toEqual({ same: true, unknown: false });
    expect(modelIdentityComparison([info(), info({ sha256: "c".repeat(64) })])).toEqual({ same: false, unknown: false });
    // A name in common is not a file in common, so an unreported file stays unreported.
    expect(modelIdentityComparison([info(), null])).toEqual({ same: true, unknown: true });
    expect(modelIdentityComparison([null, null])).toEqual({ same: true, unknown: true });
    // Two results with the same repository and artifact but no hash remain unknown, not identical.
    const noHashA = info({ sha256: null, identity_status: "unidentified" });
    const noHashB = info({ sha256: null, identity_status: "unidentified" });
    expect(modelArtifactKey(noHashA)).toBeNull();
    expect(modelIdentityComparison([noHashA, noHashB])).toEqual({ same: true, unknown: true });
  });
});


describe("the comparison", () => {
  it("warns when the picked results did not run the same file, without judging any model", () => {
    const differing = render(
      <BenchmarkExplorerComparison
        items={[item("a", { model_info: info() }), item("b", { model_info: info({ sha256: "c".repeat(64) }) })]}
        onRemove={() => {}} onClear={() => {}}
      />,
    );
    expect(differing).toContain("do not all name the same weights file");
  });

  it("warns just as plainly when a picked result never said which file it ran", () => {
    const unknown = render(
      <BenchmarkExplorerComparison items={[item("a", { model_info: info() }), item("b")]} onRemove={() => {}} onClear={() => {}} />,
    );
    expect(unknown).toContain("do not say which file they ran");
  });

  it("stays quiet for one pick and for picks of the same file", () => {
    const single = render(<BenchmarkExplorerComparison items={[item("a")]} onRemove={() => {}} onClear={() => {}} />);
    expect(single).not.toContain("do not all name the same weights file");
    const same = render(
      <BenchmarkExplorerComparison items={[item("a", { model_info: info() }), item("b", { model_info: info() })]} onRemove={() => {}} onClear={() => {}} />,
    );
    expect(same).not.toContain("do not all name the same weights file");
  });


  it("reads the environment across the columns with a label per row", () => {
    const setup = {
      os: "synthetic-os", arch: "x64", cpu: "synthetic-cpu", cores: 8, vendors: ["synthetic-vendor"], gpus: ["synthetic-gpu"],
      vram_mb: 8192, runtime: "synthetic-runtime", runtime_version: "1.2", backend: "synthetic-backend", mode: "selected",
      context_size: 16896, parallel: 2, threads: 8, gpu_layers: -1, flash_attention: "on",
      cache_type_k: "f16", cache_type_v: "f16", split_mode: "layer",
    };
    expect(formatComparisonOs(setup, t)).toBe("synthetic-os · x64");
    expect(formatComparisonCpu(setup, t)).toBe("synthetic-cpu · 8 Thread");
    expect(formatComparisonCpu({ ...setup, physical_cores: 4 }, t)).toBe("synthetic-cpu · 4 Core / 8 Thread");
    expect(formatComparisonRuntime(setup, t)).toBe("synthetic-runtime 1.2 · synthetic-backend");
    expect(formatComparisonVram(setup, t)).toBe("8.00 GiB");
    expect(formatComparisonExecution(setup, t)).toContain("Parallel requests: 2");
    expect(formatComparisonExecution(setup, t)).toContain("Threads: 8");
    expect(formatComparisonExecution(setup, t)).toContain("K: f16, V: f16");
    expect(formatComparisonOs(undefined, t)).toBe("Unknown");
    expect(formatComparisonExecution(undefined, t)).toBe("Unknown");
    expect(formatComparisonExecution({ ...setup, cache_type_k: null, cache_type_v: "q8_0" }, t)).toContain("K: Unknown, V: q8_0");
    expect(formatComparisonExecution({ ...setup, cache_type_k: "q8_0", cache_type_v: null }, t)).toContain("K: q8_0, V: Unknown");

    const html = render(
      <BenchmarkExplorerComparison
        items={[item("a", { setup, model_info: info() }), item("b", { model_info: info() })]}
        onRemove={() => {}} onClear={() => {}}
      />,
    );
    expect(html).toContain("synthetic-os · x64");
    expect(html).toContain("synthetic-runtime 1.2 · synthetic-backend");
    expect(html).toContain("8.00 GiB");
  });
});

describe("the result page", () => {
  const benchmark = {
    model: { status: "sha256", sha256: "a".repeat(64), size_bytes: 2048, metadata: info() },
    runtime: { name: "synthetic-runtime", version: "1.2", backend: "synthetic-backend" },
    method: { id: "synthetic-method", version: 1 },
    workload: { corpus: "synthetic-corpus" },
    environment: { os: "synthetic-os", arch: "x86_64", cpu: { name: "synthetic-cpu", logical_cores: 8 }, execution: { mode: "gpu" } },
    execution: { settings: {} },
    app_version: "0.0.0",
    status: "complete",
  };


  it("offers a public source link only for an id that validated", () => {
    const [model] = buildSetupGroups(benchmark, t);
    expect(model.fields.find((field) => field.label === "Repository (recorded)")?.links)
      .toEqual({ "synthetic-org/synthetic-repo": "https://huggingface.co/synthetic-org/synthetic-repo" });
    expect(model.fields.find((field) => field.label === "Base model (recorded)")?.links)
      .toEqual({ "synthetic-base/synthetic-weights": "https://huggingface.co/synthetic-base/synthetic-weights" });

    const escaped = { metadata: info({ repository: "../escape", base_models: ["also/../escape"] }) };
    const unlinkable = buildSetupGroups({ ...benchmark, model: escaped }, t)[0];
    expect(unlinkable.fields.find((field) => field.label === "Repository (recorded)")?.links).toBeUndefined();
    expect(unlinkable.fields.find((field) => field.label === "Base model (recorded)")?.links).toEqual({});
  });

  it("reports unknown for required facts and omits empty optional metadata fields for bare publication", () => {
    const bare = { status: "unidentified", sha256: null, size_bytes: null };
    const [model] = buildSetupGroups({ ...benchmark, model: bare }, t);
    for (const label of ["Model name", "Repository owner (recorded)", "Weight quantization", "Model checksum", "Model size"]) {
      expect(model.fields.find((field) => field.label === label)?.value, label).toBe("Unknown");
    }
    expect(model.fields.find((field) => field.label === "Model identity")?.value).toBe("unidentified");
    // Empty optional metadata fields are omitted
    for (const label of ["Base model (recorded)", "Artifact file (recorded)", "Repository (recorded)", "Quantized by (recorded)"]) {
      expect(model.fields.find((field) => field.label === label)).toBeUndefined();
    }
  });
});


describe("the result page header", () => {
  it("reads the publisher and the weight quantization before the metrics, and links the source safely", () => {
    fetched.data = {
      id: "synthetic-id", revision: 1, created_at: "2026-01-02T03:04:05.000Z", updated_at: "2026-01-02T03:04:05.000Z",
      description_md: "", benchmark: {
        model: { status: "sha256", sha256: "a".repeat(64), size_bytes: 2048, metadata: info() },
        runtime: {}, workload: {}, environment: {}, execution: {}, method: {}, app_version: "0.0.0", status: "complete",
      },
      summary: { ...summary(), model_info: info() },
    };
    const html = render(<BenchmarkDetail publicId="synthetic-id" />);
    expect(html).toContain('href="https://huggingface.co/synthetic-org/synthetic-repo"');
    expect(html).toContain('rel="noreferrer noopener"');
    fetched.data = null;
  });
});

describe("serving detail and comparison", () => {
  it("renders shared metric sample counts, byte channels, empty output and memory attribution", () => {
    const benchmark = servingBenchmark(null);
    const row = benchmark.measurements.rows[0]!;
    const points = summarizeServingPoints([
      { ...row, repetition: 0, output_bytes: 0, content_bytes: 0, reasoning_bytes: 0, first_output_ms: null, first_content_ms: null, first_reasoning_ms: null, reported_prompt_tokens: null, reported_completion_tokens: null, reported_cached_tokens: null },
      { ...row, repetition: 1, output_bytes: 0, content_bytes: 0, reasoning_bytes: 0, first_output_ms: null, first_content_ms: null, first_reasoning_ms: null, reported_prompt_tokens: 10, reported_completion_tokens: 0, reported_cached_tokens: null },
    ]);
    const html = render(<ServingBenchmarkPointsPanel points={points} memoryScope="unavailable" />);
    expect(html).toContain("No output was observed");
    expect(html).toContain("Observed reasoning");
    expect(html).toContain("Reported completion tokens");
    expect(html).toContain("n=1");
    expect(html).toContain("n=2");
    for (const legacy of ["TTFT", "Prefill", "Decode"]) expect(html).not.toContain(legacy);
  });

  it("compares actual workload facts, ignores engine identity, and includes cap in basis matching", () => {
    const a = sourcedServingBenchmark("sglang");
    const b = sourcedServingBenchmark(null);
    const makeItem = (id: string, benchmark: typeof a): ExplorerItem => ({ public_id: id, revision: 1, created_at: "2026-01-02T03:04:05.000Z", summary: summarizeBenchmark(benchmark) });
    const left = makeItem("left", a), right = makeItem("right", b);
    expect(servingComparisonSignature(left)).toBe(servingComparisonSignature(right));
    const first = left.summary.serving_points![0]!;
    const exact = render(<BenchmarkExplorerComparison items={[left, right]} basis={{ input_bytes: first.input_bytes, concurrency: first.concurrency, max_output_tokens: first.max_output_tokens }} onClear={() => {}} onRemove={() => {}} />);
    expect(exact).toContain("Reported token rate");
    expect(exact).toContain("b".repeat(40));
    expect(exact).toContain(a.workload.inputs[0]!.sha256);
    expect(exact).not.toContain("Selected results differ in method");
    const missing = render(<BenchmarkExplorerComparison items={[left]} basis={{ input_bytes: first.input_bytes, concurrency: first.concurrency, max_output_tokens: first.max_output_tokens + 1 }} onClear={() => {}} onRemove={() => {}} />);
    expect(missing).toContain("Not measured at this point");
    b.workload.inputs[0]!.sha256 = "c".repeat(64);
    const different = makeItem("different", b);
    expect(servingComparisonSignature(left)).not.toBe(servingComparisonSignature(different));
    const html = render(<BenchmarkExplorerComparison items={[left, different]} onClear={() => {}} onRemove={() => {}} />);
    expect(html).toContain("Selected results differ in method");
  });
});

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
import { formatComparisonCpu, formatComparisonOs, formatComparisonVram } from "@/components/benchmark-explorer-format";
import { type ExplorerItem, type ExplorerSummary } from "@/components/benchmark-explorer-state";
import { BenchmarkDetail } from "@/components/benchmark-detail";
import { ServingBenchmarkPointsPanel } from "@/components/benchmark-detail-points";
import { summarizeBenchmark } from "@/lib/summary";
import { summarizeServingPoints } from "@/lib/benchmark-points";
import { syntheticSubmission } from "@/lib/fixtures";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";

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
    ...summarizeBenchmark(syntheticSubmission()),
    model_label: "synthetic-model",
    hardware_label: "synthetic-gpu",
    method_label: "openai-chat-serving@5",
    workload_label: "code_python",
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
      ...summary().setup,
      os: "synthetic-os", arch: "x64", cpu: "synthetic-cpu", cores: 8, physical_cores: null,
      vendors: ["synthetic-vendor"], gpus: ["synthetic-gpu"],
      vram_mb: 8192, runtime: "synthetic-runtime", runtime_version: "1.2", backend: "synthetic-backend", mode: "selected",
      settings: [
        { target: "launch" as const, scope: [], name: "batch", value: 2, unit: "count" as const, role: null },
        { target: "launch" as const, scope: [], name: "cache_type_k", value: "f16", unit: null, role: null },
      ],
    };
    expect(formatComparisonOs(setup, t)).toBe("synthetic-os · x64");
    expect(formatComparisonCpu(setup, t)).toContain("synthetic-cpu · 8 Thread");
    expect(formatComparisonCpu({ ...setup, physical_cores: 4 }, t)).toContain("synthetic-cpu · 4 Core / 8 Thread");
    expect(formatComparisonVram(setup, t)).toBe("8.00 GiB");
    expect(formatComparisonOs(undefined, t)).toBe("Unknown");
    expect(formatComparisonVram(undefined, t)).toBe("Unknown");

    const identity = { ...summary().identity, engine_name: "synthetic-runtime", engine_version: "1.2" };
    const html = render(
      <BenchmarkExplorerComparison
        items={[item("a", { setup, identity, model_info: info() }), item("b", { model_info: info() })]}
        onRemove={() => {}} onClear={() => {}}
      />,
    );
    expect(html).toContain("synthetic-os · x64");
    expect(html).toContain("synthetic-runtime 1.2 · synthetic-backend");
    expect(html).toContain("8.00 GiB");
    expect(html).toContain("batch");
    expect(html).toContain("cache_type_k");
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

  it("names every missing required fact and omits empty optional metadata fields for bare publication", () => {
    const bare = { status: "unidentified", sha256: null, size_bytes: null };
    const [model] = buildSetupGroups({ ...benchmark, model: bare }, t);
    for (const [label, value] of [
      ["Model name", "Unknown"],
      ["Repository owner (recorded)", "Value not recorded"],
      ["Weight quantization", "Unknown"],
      ["Model checksum", "Value not recorded"],
      ["Model size", "Unknown"],
    ] as const) {
      expect(model.fields.find((field) => field.label === label)?.value, label).toBe(value);
    }
    expect(model.fields.find((field) => field.label === "Model identity")?.value).toBe("unidentified");
    // Recorded provenance rows stay visible so the gap itself is named.
    for (const label of ["Repository (recorded)", "Quantized by (recorded)"]) {
      expect(model.fields.find((field) => field.label === label)?.value, label).toBe("Value not recorded");
    }
    // Empty optional metadata fields are omitted.
    for (const label of ["Base model (recorded)", "Artifact file (recorded)"]) {
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
  const base = syntheticSubmission();
  const row = base.measurements.rows[0]!;
  const sampled = summarizeBenchmark({ ...base, measurements: { status: "complete", rows: [
    { ...row, repetition: 1, output_bytes: 2, e2e_ms: 100 },
    { ...row, repetition: 2, output_bytes: 6, e2e_ms: 100 },
  ] } });

  it("renders all shared metrics with sample counts and honest evidence", () => {
    const html = render(<ServingBenchmarkPointsPanel points={sampled.serving_points} memoryScope="unavailable" requestUsage={false} />);
    for (const label of ["First observed output", "prefillRate", "decodeRate", "tpot", "reportedRate", "Observed output rate", "End-to-end duration", "Peak process memory"]) {
      expect(html).toContain(t(`benchmark.${label}`));
    }
    expect(html).toContain("20.0–60.0 · n=2");
    expect(html).toContain("40.0");
    expect(html).toContain(t("benchmark.Usage not requested"));
    expect(html).toContain(t("benchmark.Unavailable for this process scope"));
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it("compares workload facts across engine identity and per-run nonce or hashes", () => {
    const runSpecific = syntheticSubmission({
      runtime: { ...base.runtime, name: "vllm", version: "9.9.9" },
      workload: { ...base.workload, prompt_nonce: "f".repeat(32), inputs: [{ bytes: base.workload.inputs[0]!.bytes, sha256: "c".repeat(64) }] },
      measurements: { status: "complete", rows: [{ ...row, input_sha256_by_request: ["c".repeat(64)] }] },
    });
    const make = (id: string, submission: PublicBenchmarkSubmission): ExplorerItem => ({
      public_id: id, revision: 1, created_at: "2026-01-02T03:04:05.000Z", summary: summarizeBenchmark(submission),
    });
    const left = make("left", base), right = make("right", runSpecific);
    expect(servingComparisonSignature(left)).toBe(servingComparisonSignature(right));
    const first = left.summary.serving_points[0]!;
    const basis = { input_bytes: first.input_bytes, concurrency: first.concurrency, max_output_tokens: first.max_output_tokens };
    const exact = render(<BenchmarkExplorerComparison items={[left, right]} basis={basis} onClear={() => {}} onRemove={() => {}} />);
    expect(exact).toContain(t("benchmark.reportedRate"));
    expect(exact).toContain(base.workload.inputs[0]!.sha256);
    expect(exact).toContain(runSpecific.workload.inputs[0]!.sha256);
    expect(exact).not.toContain(t("benchmark.Selected results differ in input bytes, output tokens, corpus, warmup, usage request, concurrencies, repetitions or execution settings. Read each column on its own terms."));
    const missing = render(<BenchmarkExplorerComparison items={[left]} basis={{ ...basis, max_output_tokens: basis.max_output_tokens + 1 }} onClear={() => {}} onRemove={() => {}} />);
    expect(missing).toContain(t("benchmark.Not measured at this point"));

    const changed = syntheticSubmission({
      workload: { ...base.workload, max_output_tokens: 64 },
      measurements: { status: "complete", rows: [{ ...row, max_output_tokens: 64 }] },
    });
    const changedSetting = syntheticSubmission({
      execution: { ...base.execution, settings: [...base.execution.settings, { target: "launch", scope: [], name: "batch", value: 2, unit: null, role: null }] },
    });
    for (const submission of [changed, changedSetting]) {
      expect(servingComparisonSignature(left)).not.toBe(servingComparisonSignature(make("changed", submission)));
    }
    expect(render(<BenchmarkExplorerComparison items={[left, make("changed", changed)]} onClear={() => {}} onRemove={() => {}} />))
      .toContain(t("benchmark.Selected results differ in input bytes, output tokens, corpus, warmup, usage request, concurrencies, repetitions or execution settings. Read each column on its own terms."));
  });

  it("keeps the shared metric order in the detail panel", () => {
    const points = summarizeServingPoints(base.measurements.rows);
    const html = render(<ServingBenchmarkPointsPanel points={points} memoryScope="unavailable" requestUsage={false} />);
    expect(html.indexOf(t("benchmark.First observed output"))).toBeLessThan(html.indexOf(t("benchmark.prefillRate")));
    expect(html.indexOf(t("benchmark.reportedRate"))).toBeLessThan(html.indexOf(t("benchmark.Observed output rate")));
    expect(html.indexOf(t("benchmark.Observed output rate"))).toBeLessThan(html.indexOf(t("benchmark.End-to-end duration")));
    expect(html.indexOf(t("benchmark.End-to-end duration"))).toBeLessThan(html.indexOf(t("benchmark.Peak process memory")));
  });
});

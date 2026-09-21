import { describe, expect, it } from "vitest";
import { syntheticSubmission } from "@/lib/fixtures";
import { modelLabelFor, normalizeModelInfo } from "@/lib/model-info";
import { summarizeBenchmark } from "@/lib/summary";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";

/**
 * model.metadata is optional in contract 0.3.0 and absent from the vendored
 * 0.2.0 types, so these fixtures attach the block directly. Rejecting a payload
 * that does not match the schema is the contracts package's job; what is
 * asserted here is what the website publishes from a block it was handed.
 */
function described(metadata: unknown, identity: Partial<PublicBenchmarkSubmission["model"]> = {}): PublicBenchmarkSubmission {
  const benchmark = syntheticSubmission();
  benchmark.model = { ...benchmark.model, ...identity, metadata } as PublicBenchmarkSubmission["model"];
  return benchmark;
}

const COMPLETE = {
  format: "GGUF", name: "Example Model 8B", architecture: "llama", size_label: "8B",
  quantization: "Q4_K_M", file_type: 15, quantized_by: "quantizer-org",
  repository: "publisher-org/example-model-8B-GGUF",
  base_models: ["upstream-org/example-model-8B"],
  artifact: "q4_k_m/example-model-8B-Q4_K_M.gguf", source: "gguf+huggingface",
};
const field = (metadata: Record<string, unknown>, key: string): unknown =>
  (normalizeModelInfo(described(metadata)) as unknown as Record<string, unknown>)[key];

describe("model metadata", () => {
  it("publishes what was recorded and derives the publisher from the repository namespace alone", () => {
    expect(normalizeModelInfo(described(COMPLETE, { status: "sha256", sha256: "a".repeat(64) }))).toEqual({
      ...COMPLETE, publisher: "publisher-org", sha256: "a".repeat(64), identity_status: "sha256",
    });
    // general.quantized_by names whoever produced the quantized weights, which is
    // routinely a different party. Without a repository there is no publisher.
    expect(normalizeModelInfo(described({ ...COMPLETE, repository: null })))
      .toMatchObject({ publisher: null, repository: null, quantized_by: "quantizer-org" });
  });

  it.each([
    ["name", "vendor/model"], ["name", "vendor\\model"], ["name", "host:model"], ["name", "user@host"],
    ["name", "two\nlines"], ["name", "x".repeat(257)], ["name", ""], ["name", 8],
    ["architecture", "\u0000llama"], ["size_label", "8B:large"], ["quantization", "Q4/K/M"], ["quantized_by", "org@host"],
  ])("leaves an unsafe %s unknown rather than publishing it", (key, value) => {
    expect(field({ ...COMPLETE, [key]: value }, key)).toBeNull();
  });

  it.each(["publisher-org", "a/b/c", "-org/model", "org/model/", "org//model", "org/mo..del",
    `${"x".repeat(129)}/model`, "org/mödel", "org/model?ref=main", 5, null])(
    "rejects %s as a repository and reports no publisher", (value) => {
      expect(normalizeModelInfo(described({ ...COMPLETE, repository: value })))
        .toMatchObject({ repository: null, publisher: null });
    });

  it.each(["../escape.gguf", "a/../b.gguf", "./a.gguf", ".gguf", "/absolute.gguf", "a//b.gguf",
    "C:/models/a.gguf", "share\\a.gguf", "user@host/a.gguf", "notes.txt", "", `${"x".repeat(508)}.gguf`])(
    "rejects %s as an artifact path", (value) => {
      expect(field({ ...COMPLETE, artifact: value }, "artifact")).toBeNull();
    });

  it.each(["a.gguf", "0.gguf", "sub/dir/a.GGUF", `${"x".repeat(507)}.gguf`])(
    "keeps %s as a repo-relative artifact", (value) => {
      expect(field({ ...COMPLETE, artifact: value }, "artifact")).toBe(value);
    });

  it.each([
    ["a bare filename claims no registry origin", { repository: null, source: "gguf+huggingface" }],
    ["an unusable repository claims no origin", { repository: "not-a-repo", source: "gguf+huggingface" }],
    ["a GGUF-only source names no registry", { repository: COMPLETE.repository, source: "gguf" }],
    ["an unknown source names no registry", { repository: COMPLETE.repository, source: "filename" }],
    ["a missing source names no registry", { repository: COMPLETE.repository, source: null }],
  ])("leaves the artifact unknown when %s", (_why, overrides) => {
    expect(field({ ...COMPLETE, artifact: "q4_k_m/example-model-8B-Q4_K_M.gguf", ...overrides }, "artifact")).toBeNull();
  });

  it("keeps only whole in-range file types and known sources, and never invents an enum", () => {
    for (const value of [-1, 65536, 1.5, "15", null]) expect(field({ ...COMPLETE, file_type: value }, "file_type")).toBeNull();
    for (const value of [0, 15, 65535]) expect(field({ ...COMPLETE, file_type: value }, "file_type")).toBe(value);
    expect(field({ ...COMPLETE, source: "filename" }, "source")).toBeNull();
    // An unrecognized quantization stays unknown; the file type it came with is retained.
    expect(normalizeModelInfo(described({ ...COMPLETE, quantization: null })))
      .toMatchObject({ quantization: null, file_type: 15 });
  });

  it("keeps the first eight distinct base models and drops unusable IDs", () => {
    const upstream = Array.from({ length: 10 }, (_, i) => `upstream-org/model-${i}`);
    expect(normalizeModelInfo(described({ ...COMPLETE,
      base_models: [upstream[0], upstream[0], "not-a-repo", ...upstream.slice(1)] }))?.base_models)
      .toEqual(upstream.slice(0, 8));
    expect(normalizeModelInfo(described({ ...COMPLETE, base_models: "upstream-org/model" }))?.base_models).toEqual([]);
  });

  it("publishes nothing for a run that recorded no metadata it can attribute", () => {
    expect(normalizeModelInfo(syntheticSubmission())).toBeNull();
    // Only GGUF weights are described by this block.
    expect(normalizeModelInfo(described({ ...COMPLETE, format: "safetensors" }))).toBeNull();
    for (const metadata of [null, undefined, "GGUF", ["GGUF"]]) expect(normalizeModelInfo(described(metadata))).toBeNull();
  });

  it("never reads a publisher or a quantization out of a filename", () => {
    const summary = summarizeBenchmark(described({ format: "GGUF", artifact: "TheBloke/example-8B-Q4_K_M.gguf" }));
    expect(summary.model_info).toMatchObject({ publisher: null, quantization: null, name: null, repository: null, artifact: null });
    expect(summary.model_label).toBe("unidentified");
  });
});

describe("model labels", () => {
  it("names a described model and otherwise keeps the existing hash-or-status label", () => {
    expect(summarizeBenchmark(described(COMPLETE)).model_label).toBe("Example Model 8B");
    expect(summarizeBenchmark(described({ ...COMPLETE, name: null })).model_label).toBe("publisher-org/example-model-8B-GGUF");
    expect(summarizeBenchmark(described({ ...COMPLETE, name: null, repository: null },
      { status: "sha256", sha256: "b".repeat(64) })).model_label).toBe(`sha256:${"b".repeat(12)}`);
    expect(summarizeBenchmark(syntheticSubmission()).model_label).toBe("unidentified");
    // An unsafe name is not a label either; the fallback takes over.
    expect(modelLabelFor(syntheticSubmission(), normalizeModelInfo(described({ ...COMPLETE, name: "vendor/model", repository: null }))))
      .toBe("unidentified");
  });
});

describe("model names and the weight encoding stay independent", () => {
  it("removes a filename-style quantization suffix without believing it", () => {
    const summary = summarizeBenchmark(described({ ...COMPLETE, name: "Qwen3.8-27B-Q4_K_M", quantization: "Q6_K", file_type: 18 }));
    expect(summary.model_label).toBe("Qwen3.8-27B");
    expect(summary.model_info?.quantization).toBe("Q6_K");
    const missing = summarizeBenchmark(described({ ...COMPLETE, name: "Qwen3.8-27B-Q4_K_M", quantization: null }));
    expect(missing.model_info?.quantization).toBeNull();
  });
  it("keeps fine-tune identity and arbitrary model names", () => {
    expect(summarizeBenchmark(described({ ...COMPLETE, name: "Example-Custom-Instruct-8B", base_models: ["org/Example-8B"] })).model_label).toBe("Example-Custom-Instruct-8B");
    expect(summarizeBenchmark(described({ ...COMPLETE, name: "Q4_K_M" })).model_label).toBe("Q4_K_M");
  });
});

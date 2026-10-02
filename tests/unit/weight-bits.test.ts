import { describe, expect, it } from "vitest";
import encodings from "@/lib/weight-encodings.json";
import { weightBits } from "@/lib/weight-bits";
import { matchesFilters, parseFilters, parseOptionsQuery } from "@/lib/benchmark-discovery";
import { syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark } from "@/lib/summary";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { listSql, optionsSql } from "@/server/benchmark-discovery-sql";
import { activeExplorerFilters, buildExplorerOptionsPath, buildExplorerSearch, explorerReducer, explorerStateFromSearch } from "@/components/benchmark-explorer-state";
import { formatWeightPrecision } from "@/components/benchmark-model-identity";
import type { StoredRun } from "@/server/repository";

function run(id: string, quantization: string | null, file_type: number | null = null): StoredRun {
  const benchmark = syntheticSubmission();
  benchmark.model.metadata = { format: "GGUF", name: "Example", architecture: null, size_label: null, quantization, file_type, quantized_by: null, repository: null, base_models: [], artifact: null, source: "gguf" };
  return { public_id: id, submission_id: id, benchmark, summary: summarizeBenchmark(benchmark), description_md: "", owner_hash: "private", body_sha256: "private", revision: 1, hidden: false, deleted: false, row_count: 1, byte_size: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
}

describe("confirmed weight-bit families", () => {
  it.each(encodings)("uses declared codes and llama_ftype $file_type", encoding => {
    expect(weightBits({ format: "GGUF", file_type: encoding.file_type })).toBe(encoding.bits);
    for (const quantization of encoding.labels) {
      expect(weightBits({ format: "GGUF", quantization })).toBe(encoding.bits);
      expect(weightBits({ format: "GGUF", quantization: ` ${quantization.toLowerCase()} `, file_type: encoding.file_type })).toBe(encoding.bits);
    }
  });
  it.each([null, {}, [], { format: "other", quantization: "NVFP4" },
    { format: "GGUF", quantization: "AWQ" }, { format: "GGUF", quantization: "GPTQ" },
    { format: "GGUF", quantization: "AWQ-4bit" }, { format: "GGUF", quantization: "W4A16" },
    { format: "GGUF", name: "Model-Q4_K_M", artifact: "model-Q4_K_M.gguf", size_bytes: 4096 },
    { format: "GGUF", quantization: "unknown-Q4_K_M" }, { format: "GGUF", quantization: "Q4_K_XL" },
    { format: "GGUF", quantization: "TQ1_0", file_type: 36 },
    { format: "GGUF", quantization: "IQ1_S", file_type: 24 },
    { format: "GGUF", quantization: "IQ1_M", file_type: 31 },
    { format: "GGUF", quantization: "IQ1_M", file_type: 15 },
    { format: "GGUF", quantization: "Q4_K_M", file_type: 36 },
    { format: "GGUF", quantization: "Q4_K_M", file_type: 7 },
    { format: "GGUF", quantization: "Q4_K_M", file_type: 1024 },
    { format: "GGUF", file_type: "15" }, { format: "GGUF", file_type: 15.5 },
    { format: "GGUF", file_type: true }, { format: "GGUF", quantization: 4 }])("leaves insufficient, conflicting or guessed metadata unclassified: %s", info => {
    expect(weightBits(info)).toBeNull();
  });
  it("falls back to a known file type when the recorded name is missing", () => {
    expect(weightBits({ format: "GGUF", quantization: null, file_type: 39 })).toBe(4);
    expect(weightBits({ format: "GGUF", quantization: null, file_type: 7 })).toBe(8);
  });
  it.each(["0", "7", "14", "04", "4.0", "4 bit", "AWQ", "NaN"])("rejects an invalid bit filter %s", value => {
    expect(() => parseFilters(new URLSearchParams({ weight_bits: value }))).toThrow();
  });
  it("binds bit filters exactly and excludes them from their own suggestions", () => {
    expect(parseFilters(new URLSearchParams("weight_bits=4&quantization=q4"))).toEqual({ weight_bits: "4", quantization: "q4" });
    expect(parseOptionsQuery(new URLSearchParams("field=weight_bits&weight_bits=4&publisher=org"))).toEqual({ field: "weight_bits", query: "", filters: { publisher: "org" } });
    const sql = listSql({ weight_bits: "4" }, 25, null);
    expect(sql.query).toContain("bench.model_weight_bits(summary->'model_info')::text = $1");
    expect(sql.values[0]).toBe("4");
    expect(optionsSql("weight_bits", "", {}).query).toContain("bits is not null");
    expect(optionsSql("weight_bits", "", {}).query).toContain("order by bits");
  });
  it("groups formats by bit count, keeps unclassified runs unfiltered, and excludes hidden runs from options", async () => {
    const store = new InMemoryBenchmarkStore();
    for (const r of [run("q4", "Q4_K_M", 15), run("iq4", "IQ4_XS"), run("nvfp4", "NVFP4"), run("q8", "Q8_0"), run("bf16", "BF16"), run("f32", "F32"), run("awq", "AWQ"), run("missing", null), run("conflict", "Q4_K_M", 7)]) store.runs.set(r.public_id, r);
    const hidden = run("hidden", "Q2_K"); hidden.hidden = true; store.runs.set(hidden.public_id, hidden);
    expect((await store.listRuns({}, 25, null)).items).toHaveLength(9);
    expect((await store.listRuns({ weight_bits: "4" }, 25, null)).items.map(r => r.public_id).sort()).toEqual(["iq4", "nvfp4", "q4"]);
    expect((await store.listRuns({ weight_bits: "4", quantization: "nvfp4" }, 25, null)).items.map(r => r.public_id)).toEqual(["nvfp4"]);
    expect(await store.listOptions("weight_bits", "", { weight_bits: "8" })).toEqual({ options: [{ value: "4", count: 3 }, { value: "8", count: 1 }, { value: "16", count: 1 }, { value: "32", count: 1 }], has_more: false });
    expect(matchesFilters(store.runs.get("awq")!.summary, { weight_bits: "4" })).toBe(false);
  });
  it("keeps bit filters in links, active chips, apply/reset and suggestion constraints", () => {
    const initial = explorerStateFromSearch("?weight_bits=4&quantization=Q4_K_M");
    expect(buildExplorerSearch({ filters: initial.applied, cursor: null })).toContain("weight_bits=4");
    expect(activeExplorerFilters(initial.applied).find(item => item.key === "weight_bits")?.value).toBe("4 bit");
    expect(buildExplorerOptionsPath("quantization", "", initial.draft)).toContain("weight_bits=4");
    expect(buildExplorerOptionsPath("weight_bits", "", initial.draft)).not.toContain("weight_bits=");
    const draft = explorerReducer(initial, { type: "draft", key: "weight_bits", value: "8" });
    expect(draft.applied.weight_bits).toBe("4");
    expect(explorerReducer(draft, { type: "apply" }).applied.weight_bits).toBe("8");
    expect(explorerReducer(draft, { type: "reset" }).applied.weight_bits).toBe("");
  });
  it("displays the bit family alongside the original encoding without assigning method defaults", () => {
    expect(formatWeightPrecision(run("q4", "Q4_K_M").summary.model_info!)).toBe("4 bit · Q4_K_M");
    expect(formatWeightPrecision(run("awq", "AWQ").summary.model_info!)).toBe("AWQ");
    expect(formatWeightPrecision(run("type", null, 39).summary.model_info!)).toBe("4 bit");
  });
});

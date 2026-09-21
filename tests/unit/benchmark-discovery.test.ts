import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { syntheticSubmission } from "@/lib/fixtures";
import { matchesFilters, MODEL_INFO_SEARCH_KEYS, normalizeSetup, numericValue, parseFilters, parseOptionsQuery, sortValue, SORT_VALUES } from "@/lib/benchmark-discovery";
import { summarizeBenchmark } from "@/lib/summary";
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "@/lib/pagination";
import { listSql, literalPattern, optionsSql } from "@/server/benchmark-discovery-sql";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { GET as list } from "@/app/v1/benchmark-runs/route";
import { GET as options } from "@/app/v1/benchmark-runs/options/route";
import { freshStore, setupTestEnv } from "./helpers";
import type { StoredRun } from "@/server/repository";
import type { BenchmarkFilters } from "@/lib/benchmark-discovery";

setupTestEnv();
let store: InMemoryBenchmarkStore;
beforeEach(() => { store = freshStore(); });
// The second argument drives the context condition, which reads the largest
// configured input length. The raw allocation keeps the fixture's 2048 throughout.
function run(id: string, promptLength: number | null = 512): StoredRun {
  const benchmark = syntheticSubmission();
  const summary = summarizeBenchmark(benchmark);
  summary.setup!.prompt_length = promptLength;
  return { public_id: id, submission_id: id, benchmark, summary, description_md: "", owner_hash: "private", body_sha256: "private", revision: 1, hidden: false, deleted: false, row_count: 1, byte_size: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" };
}
const gpu = (name: string, vendor: string, vram_mb: number | null) => ({ name, vendor, vram_mb, driver: null, integrated: false });

describe("discovery setup", () => {
  it("keeps runtime/settings without environment and never substitutes installed GPUs", () => {
    const b = syntheticSubmission({ environment: null });
    expect(normalizeSetup(b)).toMatchObject({ os: null, cores: null, runtime: "llama.cpp", context_size: 2048, prompt_length: 512, vram_mb: null });
    const installed = syntheticSubmission(); installed.environment!.installed_gpus = [gpu("Not measured", "Vendor", 8192)];
    expect(summarizeBenchmark(installed)).toMatchObject({ hardware_label: "cpu", setup: { gpus: [], vendors: [], vram_mb: null } });
  });
  it("sums only complete known selected memory and preserves unknowns", () => {
    const b = syntheticSubmission(); b.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [gpu("A", "V", 4096), gpu("B", "V", 8192)] };
    expect(normalizeSetup(b)).toMatchObject({ vendors: ["V"], gpus: ["A", "B"], vram_mb: 12288 });
    b.environment!.execution.selection_complete = false; expect(normalizeSetup(b).vram_mb).toBeNull();
    b.environment!.execution.selection_complete = true; b.environment!.execution.selected_gpus[0].vram_mb = null; expect(normalizeSetup(b).vram_mb).toBeNull();
    expect(matchesFilters(summarizeBenchmark(b), { vram_min: 0 })).toBe(false);
  });
});

describe("discovery query validation", () => {
  it.each(["context_min=NaN", "vram_min=1.2", "cores_min=-1", "threads_min=9007199254740992", "parallel_min=5&parallel_max=4", "gpu_layers_min=-2", "sort=random", `q=${"x".repeat(121)}`])("rejects %s", query => expect(() => parseFilters(new URLSearchParams(query))).toThrow());
  it("normalizes sentinel, free text and literal wildcard text", () => {
    expect(parseFilters(new URLSearchParams("gpu_layers_min=-1&gpu=Other%25_%5C&sort=newest"))).toEqual({ gpu_layers_min: -1, gpu: "Other%_\\" });
    expect(literalPattern("a%_\\")).toBe("%a\\%\\_\\\\%");
    expect(parseOptionsQuery(new URLSearchParams("field=gpu&gpu=old&vendor=V&option_query=new"))).toEqual({ field: "gpu", query: "new", filters: { vendor: "V" } });
  });
  it("binds cursors to filters and sort", () => {
    const token = encodeDiscoveryCursor("2026-01-01T00:00:00Z", "a", { os: "linux", sort: "context_asc" }, 512);
    expect(decodeDiscoveryCursor(token, { sort: "context_asc", os: "linux" })?.value).toBe(512);
    expect(() => decodeDiscoveryCursor(token, { os: "windows", sort: "context_asc" })).toThrow();
    expect(() => decodeDiscoveryCursor("garbage", {})).toThrow();
  });
});

describe("discovery API and memory queries", () => {
  it.each(SORT_VALUES)("pages %s without gaps, repeats or hidden records", async sort => {
    for (let i = 0; i < 7; i++) { const r = run(`id${i}`, i === 0 ? null : i % 3); r.summary.setup!.vram_mb = i === 0 ? null : i % 3; r.summary.mean_tg_tps = i === 0 ? null : i % 3; r.summary.mean_e2e_ms = i === 0 ? null : i % 3; store.runs.set(r.public_id, r); }
    const hidden = run("hidden"); hidden.hidden = true; store.runs.set("hidden", hidden);
    const deleted = run("deleted"); deleted.deleted = true; store.runs.set("deleted", deleted);
    const filters: BenchmarkFilters = { sort };
    const expected = (await store.listRuns(filters, 100, null)).items.map(r => r.public_id);
    const ids: string[] = []; let cursor = null;
    do { const page = await store.listRuns(filters, 2, cursor); ids.push(...page.items.map(r => r.public_id)); cursor = decodeDiscoveryCursor(page.next_cursor, filters); } while (cursor);
    expect(ids).toEqual(expected); expect(new Set(ids).size).toBe(7);
    if (sort !== "newest" && sort !== "oldest") expect(ids.at(-1)).toBe("id0");
    if (sort === "context_asc") expect(ids).toEqual(["id6", "id3", "id4", "id1", "id5", "id2", "id0"]);
  });
  it("searches all options, ignores own filter, counts runs and honors visibility", async () => {
    for (let i = 0; i < 40; i++) { const r = run(`id${i}`); r.summary.setup!.os = `OS${String(i).padStart(2,"0")}`; store.runs.set(r.public_id, r); }
    expect(await store.listOptions("os", "", { os: "absent" })).toMatchObject({ has_more: true, options: expect.any(Array) });
    expect((await store.listOptions("os", "", {})).options).toHaveLength(30);
    expect(await store.listOptions("os", "OS39", {})).toEqual({ options: [{ value: "OS39", count: 1 }], has_more: false });
    store.runs.get("id39")!.hidden = true; expect((await store.listOptions("os", "OS39", {})).options).toEqual([]);
    store.runs.get("id38")!.deleted = true; expect((await store.listOptions("os", "OS38", {})).options).toEqual([]);
    expect((await store.listOptions("os", "", { cores_min: 8 })).options).toEqual([]);
  });
  it("pairs vendor options with selected devices and counts duplicate devices once per run", async () => {
    const r = run("multi"); r.benchmark.environment!.execution.mode = "selected"; r.benchmark.environment!.execution.selected_gpus = [gpu("A", "Alpha", 1), gpu("B", "Beta", 2), gpu("A", "Alpha", 1)]; r.summary = summarizeBenchmark(r.benchmark); store.runs.set("multi", r);
    expect(await store.listOptions("gpu", "", { vendor: "Alpha" })).toEqual({ options: [{ value: "A", count: 1 }], has_more: false });
  });
  it.each(["context_min=bad", "context_min=9&context_max=1", "sort=invalid", "cursor=broken"])("returns API 400 for %s", async query => expect((await list(new Request(`http://localhost/v1/benchmark-runs?${query}`))).status).toBe(400));
  it("returns no-store public summaries and validates option fields", async () => {
    store.runs.set("a", run("a")); const response = await list(new Request("http://localhost/v1/benchmark-runs"));
    expect(response.headers.get("cache-control")).toBe("no-store"); const body = await response.json();
    expect(body.items[0]).not.toHaveProperty("benchmark"); expect(body.items[0]).not.toHaveProperty("owner_hash"); expect(body.items[0].summary.setup.context_size).toBe(2048);
    expect((await options(new Request("http://localhost/v1/benchmark-runs/options?field=q"))).status).toBe(400);
    const suggestions = await options(new Request("http://localhost/v1/benchmark-runs/options?field=os")); expect(suggestions.headers.get("cache-control")).toBe("no-store"); expect((await suggestions.json()).options).toEqual([{ value: "synthetic", count: 1 }]);
  });
});

it("builds bounded parameterized SQL with literal patterns and null-aware keysets", () => {
  const text = "x%' OR true --";
  const statement = listSql({ gpu: text, sort: "context_asc" }, 25, { createdAt: "2026-01-01", publicId: "id", value: 2048 });
  expect(statement.query).not.toContain(text); expect(statement.values).toContain(literalPattern(text)); expect(statement.query).toContain("nulls last"); expect(statement.query).toContain("is null or"); expect(statement.values.at(-1)).toBe(26);
  expect(optionsSql("os", "beyond", { os: "ignored" }).query).toContain("limit 31"); expect(optionsSql("os", "beyond", { os: "ignored" }).values).toEqual(["%beyond%"]);
});

it("matches all supported setup strings and numeric ranges without invented defaults", () => {
  const b = syntheticSubmission(); b.runtime = { name: "llama.cpp", version: "revision-example", backend: "Vulkan", build: null };
  b.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [gpu("GPU_%\\literal", "ExampleVendor", 8192)] };
  b.execution.settings = { threads: 3, threads_batch: null, gpu_layers: -1, flash_attention: "on", cache_type_k: "q8_0", cache_type_v: "f16", split_mode: "layer", tensor_split: null };
  const summary = summarizeBenchmark(b);
  const filters: BenchmarkFilters = { q: "revision-example", model: "identified", hardware: "_%\\", vendor: "example", gpu: "gpu_", cpu: "synthetic", os: "SYNTHETIC", arch: "x64", runtime: "llama", backend: "vulkan", mode: "selected", method: "cold-prompt", workload: "python", flash_attention: "on", cache_type_k: "q8", cache_type_v: "f16", split_mode: "layer", context_min: 512, context_max: 512, vram_min: 8192, cores_max: 4, parallel_min: 1, threads_min: 3, gpu_layers_min: -1, gpu_layers_max: -1 };
  expect(matchesFilters(summary, filters)).toBe(true);
  expect(matchesFilters(summary, { gpu: "missing%" })).toBe(false);
  expect(matchesFilters(summary, { context_min: 2048, context_max: 2048 })).toBe(false);
  expect(matchesFilters(summary, { threads_min: 4 })).toBe(false);
  expect(matchesFilters(summary, { q: "complete" })).toBe(true);
});

it("orders timestamps consistently and rejects using an API cursor after filters change", async () => {
  const early = run("early"), late = run("late"); late.created_at = "2026-01-02T00:00:00Z";
  store.runs.set("early", early); store.runs.set("late", late);
  expect((await store.listRuns({ sort: "oldest" }, 10, null)).items.map(r => r.public_id)).toEqual(["early", "late"]);
  const page = await (await list(new Request("http://localhost/v1/benchmark-runs?limit=1"))).json();
  expect(page.items[0].public_id).toBe("late");
  const changed = await list(new Request(`http://localhost/v1/benchmark-runs?os=other&cursor=${page.next_cursor}`));
  expect(changed.status).toBe(400);
});

it("preserves fractional selected VRAM and suppresses stale GPUs in CPU mode", () => {
  const b = syntheticSubmission();
  b.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [gpu("Fractional", "Vendor", 4096.5), gpu("Second", "Vendor", 4096.25)] };
  expect(normalizeSetup(b).vram_mb).toBe(8192.75);
  b.environment!.execution.mode = "cpu";
  expect(summarizeBenchmark(b)).toMatchObject({ hardware_label: "cpu", setup: { vendors: [], gpus: [], vram_mb: null } });
});

describe("configured input context", () => {
  it("records sorted unique input lengths beside the untouched raw allocation", () => {
    const b = syntheticSubmission();
    b.workload.prompt_lengths = [4096, 512, 4096, 1024];
    b.execution.context_size = 16896;
    const summary = summarizeBenchmark(b);
    expect(summary.prompt_lengths).toEqual([512, 1024, 4096]);
    expect(summary.setup!.prompt_length).toBe(4096);
    expect(summary.setup!.context_size).toBe(16896);
  });

  it("keeps only whole token counts a reader can represent exactly", () => {
    const b = syntheticSubmission();
    b.workload.prompt_lengths = [0, -512, 512.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, 2048];
    expect(summarizeBenchmark(b).prompt_lengths).toEqual([2048]);
    expect(normalizeSetup(b).prompt_length).toBe(2048);
  });

  it("leaves the input length unknown instead of inferring it from the allocation", () => {
    const b = syntheticSubmission();
    b.workload.prompt_lengths = [];
    b.execution.context_size = 8704;
    const summary = summarizeBenchmark(b);
    expect(summary.prompt_lengths).toEqual([]);
    expect(summary.setup!.prompt_length).toBeNull();
    expect(sortValue(summary, { sort: "context_asc" })).toBeNull();
    for (const filters of [{ context_min: 0 }, { context_max: 8704 }, { context_min: 8704, context_max: 8704 }]) {
      expect(matchesFilters(summary, filters)).toBe(false);
    }
  });

  it("filters and sorts context on the largest configured input length, never on the allocation", () => {
    const b = syntheticSubmission();
    b.workload.prompt_lengths = [4096];
    b.execution.context_size = 16896;
    const summary = summarizeBenchmark(b);
    expect(numericValue(summary, "context")).toBe(4096);
    expect(sortValue(summary, { sort: "context_desc" })).toBe(4096);
    expect(matchesFilters(summary, { context_min: 4096, context_max: 4096 })).toBe(true);
    expect(matchesFilters(summary, { context_min: 8192 })).toBe(false);
    expect(matchesFilters(summary, { context_min: 16896, context_max: 16896 })).toBe(false);
  });

  it("reads the configured input length in generated list SQL", () => {
    const statement = listSql({ context_min: 512, context_max: 4096, sort: "context_desc" }, 5, null);
    expect(statement.query).toContain("summary->'setup'->>'prompt_length'");
    expect(statement.query).not.toContain("context_size");
  });

  it("orders a page by the configured input length while allocations disagree", async () => {
    for (const [id, promptLength, context] of [["small", 512, 16896], ["large", 4096, 2048]] as const) {
      const r = run(id, promptLength); r.summary.setup!.context_size = context; store.runs.set(id, r);
    }
    expect((await store.listRuns({ sort: "context_asc" }, 10, null)).items.map(r => r.public_id)).toEqual(["small", "large"]);
    expect((await store.listRuns({ context_min: 4096 }, 10, null)).items.map(r => r.public_id)).toEqual(["large"]);
  });
});

describe("prefill average", () => {
  const rowsWith = (overrides: Array<Partial<ReturnType<typeof syntheticSubmission>["measurements"]["rows"][number]>>) => {
    const base = syntheticSubmission().measurements.rows[0]!;
    return overrides.map(o => ({ ...base, ...o }));
  };

  it("averages measured rows and ignores failed, missing and non-finite prefill", () => {
    const b = syntheticSubmission();
    b.measurements.rows = rowsWith([
      { pp_tps: 100 }, { pp_tps: 300 },
      { pp_tps: 9999, failed: true }, { pp_tps: null }, { pp_tps: Number.POSITIVE_INFINITY },
    ]);
    const summary = summarizeBenchmark(b);
    expect(summary.mean_pp_tps).toBe(200);
    expect(summary.failed_rows).toBe(0);
    expect(summary.row_count).toBe(4);
  });

  it("reports an unknown prefill average when nothing measured it", () => {
    const b = syntheticSubmission();
    b.measurements.rows = rowsWith([{ pp_tps: null }, { pp_tps: 500, failed: true }]);
    expect(summarizeBenchmark(b).mean_pp_tps).toBeNull();
    b.measurements.rows = [];
    expect(summarizeBenchmark(b).mean_pp_tps).toBeNull();
  });

  it("excludes failed measurements from generation and duration means", () => {
    const b = syntheticSubmission();
    b.measurements.rows = rowsWith([{ tg_tps: 10, e2e_ms: 100 }, { tg_tps: 30, e2e_ms: 300, failed: true, pp_tps: null }]);
    const summary = summarizeBenchmark(b);
    expect(summary.mean_tg_tps).toBe(10);
    expect(summary.mean_e2e_ms).toBe(100);
    expect(summary.mean_pp_tps).toBe(100);
  });
});

describe("context cursor meaning", () => {
  // How the binding was hashed while context meant the raw runtime allocation.
  const legacyBinding = (filters: BenchmarkFilters) => createHash("sha256").update(JSON.stringify([
    filters.sort ?? "newest",
    Object.entries(filters).filter(([key]) => key !== "sort").sort(([a], [b]) => a.localeCompare(b)),
  ])).digest("hex");
  const legacyCursor = (filters: BenchmarkFilters, value: number | null) => Buffer
    .from(JSON.stringify({ c: "2026-01-01T00:00:00Z", p: "a", v: value, b: legacyBinding(filters) })).toString("base64url");

  it("retires cursors whose context boundary was drawn on the runtime allocation", () => {
    const contextQueries: BenchmarkFilters[] = [
      { sort: "context_asc" }, { sort: "context_desc" }, { context_min: 512 },
      { context_max: 8704 }, { context_min: 512, context_max: 8704 }, { os: "linux", sort: "context_asc" },
    ];
    for (const filters of contextQueries) {
      // 8704 was a server-side allocation; resuming there against input lengths would skip results.
      expect(() => decodeDiscoveryCursor(legacyCursor(filters, 8704), filters)).toThrow();
      const fresh = encodeDiscoveryCursor("2026-01-01T00:00:00Z", "a", filters, 4096);
      expect(decodeDiscoveryCursor(fresh, filters)?.value).toBe(4096);
    }
  });

  it("keeps cursors for every query that does not read context", () => {
    const unaffected: BenchmarkFilters[] = [
      {}, { sort: "oldest" }, { sort: "vram_desc" }, { sort: "throughput_desc" },
      { sort: "duration_asc" }, { os: "linux" }, { vram_min: 1024 }, { cores_min: 4, sort: "newest" },
    ];
    for (const filters of unaffected) {
      expect(decodeDiscoveryCursor(legacyCursor(filters, 1024), filters)?.value).toBe(1024);
    }
  });
});

describe("model metadata discovery", () => {
  // Contract 0.3.0 metadata attached directly: the vendored 0.2.0 types do not
  // carry the optional block yet, and parsing it is the contracts package's job.
  const METADATA = { format: "GGUF", name: "Example 8B", architecture: "qwen2", size_label: "8B",
    quantization: "Q4_K_M", file_type: 15, quantized_by: "Quantizer Org",
    repository: "Publisher-Org/example-8B-GGUF", base_models: ["Upstream-Org/example-8B", "Other-Org/mixin-2B"],
    artifact: "q4/example-8B-Q4_K_M.gguf", source: "gguf+huggingface" };
  function described(id: string, overrides: Record<string, unknown> = {}): StoredRun {
    const stored = run(id);
    stored.benchmark.model = { status: "sha256", sha256: "c".repeat(64), size_bytes: 1,
      metadata: { ...METADATA, ...overrides } } as never;
    stored.summary = summarizeBenchmark(stored.benchmark);
    return stored;
  }

  it.each([["publisher", "publisher-org"], ["quantization", "q4_k"], ["base_model", "upstream-org/example"]])(
    "filters on %s and leaves a run that recorded no metadata out", async (key, value) => {
      store.runs.set("described", described("described"));
      store.runs.set("undescribed", run("undescribed"));
      expect((await store.listRuns({ [key]: value }, 10, null)).items.map(i => i.public_id)).toEqual(["described"]);
    });

  it("never reads the quantizer as a publisher and never matches across two base models", () => {
    const summary = described("described").summary;
    expect(matchesFilters(summary, { publisher: "Publisher-Org" })).toBe(true);
    expect(matchesFilters(summary, { publisher: "Quantizer" })).toBe(false);
    expect(matchesFilters(summary, { base_model: "example-8B" })).toBe(true);
    expect(matchesFilters(summary, { base_model: "example-8BOther-Org" })).toBe(false);
    expect(matchesFilters(run("undescribed").summary, { publisher: "Publisher-Org" })).toBe(false);
  });

  it("searches every precise model identifier from the global query", async () => {
    store.runs.set("described", described("described"));
    store.runs.set("undescribed", run("undescribed"));
    for (const q of ["example 8b", "publisher-org/example-8b-gguf", "q4/example-8B-Q4_K_M.gguf", "qwen2",
      "8B", "quantizer org", "upstream-org/example-8B", "c".repeat(64)]) {
      expect((await store.listRuns({ q }, 10, null)).items.map(i => i.public_id)).toEqual(["described"]);
    }
  });

  it("suggests editable options for every model filter, counting visible runs", async () => {
    store.runs.set("a", described("a"));
    store.runs.set("b", described("b", { repository: "Other-Org/example-8B-GGUF" }));
    expect(await store.listOptions("publisher", "", {}))
      .toEqual({ options: [{ value: "Other-Org", count: 1 }, { value: "Publisher-Org", count: 1 }], has_more: false });
    expect((await store.listOptions("base_model", "upstream", {})).options)
      .toEqual([{ value: "Upstream-Org/example-8B", count: 2 }]);
    expect((await store.listOptions("quantization", "", { publisher: "other" })).options)
      .toEqual([{ value: "Q4_K_M", count: 1 }]);
  });

  it("reads corrupted model metadata as unknown instead of crashing", () => {
    const summary = described("corrupt").summary;
    (summary.model_info as unknown as Record<string, unknown>).publisher = true;
    (summary.model_info as unknown as Record<string, unknown>).quantization = 4;
    (summary.model_info as unknown as Record<string, unknown>).base_models = "Upstream-Org/example-8B";
    (summary.model_info as unknown as Record<string, unknown>).sha256 = false;
    expect(matchesFilters(summary, { publisher: "true" })).toBe(false);
    expect(matchesFilters(summary, { quantization: "4" })).toBe(false);
    expect(matchesFilters(summary, { base_model: "upstream" })).toBe(false);
    expect(matchesFilters(summary, { q: "true" })).toBe(false);
    expect(matchesFilters(summary, { q: "Example 8B" })).toBe(true);
  });

  it("binds model metadata conditions as literal parameters", () => {
    const text = "x%' OR true --";
    const statement = listSql({ q: text, publisher: text, base_model: text }, 25, null);
    expect(statement.query).not.toContain(text);
    expect(statement.values.filter(v => v === literalPattern(text))).toHaveLength(3);
    expect(statement.query).toContain("summary->'model_info'->>'publisher' ilike $2");
    // A base model matches only when one entry matches, never across two of them.
    expect(statement.query).toContain("jsonb_array_elements_text(coalesce(summary->'model_info'->'base_models', '[]'::jsonb)) as element(value) where value ilike $3");
    for (const key of MODEL_INFO_SEARCH_KEYS) expect(statement.query).toContain(`summary->'model_info'->>'${key}' ilike $1`);
    expect(optionsSql("base_model", "upstream", {}).query)
      .toContain("jsonb_array_elements_text(coalesce(summary->'model_info'->'base_models', '[]'::jsonb)) as value");
    expect(optionsSql("publisher", "org", {}).values).toEqual(["%org%"]);
  });
});

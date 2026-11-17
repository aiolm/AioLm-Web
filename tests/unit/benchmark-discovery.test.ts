import { beforeEach, describe, expect, it } from "vitest";
import { syntheticSubmission } from "@/lib/fixtures";
import { matchesFilters, normalizeSetup, numericValue, parseFilters, parseOptionsQuery, sortValue, SORT_VALUES, TEXT_FILTER_MAX_LENGTH, textValues } from "@/lib/benchmark-discovery";
import { summarizeBenchmark } from "@/lib/summary";
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "@/lib/pagination";
import { listSql, literalPattern, optionsSql } from "@/server/benchmark-discovery-sql";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { GET as listRequest } from "@/app/v1/benchmark-runs/route";
import { GET as optionsRequest } from "@/app/v1/benchmark-runs/options/route";
import { freshStore, setupTestEnv } from "./helpers";
import type { StoredRun } from "@/server/repository";
import type { BenchmarkFilters } from "@/lib/benchmark-discovery";

setupTestEnv();
let store: InMemoryBenchmarkStore;
beforeEach(() => { store = freshStore(); });
const list = (request: Request) => listRequest(request);
const options = (request: Request) => optionsRequest(request);
function run(id: string): StoredRun {
  const benchmark = syntheticSubmission();
  return {
    public_id: id, submission_id: id, benchmark, summary: summarizeBenchmark(benchmark), description_md: "",
    owner_hash: "private", body_sha256: "private", revision: 1, hidden: false, deleted: false,
    row_count: 1, byte_size: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  };
}
const gpu = (name: string, vendor: string, vram_mb: number | null) => ({ name, vendor, vram_mb, driver: null, integrated: false });

describe("discovery setup", () => {
  it.each([
    [["R9700", "R9700"], "R9700 x 2"],
    [["RTX 4090", "RTX 4090", "RTX 4090"], "RTX 4090 x 3"],
    [["R9700", "RTX 4090", "R9700", "RTX 4090"], "R9700 x 2 + RTX 4090 x 2"],
    [["R9700", "RTX 4090"], "R9700 + RTX 4090"],
    [["R9700"], "R9700"],
  ])("counts selected GPUs in the searchable hardware label: %s", (names, label) => {
    const b = syntheticSubmission();
    b.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: names.map(name => gpu(name, "Vendor", 4096)) };
    const summary = summarizeBenchmark(b);
    expect(summary.hardware_label).toBe(label);
    expect(summary.setup.gpus).toEqual([...new Set(names)]);
    expect(matchesFilters(summary, { hardware: label })).toBe(true);
    expect(matchesFilters(summary, { q: label })).toBe(true);
  });
  it("counts vendor and unknown fallbacks without using installed GPUs", () => {
    const b = syntheticSubmission();
    b.environment!.execution = { mode: "selected", selection_complete: false, selected_gpus: [
      { ...gpu("unused", "AMD", null), name: null },
      { ...gpu("unused", "AMD", null), name: null },
      { ...gpu("unused", "unused", null), name: null, vendor: null },
    ] };
    expect(summarizeBenchmark(b).hardware_label).toBe("AMD x 2 + gpu");
  });
  it("offers counted hardware suggestions that filter the corresponding runs", async () => {
    const r = run("dual-gpu");
    r.benchmark.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [gpu("R9700", "AMD", 32768), gpu("R9700", "AMD", 32768)] };
    r.summary = summarizeBenchmark(r.benchmark);
    store.runs.set(r.public_id, r);
    expect(await store.listOptions("hardware", "R9700", {})).toEqual({ options: [{ value: "R9700 x 2", count: 1 }], has_more: false });
    expect((await store.listRuns({ hardware: "R9700 x 2" }, 25, null)).items.map(item => item.public_id)).toEqual([r.public_id]);
  });
  it("keeps runtime/settings without environment and never substitutes installed GPUs", () => {
    const b = syntheticSubmission({ environment: null });
    expect(normalizeSetup(b)).toMatchObject({
      os: null, cores: null, runtime: "sglang", max_input_bytes: 4096, max_output_tokens: 128,
      vram_mb: null, host_gpus: null, execution_selection_complete: null,
    });
    expect(summarizeBenchmark(b).hardware_label).toBe("unknown");
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

describe("runtime build", () => {
  it("carries the submitted build in new summaries and searches it", () => {
    const built = run("built");
    built.benchmark.runtime.version = "0.3.0-dev";
    built.benchmark.runtime.build = "b10638";
    built.summary = summarizeBenchmark(built.benchmark);
    expect(built.summary.setup).toMatchObject({ runtime_version: "0.3.0-dev", runtime_build: "b10638" });
    expect(matchesFilters(built.summary, { runtime_build: "b10638" })).toBe(true);
    const none = run("none");
    expect(none.summary.setup.runtime_build).toBeNull();
  });
});

describe("discovery query validation", () => {
  it.each([
    "input_bytes_min=NaN", "vram_min=1.2", "cores_min=-1", "repetitions_min=9007199254740992",
    "max_concurrency_min=5&max_concurrency_max=4", "sort=random", `q=${"x".repeat(121)}`,
  ])("rejects %s", query => expect(() => parseFilters(new URLSearchParams(query))).toThrow());
  it("normalizes free text, literal wildcard text and option queries", () => {
    expect(parseFilters(new URLSearchParams("gpu=Other%25_%5C&sort=newest"))).toEqual({ gpu: "Other%_\\" });
    expect(literalPattern("a%_\\")).toBe("%a\\%\\_\\\\%");
    expect(parseOptionsQuery(new URLSearchParams("field=gpu&gpu=old&vendor=V&option_query=new"))).toEqual({ field: "gpu", query: "new", filters: { vendor: "V" } });
  });
  it("binds cursors to filters and sort", () => {
    const token = encodeDiscoveryCursor("2026-01-01T00:00:00Z", "a", { os: "linux", sort: "input_bytes_asc" }, 512);
    expect(decodeDiscoveryCursor(token, { sort: "input_bytes_asc", os: "linux" })?.value).toBe(512);
    expect(() => decodeDiscoveryCursor(token, { os: "windows", sort: "input_bytes_asc" })).toThrow();
    expect(() => decodeDiscoveryCursor("garbage", {})).toThrow();
  });
});

describe("discovery API and memory queries", () => {
  it.each(SORT_VALUES.filter(s => !["token_rate_desc", "output_rate_desc", "duration_asc"].includes(s)))("pages %s without gaps, repeats or hidden records", async sort => {
    for (let i = 0; i < 7; i++) {
      const r = run(`id${i}`);
      r.summary.setup.vram_mb = i === 0 ? null : i % 3;
      // max_input_bytes is derived, never absent; keep the missing-value case last.
      r.summary.setup.max_input_bytes = i === 0 ? 9 : i % 3;
      store.runs.set(r.public_id, r);
    }
    const hidden = run("hidden"); hidden.hidden = true; store.runs.set("hidden", hidden);
    const deleted = run("deleted"); deleted.deleted = true; store.runs.set("deleted", deleted);
    const filters: BenchmarkFilters = { sort };
    const expected = (await store.listRuns(filters, 100, null)).items.map(r => r.public_id);
    const ids: string[] = []; let cursor = null;
    do { const page = await store.listRuns(filters, 2, cursor); ids.push(...page.items.map(r => r.public_id)); cursor = decodeDiscoveryCursor(page.next_cursor, filters); } while (cursor);
    expect(ids).toEqual(expected); expect(new Set(ids).size).toBe(7);
    // id0 is the missing-VRAM / largest-input run: it sorts last ascending.
    if (sort === "vram_asc" || sort === "input_bytes_asc") expect(ids.at(-1)).toBe("id0");
    if (sort === "vram_asc") expect(ids).toEqual(["id6", "id3", "id4", "id1", "id5", "id2", "id0"]);
    if (sort === "input_bytes_asc") expect(ids).toEqual(["id6", "id3", "id4", "id1", "id5", "id2", "id0"]);
  });
  it.each([
    ["token_rate_desc", "reported_tokens_per_second"],
    ["output_rate_desc", "output_bytes_per_second"],
    ["duration_asc", "e2e_ms"],
  ] as const)("pages %s at the selected operating point", async (sort, metric) => {
    for (let i = 0; i < 7; i++) {
      const r = run(`id${i}`);
      if (i === 0) {
        r.benchmark.measurements.rows = [];
      } else {
        const row = r.benchmark.measurements.rows[0]!;
        if (metric === "reported_tokens_per_second") { row.e2e_ms = 1000; row.reported_completion_tokens = i % 3; }
        if (metric === "output_bytes_per_second") { row.e2e_ms = 1000; row.output_bytes = i % 3; }
        if (metric === "e2e_ms") { row.e2e_ms = i % 3; row.output_bytes = 0; row.reported_completion_tokens = null; }
      }
      r.summary = summarizeBenchmark(r.benchmark);
      store.runs.set(r.public_id, r);
    }
    const filters: BenchmarkFilters = { sort, point_bytes: 4096, point_concurrency: 1, point_max_tokens: 128 };
    const expected = (await store.listRuns(filters, 100, null)).items.map(r => r.public_id);
    const ids: string[] = []; let cursor = null;
    do { const page = await store.listRuns(filters, 2, cursor); ids.push(...page.items.map(r => r.public_id)); cursor = decodeDiscoveryCursor(page.next_cursor, filters); } while (cursor);
    expect(ids).toEqual(expected); expect(new Set(ids).size).toBe(7);
    expect(ids.at(-1)).toBe("id0");
  });
  it("searches all options, ignores own filter, counts runs and honors visibility", async () => {
    for (let i = 0; i < 40; i++) { const r = run(`id${i}`); r.summary.setup.os = `OS${String(i).padStart(2, "0")}`; store.runs.set(r.public_id, r); }
    expect(await store.listOptions("os", "", { os: "absent" })).toMatchObject({ has_more: true, options: expect.any(Array) });
    expect((await store.listOptions("os", "", {})).options).toHaveLength(30);
    expect(await store.listOptions("os", "OS39", {})).toEqual({ options: [{ value: "OS39", count: 1 }], has_more: false });
    store.runs.get("id39")!.hidden = true; expect((await store.listOptions("os", "OS39", {})).options).toEqual([]);
    store.runs.get("id38")!.deleted = true; expect((await store.listOptions("os", "OS38", {})).options).toEqual([]);
    expect((await store.listOptions("os", "", { cores_min: 9 })).options).toEqual([]);
  });
  it("pairs vendor options with selected devices and counts duplicate devices once per run", async () => {
    const r = run("multi"); r.benchmark.environment!.execution.mode = "selected"; r.benchmark.environment!.execution.selected_gpus = [gpu("A", "Alpha", 1), gpu("B", "Beta", 2), gpu("A", "Alpha", 1)]; r.summary = summarizeBenchmark(r.benchmark); store.runs.set("multi", r);
    expect(await store.listOptions("gpu", "", { vendor: "Alpha" })).toEqual({ options: [{ value: "A", count: 1 }], has_more: false });
  });
  it.each(["input_bytes_min=bad", "input_bytes_min=9&input_bytes_max=1", "sort=invalid", "cursor=broken"])("returns API 400 for %s", async query => expect((await list(new Request(`http://localhost/v1/benchmark-runs?${query}`))).status).toBe(400));
  it("returns no-store public summaries and validates option fields", async () => {
    store.runs.set("a", run("a")); const response = await list(new Request("http://localhost/v1/benchmark-runs"));
    expect(response.headers.get("cache-control")).toBe("no-store"); const body = await response.json();
    expect(body.items[0]).not.toHaveProperty("benchmark"); expect(body.items[0]).not.toHaveProperty("owner_hash"); expect(body.items[0].summary.setup.max_input_bytes).toBe(4096);
    expect((await options(new Request("http://localhost/v1/benchmark-runs/options?field=q"))).status).toBe(400);
    const suggestions = await options(new Request("http://localhost/v1/benchmark-runs/options?field=os")); expect(suggestions.headers.get("cache-control")).toBe("no-store"); expect((await suggestions.json()).options).toEqual([{ value: "synthetic", count: 1 }]);
  });
});

it("parameterizes SQL with literal search patterns", () => {
  const text = "x%' OR true --";
  const statement = listSql({ gpu: text, sort: "input_bytes_asc" }, 25, { createdAt: "2026-01-01", publicId: "id", value: 2048 });
  expect(statement.query).not.toContain(text);
  expect(statement.values).toContain(literalPattern(text));
  expect(optionsSql("os", "beyond", { os: "ignored" }).values).toEqual(["%beyond%"]);
});

it("binds point sorts to the selected serving operating point", () => {
  const filters: BenchmarkFilters = { point_bytes: 4096, point_concurrency: 1, point_max_tokens: 128, sort: "output_rate_desc" };
  const statement = listSql(filters, 25, null);
  expect(statement.query).toContain("output_bytes_per_second");
  expect(statement.query).toContain("point->>'input_bytes'");
  expect(statement.query).not.toContain("method_version");
  expect(optionsSql("point", "", filters).query).toContain("point->>'input_bytes'");
});

it("matches all supported setup strings and numeric ranges without invented defaults", () => {
  const b = syntheticSubmission();
  b.runtime = { name: "sglang", version: "0.5.0", backend: "vulkan", build: null, variant: null, plugin_version: null };
  b.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [gpu("GPU_%\\literal", "ExampleVendor", 8192)] };
  b.execution.settings.push({ target: "launch", scope: ["server"], name: "context_length", value: 8192, unit: "tokens", role: "context.total_tokens" });
  const summary = summarizeBenchmark(b);
  const descriptor = { target: "launch", scope: ["server"], name: "context_length", unit: "tokens", role: "context.total_tokens" } as const;
  const filters: BenchmarkFilters = {
    q: "0.5.0", model: "unidentified", hardware: "_%\\", vendor: "example", gpu: "gpu_", cpu: "synthetic", os: "SYNTHETIC",
    arch: "arm64", runtime: "sglang", runtime_version: "0.5", backend: "vulkan", mode: "selected",
    method: "openai-chat-serving@5", workload: "code_python", app_version: "synthetic",
    input_bytes_min: 4096, input_bytes_max: 4096, max_output_tokens_min: 128, max_output_tokens_max: 128,
    max_concurrency_min: 1, max_concurrency_max: 1, vram_min: 8192, vram_max: 8192, cores_max: 8,
    physical_cores_min: 4, ram_min: 16 * 1024 ** 3, repetitions_min: 1, warmup: false, request_usage: false,
    setting: [{ ...descriptor, scope: [...descriptor.scope], op: "eq", value: 8192 }],
  };
  expect(matchesFilters(summary, filters)).toBe(true);
  expect(matchesFilters(summary, { gpu: "missing%" })).toBe(false);
  expect(matchesFilters(summary, { input_bytes_min: 4097 })).toBe(false);
  expect(matchesFilters(summary, { vram_min: 8193 })).toBe(false);
  expect(matchesFilters(summary, { setting: [{ ...descriptor, scope: [...descriptor.scope], op: "range", min: 9000 }] })).toBe(false);
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

describe("serving workload bounds", () => {
  it("records the largest input, output cap and concurrency from the workload", () => {
    const b = syntheticSubmission();
    b.workload.inputs = [{ bytes: 512, sha256: "a".repeat(64) }, { bytes: 4096, sha256: "b".repeat(64) }];
    b.workload.max_output_tokens = 64;
    b.workload.concurrencies = [1, 4];
    const summary = summarizeBenchmark(b);
    expect(summary.setup).toMatchObject({ max_input_bytes: 4096, max_output_tokens: 64, max_concurrency: 4 });
    expect(numericValue(summary, "input_bytes")).toBe(4096);
    expect(numericValue(summary, "max_output_tokens")).toBe(64);
    expect(numericValue(summary, "max_concurrency")).toBe(4);
  });

  it("filters and sorts on the largest configured input, never an unrecorded allocation", () => {
    const b = syntheticSubmission();
    b.workload.inputs = [{ bytes: 4096, sha256: "a".repeat(64) }];
    const summary = summarizeBenchmark(b);
    expect(sortValue(summary, { sort: "input_bytes_desc" })).toBe(4096);
    expect(matchesFilters(summary, { input_bytes_min: 4096, input_bytes_max: 4096 })).toBe(true);
    expect(matchesFilters(summary, { input_bytes_min: 4097 })).toBe(false);
  });

  it("orders a page by input bytes while other fields disagree", async () => {
    for (const [id, bytes] of [["small", 512], ["large", 4096]] as const) {
      const r = run(id); r.summary.setup.max_input_bytes = bytes; store.runs.set(id, r);
    }
    expect((await store.listRuns({ sort: "input_bytes_asc" }, 10, null)).items.map(r => r.public_id)).toEqual(["small", "large"]);
    expect((await store.listRuns({ input_bytes_min: 4096 }, 10, null)).items.map(r => r.public_id)).toEqual(["large"]);
  });
});

describe("model metadata discovery", () => {
  const METADATA = { format: "GGUF", name: "Example 8B", architecture: "qwen2", size_label: "8B",
    quantization: "Q4_K_M", file_type: 15, quantized_by: "Quantizer Org",
    repository: "Publisher-Org/example-8B-GGUF", base_models: ["Upstream-Org/example-8B", "Other-Org/mixin-2B"],
    artifact: "q4/example-8B-Q4_K_M.gguf", source: "gguf+huggingface" };
  function described(id: string, overrides: Record<string, unknown> = {}): StoredRun {
    const stored = run(id);
    stored.benchmark.model = { format: "gguf", status: "sha256", sha256: "c".repeat(64), size_bytes: 1,
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
    expect(optionsSql("publisher", "org", {}).values).toEqual(["%org%"]);
  });

  // model_query is the narrow model search: the label plus name, repository,
  // artifact and hash. q stays broad and model stays label-only.
  describe("model_query", () => {
    // The model is the same in every run; only the hardware text around it varies.
    function on(stored: StoredRun, gpuName: string, vendor: string): StoredRun {
      stored.benchmark.environment!.execution = { mode: "selected", selection_complete: true, selected_gpus: [gpu(gpuName, vendor, 8192)] };
      stored.benchmark.runtime = { name: "sglang", version: "runtime-rev-7", backend: "vulkan", build: null, variant: null, plugin_version: null };
      stored.summary = summarizeBenchmark(stored.benchmark);
      return stored;
    }
    const ALPHA = { name: "Alpha Model", repository: "Alpha-Org/alpha-GGUF", artifact: "alpha/alpha-Q8_0.gguf" };
    const ids = async (filters: BenchmarkFilters) => (await store.listRuns(filters, 100, null)).items.map(i => i.public_id).sort();
    const suggestions = async (query: string, filters: BenchmarkFilters = {}) => (await store.listOptions("model_query", query, filters)).options;

    it("parses beside q and model, trims, and shares the text length limit", () => {
      expect(parseFilters(new URLSearchParams({ q: "gpu", model: "8b", model_query: "  Example 8B " }))).toEqual({ q: "gpu", model: "8b", model_query: "Example 8B" });
      expect(parseFilters(new URLSearchParams({ model_query: "   " }))).toEqual({});
      expect(parseFilters(new URLSearchParams({ model_query: "x".repeat(TEXT_FILTER_MAX_LENGTH) }))).toEqual({ model_query: "x".repeat(TEXT_FILTER_MAX_LENGTH) });
      expect(() => parseFilters(new URLSearchParams({ model_query: "x".repeat(TEXT_FILTER_MAX_LENGTH + 1) }))).toThrow();
      expect(parseFilters(new URLSearchParams("model_query=100%25_%5C"))).toEqual({ model_query: "100%_\\" });
    });

    it("is an option field that excludes only its own filter", () => {
      expect(parseOptionsQuery(new URLSearchParams("field=model_query&model_query=old&q=abc&gpu=rtx&option_query=ex")))
        .toEqual({ field: "model_query", query: "ex", filters: { q: "abc", gpu: "rtx" } });
      expect(() => parseOptionsQuery(new URLSearchParams("field=q"))).toThrow();
    });

    it("matches the label and each identifying model field, and nothing for a run without them", async () => {
      store.runs.set("described", described("described"));
      store.runs.set("undescribed", run("undescribed"));
      const hashed = run("hashed");
      hashed.benchmark.model = { format: "unknown", status: "sha256", sha256: "d".repeat(64), size_bytes: 1 };
      hashed.summary = summarizeBenchmark(hashed.benchmark);
      store.runs.set("hashed", hashed);
      // Label and name, repository, artifact, then the full and a partial hash; all case-insensitive.
      for (const model_query of ["EXAMPLE 8b", "publisher-org/example-8b-gguf", "Q4/EXAMPLE-8B-q4_k_m.gguf", "c".repeat(64), "c".repeat(12)]) {
        expect(await ids({ model_query }), model_query).toEqual(["described"]);
      }
      // Without metadata the label is all a run has: sha256: and the first 12 hash characters.
      expect(hashed.summary.model_label).toBe(`sha256:${"d".repeat(12)}`);
      expect(await ids({ model_query: `sha256:${"d".repeat(12)}` })).toEqual(["hashed"]);
      expect(await ids({ model_query: "unidentified" })).toEqual(["undescribed"]);
    });

    it("never matches hardware, runtime, status or descriptive model text, which q still finds", async () => {
      const stored = on(described("gpu-run"), "RTX Fixture", "GPUVendor");
      store.runs.set("gpu-run", stored);
      for (const text of ["RTX Fixture", "GPUVendor", "runtime-rev-7", "vulkan", "synthetic", "complete", "sglang", "openai-chat-serving@5",
        "code_python", "qwen2", "Quantizer Org", "Upstream-Org/example-8B"]) {
        expect(matchesFilters(stored.summary, { model_query: text }), `model_query ${text}`).toBe(false);
        expect(matchesFilters(stored.summary, { q: text }), `q ${text}`).toBe(true);
      }
      expect(await ids({ model_query: "RTX" })).toEqual([]);
      expect(await ids({ q: "RTX" })).toEqual(["gpu-run"]);
    });

    it("combines with GPU and other conditions by AND while its own model values are ORed", async () => {
      store.runs.set("alpha-rtx", on(described("alpha-rtx", ALPHA), "RTX Fixture", "Vendor"));
      store.runs.set("alpha-arc", on(described("alpha-arc", ALPHA), "ARC Fixture", "Vendor"));
      store.runs.set("beta-rtx", on(described("beta-rtx", { name: "Beta Model", repository: "Beta-Org/beta-GGUF", artifact: "beta/beta-Q8_0.gguf" }), "RTX Fixture", "Vendor"));
      expect(await ids({ model_query: "alpha" })).toEqual(["alpha-arc", "alpha-rtx"]);
      expect(await ids({ gpu: "rtx" })).toEqual(["alpha-rtx", "beta-rtx"]);
      expect(await ids({ model_query: "alpha", gpu: "rtx" })).toEqual(["alpha-rtx"]);
      expect(await ids({ model_query: "alpha", gpu: "rtx", os: "nowhere" })).toEqual([]);
      // Any one model value is enough: each of these names a single field the label does not contain.
      for (const model_query of ["alpha-org/", "alpha/alpha-q8"]) expect(await ids({ model_query }), model_query).toEqual(["alpha-arc", "alpha-rtx"]);
      expect(await ids({ model_query: "c".repeat(64) })).toEqual(["alpha-arc", "alpha-rtx", "beta-rtx"]);
      // The label filter and model_query are separate conditions: both must hold.
      expect(await ids({ model: "alpha model", model_query: "beta" })).toEqual([]);
      expect(await ids({ model: "model", model_query: "beta-org" })).toEqual(["beta-rtx"]);
    });

    it("leaves q broad and model label-only for links made before model_query", async () => {
      store.runs.set("gpu-run", on(described("gpu-run"), "RTX Fixture", "GPUVendor"));
      expect(await ids({ model: "example 8b" })).toEqual(["gpu-run"]);
      for (const model of ["publisher-org/example", "q4/example", "c".repeat(64), "RTX"]) expect(await ids({ model }), `model ${model}`).toEqual([]);
      for (const q of ["RTX Fixture", "GPUVendor", "runtime-rev-7", "complete", "publisher-org/example", "q4/example", "c".repeat(64), "qwen2"]) {
        expect(await ids({ q }), `q ${q}`).toEqual(["gpu-run"]);
      }
      expect(await ids({ q: "RTX", model_query: "example 8b" })).toEqual(["gpu-run"]);
      expect(await ids({ q: "RTX", model_query: "beta" })).toEqual([]);
    });

    it("reads corrupted model metadata as unknown instead of crashing", () => {
      const summary = described("corrupt").summary;
      Object.assign(summary.model_info as unknown as Record<string, unknown>, { name: 42, repository: true, artifact: { path: "x" }, sha256: false });
      expect(textValues(summary, "model_query")).toEqual(["Example 8B", "c".repeat(64), "Publisher-Org/example-8B-GGUF"]);
      for (const model_query of ["42", "true", "false", "path"]) expect(matchesFilters(summary, { model_query })).toBe(false);
    });

    it("suggests only model values, once per run, and never hardware or runtime text", async () => {
      store.runs.set("a", on(described("a"), "RTX Fixture", "Vendor"));
      store.runs.set("b", on(described("b", { repository: "Other-Org/example-8B-GGUF" }), "ARC Fixture", "Vendor"));
      store.runs.set("c", on(described("c", ALPHA), "RTX Fixture", "Vendor"));
      // A run's label and name are the same text and count once; sorting is by code unit.
      expect(await suggestions("")).toEqual([
        { value: "Alpha Model", count: 1 }, { value: "Alpha-Org/alpha-GGUF", count: 1 }, { value: "Example 8B", count: 2 },
        { value: "Other-Org/example-8B-GGUF", count: 1 }, { value: "Publisher-Org/example-8B-GGUF", count: 1 },
        { value: "alpha/alpha-Q8_0.gguf", count: 1 }, { value: "c".repeat(64), count: 3 }, { value: "q4/example-8B-Q4_K_M.gguf", count: 2 },
      ]);
      for (const hardwareText of ["rtx", "vendor", "runtime", "vulkan", "synthetic", "complete", "qwen2", "quantizer"]) expect(await suggestions(hardwareText), hardwareText).toEqual([]);
      expect(await suggestions("ALPHA")).toEqual([{ value: "Alpha Model", count: 1 }, { value: "Alpha-Org/alpha-GGUF", count: 1 }, { value: "alpha/alpha-Q8_0.gguf", count: 1 }]);
    });

    it("narrows suggestions by the other conditions and ignores its own filter", async () => {
      store.runs.set("a", on(described("a"), "RTX Fixture", "Vendor"));
      store.runs.set("b", on(described("b", { repository: "Other-Org/example-8B-GGUF" }), "ARC Fixture", "Vendor"));
      store.runs.set("c", on(described("c", ALPHA), "RTX Fixture", "Vendor"));
      const arc = [{ value: "Example 8B", count: 1 }, { value: "Other-Org/example-8B-GGUF", count: 1 }, { value: "c".repeat(64), count: 1 }, { value: "q4/example-8B-Q4_K_M.gguf", count: 1 }];
      expect(await suggestions("", { gpu: "arc" })).toEqual(arc);
      expect(await suggestions("", { gpu: "arc", model_query: "alpha" })).toEqual(arc);
      expect(await suggestions("", { gpu: "arc", os: "nowhere" })).toEqual([]);
    });

    it("offers only values that match again when selected", async () => {
      store.runs.set("a", on(described("a"), "RTX Fixture", "Vendor"));
      store.runs.set("b", on(described("b", { repository: "Other-Org/example-8B-GGUF" }), "ARC Fixture", "Vendor"));
      store.runs.set("c", on(described("c", ALPHA), "RTX Fixture", "Vendor"));
      for (const filters of [{}, { gpu: "arc" }, { gpu: "rtx" }] as BenchmarkFilters[]) {
        const offered = await suggestions("", filters);
        expect(offered.length).toBeGreaterThan(0);
        // These values are distinct enough that no run matches through another run's value.
        for (const { value, count } of offered) expect((await ids({ ...filters, model_query: value })).length, `${JSON.stringify(filters)} ${value}`).toBe(count);
      }
    });

    it("does not suggest a value the filter would reject as too long", async () => {
      const artifact = `nested/${"a".repeat(TEXT_FILTER_MAX_LENGTH)}.gguf`;
      store.runs.set("long", on(described("long", { artifact }), "RTX Fixture", "Vendor"));
      const values = (await suggestions("")).map(o => o.value);
      expect(values).toContain("Example 8B");
      expect(values).not.toContain(artifact);
      expect(values.every(v => v.length <= TEXT_FILTER_MAX_LENGTH)).toBe(true);
      expect(() => parseFilters(new URLSearchParams({ model_query: artifact }))).toThrow();
    });

    it("counts only visible runs in suggestions", async () => {
      store.runs.set("visible", described("visible"));
      const hidden = described("hidden", { name: "Hidden Model" }); hidden.hidden = true; store.runs.set("hidden", hidden);
      const deleted = described("deleted", { name: "Deleted Model" }); deleted.deleted = true; store.runs.set("deleted", deleted);
      expect(await suggestions("model")).toEqual([]);
      expect((await suggestions("example")).find(o => o.value === "Example 8B")?.count).toBe(1);
    });

    it("binds cursors to it", () => {
      const token = encodeDiscoveryCursor("2026-01-01T00:00:00Z", "a", { model_query: "alpha", os: "linux" }, null);
      expect(decodeDiscoveryCursor(token, { os: "linux", model_query: "alpha" })?.publicId).toBe("a");
      for (const changed of [{ os: "linux", model_query: "beta" }, { os: "linux" }, { os: "linux", q: "alpha" }]) expect(() => decodeDiscoveryCursor(token, changed)).toThrow();
    });

    it("is served by the list and options endpoints", async () => {
      for (const id of ["a", "b"]) store.runs.set(id, on(described(id), "RTX Fixture", "Vendor"));
      store.runs.set("c", on(described("c", ALPHA), "ARC Fixture", "Vendor"));
      const get = (path: string) => list(new Request(`http://localhost/v1/benchmark-runs${path}`));
      const first = await (await get("?model_query=Example&limit=1")).json();
      expect(first.items).toHaveLength(1);
      const second = await (await get(`?model_query=Example&limit=1&cursor=${first.next_cursor}`)).json();
      expect([first.items[0].public_id, second.items[0].public_id].sort()).toEqual(["a", "b"]);
      expect(second.next_cursor).toBeNull();
      for (const changed of ["?model_query=alpha", "?q=Example", "?"]) expect((await get(`${changed}&limit=1&cursor=${first.next_cursor}`)).status, changed).toBe(400);
      expect((await get(`?model_query=${"x".repeat(TEXT_FILTER_MAX_LENGTH + 1)}`)).status).toBe(400);
      const response = await options(new Request("http://localhost/v1/benchmark-runs/options?field=model_query&option_query=alpha&model_query=ignored&gpu=arc"));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await response.json()).options).toEqual([{ value: "Alpha Model", count: 1 }, { value: "Alpha-Org/alpha-GGUF", count: 1 }, { value: "alpha/alpha-Q8_0.gguf", count: 1 }]);
    });

    it("binds model queries as literal patterns", () => {
      const text = "x%' OR true --";
      const statement = listSql({ model_query: text }, 25, null);
      expect(statement.query).not.toContain(text);
      expect(statement.values).toEqual([literalPattern(text), 26]);
      expect(listSql({ model_query: "a%_\\" }, 25, null).values[0]).toBe(literalPattern("a%_\\"));
    });
  });
});

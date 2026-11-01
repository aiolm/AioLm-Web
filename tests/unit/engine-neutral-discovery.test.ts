import type { PublicBenchmarkSubmission, RecordedSetting } from "@aiolm/benchmark-contracts";
import { describe, expect, it } from "vitest";
import {
  canonicalSettingCondition, canonicalSettingDescriptor, matchesFilters, normalizeSetup,
  parseFilters, parseOptionsQuery, parseSettingCondition, parseSettingDescriptor, sortValue,
  type BenchmarkFilters, type SettingCondition, type SettingDescriptor,
} from "@/lib/benchmark-discovery";
import { syntheticServingSubmission, syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark } from "@/lib/summary";
import { decodeDiscoveryCursor, discoveryBinding, encodeCursor, encodeDiscoveryCursor } from "@/lib/pagination";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import type { StoredRun } from "@/server/repository";

const descriptor: SettingDescriptor = { target: "launch", scope: [], name: "batch", unit: null, role: null };
const eq = (value: Exclude<RecordedSetting["value"], null>, extra: Partial<SettingDescriptor> = {}): SettingCondition => ({ ...descriptor, ...extra, op: "eq", value });
const range = (min: number, max: number, extra: Partial<SettingDescriptor> = {}): SettingCondition => ({ ...descriptor, ...extra, op: "range", min, max });
function params(conditions: SettingCondition[], other: Record<string, string> = {}) {
  const search = new URLSearchParams(other);
  for (const condition of conditions) search.append("setting", canonicalSettingCondition(condition));
  return search;
}
function stored(id: string, benchmark: PublicBenchmarkSubmission = syntheticServingSubmission()): StoredRun {
  return { public_id: id, submission_id: id, benchmark, summary: summarizeBenchmark(benchmark), description_md: "", owner_hash: "private", body_sha256: "private", revision: 1, hidden: false, deleted: false, row_count: benchmark.measurements.rows.length, byte_size: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" };
}
function withSettings(id: string, entries: Array<{ value: RecordedSetting["value"] } & Partial<SettingDescriptor>>) {
  const benchmark = syntheticServingSubmission();
  benchmark.execution.settings = entries.map(entry => ({ ...descriptor, ...entry }));
  return stored(id, benchmark);
}

describe("engine-neutral query boundary", () => {
  it("defaults to serving, permits explicit legacy, and never translates token conditions", () => {
    expect(parseFilters(new URLSearchParams())).toEqual({});
    expect(parseFilters(new URLSearchParams("measurement=openai-chat-serving@1"))).toEqual({});
    expect(parseFilters(new URLSearchParams("measurement=legacy&context_min=512&point_tokens=512&point_concurrency=1"))).toEqual({ measurement: "legacy", context_min: 512, point_tokens: 512, point_concurrency: 1 });
    for (const query of ["measurement=other", "context_min=512", "parallel_min=1", "threads_min=1", "gpu_layers_min=0", "cache_type_k=f16", "point_tokens=512&point_concurrency=1", "sort=throughput_desc", "sort=context_asc", "measurement=legacy&input_bytes_min=4096", "measurement=legacy&request_usage=0", "measurement=legacy&point_bytes=4096&point_concurrency=1&point_max_tokens=128", "measurement=legacy&sort=output_rate_desc"]) expect(() => parseFilters(new URLSearchParams(query)), query).toThrow();
  });
  it("requires an entire serving point and enforces its bounds for sorting", () => {
    expect(parseFilters(new URLSearchParams("point_bytes=4096&point_concurrency=4&point_max_tokens=128&point_only=1&sort=output_rate_desc"))).toEqual({ point_bytes: 4096, point_concurrency: 4, point_max_tokens: 128, point_only: true, sort: "output_rate_desc" });
    for (const query of ["point_bytes=4096", "point_concurrency=4&point_max_tokens=128", "point_only=1", "point_only=true", "sort=duration_asc", "sort=output_rate_desc", "point_bytes=255&point_concurrency=1&point_max_tokens=128", "point_bytes=4096&point_concurrency=65&point_max_tokens=128", "point_bytes=4096&point_concurrency=1&point_max_tokens=65537"]) expect(() => parseFilters(new URLSearchParams(query)), query).toThrow();
  });
  it("parses new integer ranges, nullable identities and strict booleans", () => {
    expect(parseFilters(new URLSearchParams("input_bytes_min=4096&max_output_tokens_max=128&max_concurrency_min=4&model_size_min=0&ram_max=9007199254740991&physical_cores_min=0&repetitions_max=100&warmup=0&request_usage=1&runtime=sglang&runtime_variant=experimental&model_format=unknown"))).toMatchObject({ input_bytes_min: 4096, max_output_tokens_max: 128, max_concurrency_min: 4, model_size_min: 0, physical_cores_min: 0, warmup: false, request_usage: true, runtime: "sglang", model_format: "unknown" });
    for (const query of ["warmup=false", "request_usage=2", "input_bytes_min=1.5", "model_size_min=-1", "ram_max=9007199254740992", "input_bytes_min=8192&input_bytes_max=4096"]) expect(() => parseFilters(new URLSearchParams(query))).toThrow();
  });
  it("accepts all typed values, preserving zero, false, scope and numeric array order", () => {
    for (const value of [false, 0, -1, 0.5, "safe text", [], [1, 2]]) expect(parseSettingCondition(eq(value))).toEqual(eq(value));
    const first = eq([1, 2], { scope: ["serve", "model"] }), second = eq([2, 1], { scope: ["model", "serve"] });
    expect(parseFilters(params([second, first, first])).setting).toEqual([second, first]);
    expect(parseSettingCondition(range(-1, 3))).toEqual(range(-1, 3));
  });
  it("rejects unknown keys, missing nullable descriptor fields and unsafe values", () => {
    const { unit: _unit, ...missingUnit } = descriptor;
    const { role: _role, ...missingRole } = descriptor;
    for (const value of [null, [], { ...eq(1), extra: 1 }, { ...missingUnit, op: "eq", value: 1 }, { ...missingRole, op: "eq", value: 1 }, { ...eq(1), scope: Array(9).fill("serve") }, { ...eq(1), name: "bad/name" }, { ...eq(1), unit: "GB" }, { ...eq(1), role: "context" }, { ...eq(1), value: null }, { ...eq(1), value: Infinity }, { ...eq(1), value: Array(65).fill(1) }, { ...eq(1), value: [true] }, eq("-flag"), eq("private/path"), eq("x".repeat(129)), { ...descriptor, op: "range" }, { ...descriptor, op: "range", min: null }, { ...range(2, 1) }, { ...range(1, 2), value: 1 }]) expect(() => parseSettingCondition(value), JSON.stringify(value)).toThrow();
    expect(() => parseSettingDescriptor({ ...descriptor, value: 1 })).toThrow();
    expect(() => parseSettingCondition("{" )).toThrow();
  });
  it("bounds raw UTF-8 JSON before normalization and bounds the encoded query", () => {
    const condition = canonicalSettingCondition(eq(1));
    const exact = condition + " ".repeat(1024 - new TextEncoder().encode(condition).length);
    expect(parseSettingCondition(exact)).toEqual(eq(1));
    expect(() => parseSettingCondition(exact + " ")).toThrow();
    expect(() => parseSettingCondition(condition + "가".repeat(400))).toThrow();
    expect(() => parseFilters(params(Array(9).fill(eq(1))))).toThrow();
    expect(() => parseFilters(new URLSearchParams({ unused: "x".repeat(8192) }))).toThrow();
    expect(() => parseFilters(params([eq(1)], { measurement: "legacy" }))).toThrow();
  });
  it("keeps every generic condition on facet requests and excludes only a scalar's own field", () => {
    const conditions = [eq(0), range(0, 10)];
    const request = params(conditions, { field: "setting_value", option_setting: canonicalSettingDescriptor(descriptor), runtime: "sglang" });
    expect(parseOptionsQuery(request)).toEqual({ field: "setting_value", query: "", setting: descriptor, filters: { runtime: "sglang", setting: parseFilters(params(conditions)).setting } });
    expect(parseOptionsQuery(params(conditions, { field: "setting" })).filters.setting).toHaveLength(2);
    expect(parseOptionsQuery(new URLSearchParams("field=runtime&runtime=old&model_format=unknown")).filters).toEqual({ model_format: "unknown" });
    expect(parseOptionsQuery(new URLSearchParams("field=point&point_bytes=4096&point_concurrency=1&point_max_tokens=128&point_only=1")).filters).toEqual({});
    for (const query of ["field=q", "field=unknown", "field=setting_value", "field=setting&option_setting={}", "measurement=legacy&field=setting"]) expect(() => parseOptionsQuery(new URLSearchParams(query))).toThrow();
  });
});

describe("canonical memory discovery", () => {
  it.each(["llama.cpp", "vllm", "mlx-vlm", "sglang", null])("accepts %s with unknown format, arbitrary variant and optional observations", async name => {
    const store = new InMemoryBenchmarkStore(), benchmark = syntheticServingSubmission();
    benchmark.runtime.name = name; benchmark.runtime.variant = "experimental";
    store.runs.set("run", stored("run", benchmark));
    expect((await store.listRuns({}, 25, null)).items).toHaveLength(1);
    if (name) expect((await store.listOptions("runtime", "", {})).options).toEqual([{ value: name, count: 1 }]);
    else expect((await store.listOptions("runtime", "", {})).options).toEqual([]);
  });
  it("selects legacy only explicitly and recovers absent identity from the accepted payload", async () => {
    const store = new InMemoryBenchmarkStore(), legacy = stored("legacy", syntheticSubmission()), serving = stored("serving");
    delete legacy.summary.identity; delete legacy.summary.schema_version;
    store.runs.set("legacy", legacy); store.runs.set("serving", serving);
    expect((await store.listRuns({}, 25, null)).items.map(r => r.public_id)).toEqual(["serving"]);
    expect((await store.listRuns({ measurement: "legacy" }, 25, null)).items.map(r => r.public_id)).toEqual(["legacy"]);
    expect(legacy.summary.identity).toBeUndefined();
  });
  it("searches full SHA, repository/revision and all runtime identity fields without display parsing", () => {
    const benchmark = syntheticServingSubmission();
    benchmark.model.sha256 = "d".repeat(64); benchmark.model.status = "sha256";
    benchmark.model.source = { kind: "huggingface", repository: "Org/model", revision: "e".repeat(40) };
    benchmark.runtime = { name: "sglang", version: "v9", backend: "GPU", build: "build7", variant: "variant9", plugin_version: "plugin4" };
    const summary = summarizeBenchmark(benchmark);
    for (const query of ["d".repeat(64), "Org/model", "e".repeat(40)]) {
      expect(matchesFilters(summary, { model_query: query })).toBe(true);
      expect(matchesFilters(summary, { q: query })).toBe(true);
    }
    expect(matchesFilters(summary, { runtime: "sglang", runtime_version: "v9", runtime_variant: "variant9", runtime_build: "build7", runtime_plugin_version: "plugin4", model_format: "unknown" })).toBe(true);
  });
  it("uses configured maxima even when the largest operating point never completed", () => {
    const benchmark = syntheticServingSubmission();
    benchmark.workload.inputs.push({ bytes: 16384, sha256: "b".repeat(64) }); benchmark.workload.concurrencies = [1, 4];
    const summary = summarizeBenchmark(benchmark);
    expect(normalizeSetup(benchmark)).toMatchObject({ max_input_bytes: 16384, max_concurrency: 4, max_output_tokens: 128, request_usage: false });
    expect(matchesFilters(summary, { input_bytes_max: 8192 })).toBe(false);
    expect(matchesFilters(summary, { input_bytes_min: 16384, max_concurrency_min: 4, request_usage: false })).toBe(true);
    expect(sortValue(summary, { sort: "input_bytes_asc" })).toBe(16384);
    expect(sortValue(summary, { sort: "input_bytes_desc" })).toBe(16384);
    expect(matchesFilters(summary, { point_bytes: 16384, point_concurrency: 1, point_max_tokens: 128, point_only: true })).toBe(false);
  });
  it("matches one exact setting element, including unit/role/scope and array order", () => {
    const summary = withSettings("run", [{ value: 2 }, { value: 64, scope: ["serve"] }, { value: [1, 2], name: "array" }, { value: false, name: "enabled" }, { value: 0, name: "zero" }, { value: null, name: "missing" }]).summary;
    expect(matchesFilters(summary, { setting: [range(16, 64)] })).toBe(false);
    expect(matchesFilters(summary, { setting: [range(16, 64, { scope: ["serve"] })] })).toBe(true);
    expect(matchesFilters(summary, { setting: [eq([2, 1], { name: "array" })] })).toBe(false);
    expect(matchesFilters(summary, { setting: [eq([1, 2], { name: "array" }), eq(false, { name: "enabled" }), eq(0, { name: "zero" })] })).toBe(true);
    expect(matchesFilters(summary, { setting: [eq(0, { name: "missing" })] })).toBe(false);
    expect(matchesFilters(summary, { setting: [eq(2, { unit: "count" })] })).toBe(false);
    expect(matchesFilters(summary, { setting: [eq(2, { role: "concurrency.capacity" })] })).toBe(false);
    expect(matchesFilters(summary, { setting: [eq(2), eq(3)] })).toBe(false);
  });
  it("facets count distinct visible runs, respect ALL conditions, and preserve false/zero types", async () => {
    const store = new InMemoryBenchmarkStore();
    store.runs.set("a", withSettings("a", [{ value: 0 }, { value: false, name: "enabled" }]));
    store.runs.set("b", withSettings("b", [{ value: 1 }, { value: true, name: "enabled" }]));
    const hidden = withSettings("hidden", [{ value: 0 }]); hidden.hidden = true; store.runs.set("hidden", hidden);
    const deleted = withSettings("deleted", [{ value: 0 }]); deleted.deleted = true; store.runs.set("deleted", deleted);
    expect(await store.listOptions("setting_value", "", {}, descriptor)).toEqual({ options: [{ value: "0", count: 1 }, { value: "1", count: 1 }], has_more: false });
    expect(await store.listOptions("setting_value", "", { setting: [eq(0)] }, descriptor)).toEqual({ options: [{ value: "0", count: 1 }], has_more: false });
    expect((await store.listOptions("setting", "", { setting: [eq(2)] })).options).toEqual([]);
    expect(await store.listOptions("setting_value", "", {}, { ...descriptor, name: "enabled" })).toEqual({ options: [{ value: "false", count: 1 }, { value: "true", count: 1 }], has_more: false });
    expect((await store.listOptions("setting_value", "", {}, { ...descriptor, unit: "count" })).options).toEqual([]);
  });
  it("returns 30 C-ordered typed values plus has_more and skips unusable large values", async () => {
    const store = new InMemoryBenchmarkStore();
    for (let i = 0; i < 31; i++) store.runs.set(`r${i}`, withSettings(`r${i}`, [{ value: i }]));
    const duplicate = withSettings("duplicate", [{ value: 2 }, { value: 2 }]); store.runs.set("duplicate", duplicate);
    store.runs.set("null", withSettings("null", [{ value: null }]));
    store.runs.set("oversized", withSettings("oversized", [{ value: Array(64).fill(1.234567890123456e200) }]));
    const result = await store.listOptions("setting_value", "", {}, descriptor);
    expect(result.has_more).toBe(true); expect(result.options).toHaveLength(30);
    expect(result.options.slice(0, 6)).toEqual([{ value: "0", count: 1 }, { value: "1", count: 1 }, { value: "10", count: 1 }, { value: "11", count: 1 }, { value: "12", count: 1 }, { value: "13", count: 1 }]);
    expect(result.options.find(o => o.value === "2")?.count).toBe(2);
    expect(result.options.some(o => o.value.startsWith("["))).toBe(false);
  });
  it("facets separate array order, scope order, units and roles", async () => {
    const store = new InMemoryBenchmarkStore();
    const entries: Array<[string, Partial<SettingDescriptor> & { value: RecordedSetting["value"] }]> = [
      ["a", { value: [1, 2] }], ["b", { value: [2, 1] }], ["c", { value: 1, scope: ["a", "b"] }], ["d", { value: 1, scope: ["b", "a"] }], ["e", { value: 1, unit: "count" }], ["f", { value: 1, role: "concurrency.capacity" }],
    ];
    for (const [id, entry] of entries) store.runs.set(id, withSettings(id, [entry]));
    expect((await store.listOptions("setting", "", {})).options).toHaveLength(5);
    expect((await store.listOptions("setting_value", "", {}, descriptor)).options).toEqual([{ value: "[1,2]", count: 1 }, { value: "[2,1]", count: 1 }]);
    expect((await store.listOptions("setting_value", "", {}, { ...descriptor, scope: ["a", "b"] })).options).toEqual([{ value: "1", count: 1 }]);
  });
  it("persists exact canonical numeric/string recommendations and C-orders Unicode", async () => {
    const store = new InMemoryBenchmarkStore();
    const values = [1e21, 1.1e21, "  spaced  text  ", "quoted \"text\"", [1e21, 1.1e21], "\ue000", "😀"];
    for (let i = 0; i < values.length; i++) store.runs.set(`v${i}`, withSettings(`v${i}`, [{ value: values[i] }]));
    const options = (await store.listOptions("setting_value", "", {}, descriptor)).options;
    expect(options.map(o => o.value)).toEqual(['"  spaced  text  "', '"quoted \\"text\\""', '"\ue000"', '"😀"', "1.1e+21", "1e+21", "[1e+21,1.1e+21]"]);
    for (const option of options) {
      const selected = parseSettingCondition({ ...descriptor, op: "eq", value: JSON.parse(option.value) });
      expect((await store.listRuns({ setting: [selected] }, 25, null)).items).toHaveLength(1);
    }
    expect(store.runs.get("v0")!.summary.setup!.setting_facets).toEqual([{ descriptor: canonicalSettingDescriptor(descriptor), value: "1e+21" }]);
  });
});

describe("serving point sort and cursor boundary", () => {
  it("sorts the exact point median and leaves a different cap missing", async () => {
    const store = new InMemoryBenchmarkStore();
    for (const [id, e2e, bytes, cap] of [["fast", 100, 20, 128], ["slow", 200, 10, 128], ["different-cap", 1, 100, 256]] as const) {
      const benchmark = syntheticServingSubmission();
      benchmark.measurements.rows = [{ ...benchmark.measurements.rows[0], e2e_ms: e2e, output_bytes: bytes, content_bytes: bytes, reasoning_bytes: 0, max_output_tokens: cap }];
      store.runs.set(id, stored(id, benchmark));
    }
    const filters: BenchmarkFilters = { point_bytes: 4096, point_concurrency: 1, point_max_tokens: 128, sort: "output_rate_desc" };
    expect((await store.listRuns(filters, 10, null)).items.map(r => r.public_id)).toEqual(["fast", "slow", "different-cap"]);
    expect((await store.listRuns({ ...filters, sort: "duration_asc" }, 10, null)).items.map(r => r.public_id)).toEqual(["fast", "slow", "different-cap"]);
    const first = await store.listRuns(filters, 1, null), next = await store.listRuns(filters, 1, decodeDiscoveryCursor(first.next_cursor, filters));
    expect(first.items[0].public_id).toBe("fast"); expect(next.items[0].public_id).toBe("slow");
    expect((await store.listOptions("point", "", {})).options.map(o => o.value)).toEqual(["b4096/c1/o128", "b4096/c1/o256"]);
  });
  it("pages configured input sorts with missing last, newest timestamp and descending ID ties", async () => {
    const store = new InMemoryBenchmarkStore();
    for (const id of ["a", "b", "newer", "small", "missing"]) {
      const benchmark = syntheticServingSubmission();
      if (id !== "small") benchmark.workload.inputs.push({ bytes: 16384, sha256: "b".repeat(64) });
      const run = stored(id, benchmark);
      if (id === "newer") run.created_at = "2026-01-02T00:00:00.000Z";
      if (id === "missing") run.summary.setup!.max_input_bytes = null;
      store.runs.set(id, run);
    }
    const filters: BenchmarkFilters = { sort: "input_bytes_desc" };
    const ids: string[] = [];
    let cursor = null;
    do {
      const page = await store.listRuns(filters, 2, cursor);
      ids.push(...page.items.map(r => r.public_id));
      cursor = decodeDiscoveryCursor(page.next_cursor, filters);
    } while (cursor);
    expect(ids).toEqual(["newer", "b", "a", "small", "missing"]);
    expect((await store.listRuns({ sort: "input_bytes_asc" }, 10, null)).items.map(r => r.public_id)).toEqual(["small", "newer", "b", "a", "missing"]);
  });
  it("binds sorted/deduplicated canonical conditions and default scope stably", () => {
    const filters: BenchmarkFilters = { setting: [eq(false), range(0, 10)] };
    expect(discoveryBinding(filters)).toBe(discoveryBinding({ measurement: "openai-chat-serving@1", setting: [range(0, 10), eq(false), eq(false)] }));
    const token = encodeDiscoveryCursor("2026-01-01T00:00:00Z", "a", filters, null);
    expect(decodeDiscoveryCursor(token, { setting: [range(0, 10), eq(false)] })?.publicId).toBe("a");
    for (const changed of [{ setting: [eq(true), range(0, 10)] }, { measurement: "legacy" }, { point_bytes: 4096, point_concurrency: 1, point_max_tokens: 256 } ] as BenchmarkFilters[]) expect(() => decodeDiscoveryCursor(token, changed)).toThrow();
    expect(() => decodeDiscoveryCursor(encodeCursor("2026-01-01T00:00:00Z", "a"), {})).toThrow();
  });
});

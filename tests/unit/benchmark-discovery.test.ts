import { beforeEach, describe, expect, it } from "vitest";
import { syntheticSubmission } from "@/lib/fixtures";
import { matchesFilters, normalizeSetup, parseFilters, parseOptionsQuery, SORT_VALUES } from "@/lib/benchmark-discovery";
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
function run(id: string, context: number | null = 2048): StoredRun {
  const benchmark = syntheticSubmission();
  const summary = summarizeBenchmark(benchmark);
  summary.setup!.context_size = context;
  return { public_id: id, submission_id: id, benchmark, summary, description_md: "", owner_hash: "private", body_sha256: "private", revision: 1, hidden: false, deleted: false, row_count: 1, byte_size: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" };
}
const gpu = (name: string, vendor: string, vram_mb: number | null) => ({ name, vendor, vram_mb, driver: null, integrated: false });

describe("discovery setup", () => {
  it("keeps runtime/settings without environment and never substitutes installed GPUs", () => {
    const b = syntheticSubmission({ environment: null });
    expect(normalizeSetup(b)).toMatchObject({ os: null, cores: null, runtime: "llama.cpp", context_size: 2048, vram_mb: null });
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
  const filters: BenchmarkFilters = { q: "revision-example", model: "identified", hardware: "_%\\", vendor: "example", gpu: "gpu_", cpu: "synthetic", os: "SYNTHETIC", arch: "x64", runtime: "llama", backend: "vulkan", mode: "selected", method: "cold-prompt", workload: "python", flash_attention: "on", cache_type_k: "q8", cache_type_v: "f16", split_mode: "layer", context_min: 2048, context_max: 2048, vram_min: 8192, cores_max: 4, parallel_min: 1, threads_min: 3, gpu_layers_min: -1, gpu_layers_max: -1 };
  expect(matchesFilters(summary, filters)).toBe(true);
  expect(matchesFilters(summary, { gpu: "missing%" })).toBe(false);
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

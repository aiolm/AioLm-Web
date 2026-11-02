import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { PostgresBenchmarkStore } from "@/server/postgres-store";
import { syntheticServingSubmission, syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark } from "@/lib/summary";

/** A stand-in for the postgres.js client: no connection, no database. */
function resultSql(result: unknown[]) {
  const sql = (() => Promise.resolve(result)) as unknown as postgres.Sql;
  sql.unsafe = (() => Promise.resolve(result)) as unknown as postgres.Sql["unsafe"];
  return sql;
}

describe("PostgresBenchmarkStore result handling", () => {
  it("converts database storage counters to numbers", async () => {
    const sql = resultSql([{ bytes: "8192", rows: "42" }]);
    await expect(new PostgresBenchmarkStore(sql).storageFootprint()).resolves.toEqual({ bytes: 8192, rows: 42 });
  });

  it("recovers legacy summary builds while preserving pagination", async () => {
    const benchmark = syntheticSubmission();
    benchmark.runtime.version = "0.3.0-dev";
    benchmark.runtime.build = "b10638";
    const summary = summarizeBenchmark(benchmark);
    delete summary.setup!.runtime_build;
    const sql = resultSql([
      { public_id: "legacy", summary, benchmark_metadata: benchmark, runtime_build: "b10638", description_md: "", revision: 1, created_at: "2026-01-02", updated_at: "2026-01-02" },
      { public_id: "current", summary: { ...summary, setup: { ...summary.setup, runtime_build: "b2" } }, benchmark_metadata: benchmark, runtime_build: null, description_md: "", revision: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ]);
    const { items, next_cursor } = await new PostgresBenchmarkStore(sql).listRuns({}, 1, null);
    expect(items).toEqual([{ public_id: "legacy", summary: { ...summary, setup: { ...summary.setup, runtime_build: "b10638" } }, description_md: "", revision: 1, created_at: "2026-01-02", updated_at: "2026-01-02" }]);
    expect(next_cursor).not.toBeNull();
  });

  it("projects host metadata for list and detail even when stored identity already exists", async () => {
    const benchmark = syntheticServingSubmission();
    benchmark.environment!.cpu.name = "Distinct Host CPU";
    const gpu = { name: "Integrated Host GPU", vendor: "Host Vendor", vram_mb: null, integrated: true, driver: null };
    benchmark.environment!.installed_gpus = [gpu];
    benchmark.environment!.execution = { mode: "unknown", selected_gpus: [], selection_complete: false };
    const summary = summarizeBenchmark(benchmark);
    delete summary.setup!.host_gpus;
    delete summary.setup!.execution_selection_complete;
    summary.hardware_label = "unknown";
    benchmark.measurements.rows = [];
    const item = { public_id: "host", summary, deleted: false };
    const before = JSON.stringify({ item, benchmark });
    const listStore = new PostgresBenchmarkStore(resultSql([{ ...item, runtime_build: null, benchmark_metadata: benchmark }]));
    const [listed] = (await listStore.listRuns({}, 25, null)).items;
    const detailStore = new PostgresBenchmarkStore(resultSql([{ ...item, benchmark }]));
    const detail = await detailStore.getRunByPublicId("host");
    expect(listed!.summary).toEqual(detail!.summary);
    expect(detail!.summary).toMatchObject({
      hardware_label: "Host CPU: Distinct Host CPU",
      setup: { host_gpus: [gpu], gpus: [], vendors: [], vram_mb: null, execution_selection_complete: false },
    });
    expect(listed).not.toHaveProperty("benchmark_metadata");
    expect(detail!.summary.serving_points).toBe(summary.serving_points);
    expect(JSON.stringify({ item, benchmark })).toBe(before);
  });
});

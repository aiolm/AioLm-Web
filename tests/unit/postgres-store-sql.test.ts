import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { PostgresBenchmarkStore } from "@/server/postgres-store";
import { syntheticSubmission } from "@/lib/fixtures";
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

  it("returns stored summaries unchanged while preserving pagination", async () => {
    const summary = summarizeBenchmark(syntheticSubmission());
    const rows = [
      { public_id: "a", summary, description_md: "", revision: 1, created_at: "2026-01-02", updated_at: "2026-01-02" },
      { public_id: "b", summary, description_md: "", revision: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ];
    const before = JSON.stringify(rows);
    const { items, next_cursor } = await new PostgresBenchmarkStore(resultSql(rows)).listRuns({}, 1, null);
    expect(items).toEqual([rows[0]]);
    expect(next_cursor).not.toBeNull();
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("returns the stored summary for list and detail reads", async () => {
    const benchmark = syntheticSubmission();
    const summary = summarizeBenchmark(benchmark);
    const item = { public_id: "host", summary, deleted: false };
    const before = JSON.stringify(item);
    const [listed] = (await new PostgresBenchmarkStore(resultSql([item])).listRuns({}, 25, null)).items;
    const detail = await new PostgresBenchmarkStore(resultSql([{ ...item, benchmark }])).getRunByPublicId("host");
    expect(listed!.summary).toEqual(summary);
    expect(detail!.summary).toEqual(summary);
    expect(JSON.stringify(item)).toBe(before);
  });
});

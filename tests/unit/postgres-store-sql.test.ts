import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { PostgresBenchmarkStore } from "@/server/postgres-store";

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
    const setup = { runtime_version: "0.3.0-dev" };
    const sql = resultSql([
      { public_id: "legacy", summary: { setup }, runtime_build: "b10638", description_md: "", revision: 1, created_at: "2026-01-02", updated_at: "2026-01-02" },
      { public_id: "current", summary: { setup: { ...setup, runtime_build: "b2" } }, runtime_build: null, description_md: "", revision: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ]);
    const { items, next_cursor } = await new PostgresBenchmarkStore(sql).listRuns({}, 1, null);
    expect(items).toEqual([{ public_id: "legacy", summary: { setup: { ...setup, runtime_build: "b10638" } }, description_md: "", revision: 1, created_at: "2026-01-02", updated_at: "2026-01-02" }]);
    expect(next_cursor).not.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { PostgresBenchmarkStore } from "@/server/postgres-store";
import { LIST_RUNTIME_BUILD_COLUMN } from "@/server/benchmark-discovery-sql";

/** A recording stand-in for the postgres.js client: no connection, no database. */
function recordingSql(result: unknown[]) {
  const queries: string[] = [];
  const sql = ((strings: TemplateStringsArray) => {
    queries.push(strings.join("?"));
    return Promise.resolve(result);
  }) as unknown as postgres.Sql;
  sql.unsafe = ((query: string) => {
    queries.push(query);
    return Promise.resolve(result);
  }) as unknown as postgres.Sql["unsafe"];
  return { sql, queries };
}

describe("PostgresBenchmarkStore query reuse", () => {
  it("measures the storage footprint with the same whole-schema query the capacity guard uses", async () => {
    const { sql, queries } = recordingSql([{ bytes: "8192", rows: "42" }]);
    await expect(new PostgresBenchmarkStore(sql).storageFootprint()).resolves.toEqual({ bytes: 8192, rows: 42 });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("pg_total_relation_size(oid)");
    expect(queries[0]).toContain("relnamespace = 'bench'::regnamespace and relkind = 'r'");
    expect(queries[0]).toContain("from bench.benchmark_runs where deleted = false");
  });

  it("lists with the guarded build column and recovers only legacy summaries", async () => {
    const setup = { runtime_version: "0.3.0-dev" };
    const { sql, queries } = recordingSql([
      { public_id: "legacy", summary: { setup }, runtime_build: "b10638", description_md: "", revision: 1, created_at: "2026-01-02", updated_at: "2026-01-02" },
      { public_id: "current", summary: { setup: { ...setup, runtime_build: "b2" } }, runtime_build: null, description_md: "", revision: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
    ]);
    const { items, next_cursor } = await new PostgresBenchmarkStore(sql).listRuns({}, 1, null);
    expect(queries[0]).toContain(`${LIST_RUNTIME_BUILD_COLUMN} as runtime_build`);
    expect(items).toEqual([{ public_id: "legacy", summary: { setup: { ...setup, runtime_build: "b10638" } }, description_md: "", revision: 1, created_at: "2026-01-02", updated_at: "2026-01-02" }]);
    expect(next_cursor).not.toBeNull();
  });
});

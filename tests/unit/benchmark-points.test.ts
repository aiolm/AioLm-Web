import { beforeEach, describe, expect, it } from "vitest";
import { syntheticSubmission } from "@/lib/fixtures";
import { matchesFilters, parseFilters, parseOptionsQuery, sortValue } from "@/lib/benchmark-discovery";
import { POINT_LIMIT, defaultPoint, findPoint, median, parsePointId, pointId, summarizePoints } from "@/lib/benchmark-points";
import { summarizeBenchmark } from "@/lib/summary";
import { listSql, optionsSql } from "@/server/benchmark-discovery-sql";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { freshStore, setupTestEnv } from "./helpers";
import type { StoredRun } from "@/server/repository";

setupTestEnv();
let store: InMemoryBenchmarkStore;
beforeEach(() => { store = freshStore(); });

type Row = ReturnType<typeof syntheticSubmission>["measurements"]["rows"][number];
function rows(overrides: Array<Partial<Row>>): Row[] {
  const base = syntheticSubmission().measurements.rows[0]!;
  return overrides.map((override) => ({ ...base, ...override }));
}

describe("operating points", () => {
  it("groups rows by input length, concurrency and generation length, ascending", () => {
    const { points, truncated } = summarizePoints(rows([
      { prompt_tokens: 4096, concurrency: 1 },
      { prompt_tokens: 512, concurrency: 4 },
      { prompt_tokens: 512, concurrency: 1 },
      { prompt_tokens: 512, concurrency: 1, generation_length: 256 },
    ]));
    expect(truncated).toBe(false);
    expect(points.map((point) => [point.prompt_tokens, point.concurrency, point.generation_length])).toEqual([
      [512, 1, 128], [512, 1, 256], [512, 4, 128], [4096, 1, 128],
    ]);
  });

  it("reports the median of the repetitions with the spread it came from", () => {
    const { points } = summarizePoints(rows([
      { tg_tps: 60, repetition: 1 }, { tg_tps: 80, repetition: 2 }, { tg_tps: 70, repetition: 3 },
    ]));
    expect(points).toHaveLength(1);
    expect(points[0]!.samples).toBe(3);
    expect(points[0]!.tg_tps).toEqual({ median: 70, min: 60, max: 80 });
  });

  it("takes the mean of the two middle values on an even count, as percentile_cont(0.5) does", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([5])).toBe(5);
    const { points } = summarizePoints(rows([{ e2e_ms: 100 }, { e2e_ms: 400 }]));
    expect(points[0]!.e2e_ms).toEqual({ median: 250, min: 100, max: 400 });
  });

  it("keeps one cold repetition from moving the reported value the way a mean would", () => {
    const { points } = summarizePoints(rows([{ tg_tps: 70 }, { tg_tps: 71 }, { tg_tps: 12 }]));
    expect(points[0]!.tg_tps!.median).toBe(70);
    expect(points[0]!.tg_tps!.min).toBe(12);
  });

  it("skips failed rows and rows that belong to no nameable point", () => {
    const { points } = summarizePoints(rows([
      { tg_tps: 50 },
      { tg_tps: 9999, failed: true },
      { prompt_tokens: 0 as unknown as number },
      { concurrency: null as unknown as number },
      { generation_length: 1.5 as unknown as number },
    ]));
    expect(points).toHaveLength(1);
    expect(points[0]!.samples).toBe(1);
    expect(points[0]!.tg_tps!.median).toBe(50);
  });

  it("aggregates each metric over the rows that reported it, and reports the rest as unknown", () => {
    const { points } = summarizePoints(rows([
      { tg_tps: 40, pp_tps: null, ttft_ms: null },
      { tg_tps: 60, pp_tps: 900, ttft_ms: null },
    ]));
    expect(points[0]!.samples).toBe(2);
    expect(points[0]!.tg_tps).toEqual({ median: 50, min: 40, max: 60 });
    expect(points[0]!.pp_tps).toEqual({ median: 900, min: 900, max: 900 });
    expect(points[0]!.ttft_ms).toBeNull();
  });

  it("cuts a pathological grid at the limit and says that it was cut", () => {
    const { points, truncated } = summarizePoints(
      rows(Array.from({ length: POINT_LIMIT + 5 }, (_, index) => ({ prompt_tokens: (index + 1) * 128 }))),
    );
    expect(points).toHaveLength(POINT_LIMIT);
    expect(truncated).toBe(true);
    // Ascending, so the cut drops the longest inputs rather than an arbitrary slice.
    expect(points[0]!.prompt_tokens).toBe(128);
    expect(points.at(-1)!.prompt_tokens).toBe(POINT_LIMIT * 128);
  });

  it("leads with the shortest input at the lowest concurrency, which is a point that ran", () => {
    const { points } = summarizePoints(rows([
      { prompt_tokens: 4096, concurrency: 1 }, { prompt_tokens: 512, concurrency: 4 }, { prompt_tokens: 512, concurrency: 2 },
    ]));
    expect(defaultPoint(points)).toMatchObject({ prompt_tokens: 512, concurrency: 2 });
    expect(findPoint(points, 4096, 1)).toMatchObject({ prompt_tokens: 4096 });
    expect(findPoint(points, 4096, 4)).toBeNull();
    expect(defaultPoint([])).toBeNull();
  });

  it("stores the points on the summary next to the retained means", () => {
    const benchmark = syntheticSubmission();
    benchmark.measurements.rows = rows([
      { prompt_tokens: 512, tg_tps: 80, e2e_ms: 1000 },
      { prompt_tokens: 4096, tg_tps: 40, e2e_ms: 9000 },
    ]);
    const summary = summarizeBenchmark(benchmark);
    expect(summary.points!.map((point) => point.tg_tps!.median)).toEqual([80, 40]);
    expect(summary.points_truncated).toBe(false);
    // The mixed means are still stored; they are simply no longer read.
    expect(summary.mean_tg_tps).toBe(60);
  });

  it("round-trips the addressable identity of a point", () => {
    expect(pointId(4096, 1)).toBe("4096/1");
    expect(parsePointId(" 4096/1 ")).toEqual({ prompt_tokens: 4096, concurrency: 1 });
    for (const bad of ["4096", "4096/0", "0/1", "4096/1/2", "abc", "-1/1", ""]) expect(parsePointId(bad)).toBeNull();
  });
});

describe("ranking at one operating point", () => {
  function runAt(id: string, measured: Array<Partial<Row>>): StoredRun {
    const benchmark = syntheticSubmission();
    benchmark.measurements.rows = rows(measured);
    return {
      public_id: id, submission_id: id, benchmark, summary: summarizeBenchmark(benchmark), description_md: "",
      owner_hash: "private", body_sha256: "private", revision: 1, hidden: false, deleted: false,
      row_count: measured.length, byte_size: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    };
  }
  const narrow = () => runAt("narrow", [{ prompt_tokens: 512, tg_tps: 90, e2e_ms: 1000 }]);
  const wide = () => runAt("wide", [
    { prompt_tokens: 512, tg_tps: 85, e2e_ms: 1100 },
    { prompt_tokens: 4096, tg_tps: 45, e2e_ms: 8000 },
  ]);

  it("ranks on the selected point instead of a mean that rewards the narrowest grid", () => {
    const narrowSummary = narrow().summary;
    const wideSummary = wide().summary;
    // The retained mixed mean would put the result that only measured 512 on top.
    expect(narrowSummary.mean_tg_tps!).toBeGreaterThan(wideSummary.mean_tg_tps!);
    const at512 = { sort: "throughput_desc", point_tokens: 512, point_concurrency: 1 } as const;
    expect(sortValue(narrowSummary, at512)).toBe(90);
    expect(sortValue(wideSummary, at512)).toBe(85);
    const at4k = { sort: "throughput_desc", point_tokens: 4096, point_concurrency: 1 } as const;
    expect(sortValue(narrowSummary, at4k)).toBeNull();
    expect(sortValue(wideSummary, at4k)).toBe(45);
  });

  it("orders a page by the selected point and sorts an unmeasured point last", async () => {
    store.runs.set("narrow", narrow());
    store.runs.set("wide", wide());
    const at = (point_tokens: number) => ({ sort: "duration_asc", point_tokens, point_concurrency: 1 } as const);
    expect((await store.listRuns(at(512), 10, null)).items.map((item) => item.public_id)).toEqual(["narrow", "wide"]);
    // At 4K only one result measured anything, so the other has no value and sorts last.
    expect((await store.listRuns(at(4096), 10, null)).items.map((item) => item.public_id)).toEqual(["wide", "narrow"]);
  });

  it("shows every result at the selected point unless point_only is asked for", async () => {
    store.runs.set("narrow", narrow());
    store.runs.set("wide", wide());
    const selection = { point_tokens: 4096, point_concurrency: 1 } as const;
    expect((await store.listRuns(selection, 10, null)).items.map((item) => item.public_id).sort()).toEqual(["narrow", "wide"]);
    expect((await store.listRuns({ ...selection, point_only: true }, 10, null)).items.map((item) => item.public_id)).toEqual(["wide"]);
    expect(matchesFilters(narrow().summary, { ...selection, point_only: true })).toBe(false);
    expect(matchesFilters(narrow().summary, selection)).toBe(true);
  });

  it("suggests the points that were measured, ordered by what they measure", async () => {
    store.runs.set("narrow", narrow());
    store.runs.set("wide", wide());
    const { options } = await store.listOptions("point", "", {});
    expect(options).toEqual([{ value: "512/1", count: 2 }, { value: "4096/1", count: 1 }]);
  });

  it("reads the selected point in generated SQL and never the retained means", () => {
    const statement = listSql({ sort: "throughput_desc", point_tokens: 4096, point_concurrency: 1 }, 5, null);
    expect(statement.query).toContain("summary->'points'");
    expect(statement.query).toContain("'tg_tps'->>'median'");
    expect(statement.query).not.toContain("mean_tg_tps");
    expect(statement.values).toContain(4096);
    const onlyMeasured = listSql({ point_tokens: 4096, point_concurrency: 1, point_only: true }, 5, null);
    expect(onlyMeasured.query).toContain("exists (select 1 from");
    const points = optionsSql("point", "", { point_tokens: 4096, point_concurrency: 1 });
    expect(points.query).toContain("order by tokens, concurrency");
    expect(points.values).not.toContain(4096);
  });
});

describe("naming an operating point", () => {
  const filters = (search: string) => parseFilters(new URLSearchParams(search));

  it("takes a point as a pair and rejects half of one", () => {
    expect(filters("point_tokens=4096&point_concurrency=1")).toMatchObject({ point_tokens: 4096, point_concurrency: 1 });
    expect(filters("")).toEqual({});
    for (const half of ["point_tokens=4096", "point_concurrency=1"]) {
      expect(() => filters(half)).toThrow(/name one point together/);
    }
    for (const bad of ["point_tokens=0&point_concurrency=1", "point_tokens=x&point_concurrency=1", "point_tokens=-1&point_concurrency=1"]) {
      expect(() => filters(bad)).toThrow(/whole number/);
    }
  });

  it("requires a point for the sorts that rank measured speed", () => {
    for (const sort of ["throughput_desc", "duration_asc"]) {
      expect(() => filters(`sort=${sort}`)).toThrow(/operating point/);
      expect(filters(`sort=${sort}&point_tokens=512&point_concurrency=1`)).toMatchObject({ sort });
    }
    // Sorts that read configuration rather than measured speed are unaffected.
    expect(filters("sort=context_desc")).toEqual({ sort: "context_desc" });
  });

  it("only narrows the list when point_only is asked for, and needs a point to narrow to", () => {
    expect(filters("point_tokens=512&point_concurrency=1&point_only=1").point_only).toBe(true);
    expect(filters("point_tokens=512&point_concurrency=1&point_only=0").point_only).toBeUndefined();
    expect(() => filters("point_only=1")).toThrow(/requires point_tokens/);
    expect(() => filters("point_tokens=512&point_concurrency=1&point_only=yes")).toThrow(/must be 0 or 1/);
  });

  it("excludes the selected point from its own suggestions", () => {
    const query = parseOptionsQuery(new URLSearchParams("field=point&point_tokens=512&point_concurrency=1&point_only=1&os=linux"));
    expect(query.field).toBe("point");
    expect(query.filters).toEqual({ os: "linux" });
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { syntheticSubmission } from "@/lib/fixtures";
import { matchesFilters, parseFilters, parseOptionsQuery, sortValue } from "@/lib/benchmark-discovery";
import { SERVING_METRIC_KEYS, defaultServingPoint, findServingPoint, parseServingPointId, readServingPoints,
  servingMetricValues, servingPointId, servingPointMedian, summarizeServingPoints } from "@/lib/benchmark-points";
import { summarizeBenchmark } from "@/lib/summary";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { freshStore, setupTestEnv } from "./helpers";
import type { StoredRun } from "@/server/repository";

setupTestEnv();
let store: InMemoryBenchmarkStore;
beforeEach(() => { store = freshStore(); });

type Row = ReturnType<typeof syntheticSubmission>["measurements"]["rows"][number];
const base = (): Row => syntheticSubmission().measurements.rows[0]!;
function rows(overrides: Array<Partial<Row>>): Row[] {
  return overrides.map((override) => ({ ...base(), ...override }));
}
const usage = (prompt: number, completion: number): Partial<Row> => ({
  reported_prompt_tokens: prompt, reported_completion_tokens: completion, usage_status: "complete",
  prefill_tokens_per_second: 5000, decode_tokens_per_second: 50, tpot_ms: 20,
});

describe("shared API serving points", () => {
  it("groups rows by concurrency, input bytes and output cap, ascending", () => {
    const points = summarizeServingPoints(rows([
      { input_bytes: 16384, concurrency: 1 },
      { input_bytes: 4096, concurrency: 4 },
      { input_bytes: 4096, concurrency: 1 },
      { input_bytes: 4096, concurrency: 1, max_output_tokens: 64 },
    ]));
    expect(points.map((point) => [point.input_bytes, point.concurrency, point.max_output_tokens])).toEqual([
      [4096, 1, 64], [4096, 1, 128], [16384, 1, 128], [4096, 4, 128],
    ]);
  });

  it("carries exactly the coordinates, samples and the eight shared metrics", () => {
    const [point] = summarizeServingPoints(rows([{}]));
    expect(Object.keys(point!)).toEqual(["input_bytes", "max_output_tokens", "concurrency", "samples", ...SERVING_METRIC_KEYS]);
    expect(SERVING_METRIC_KEYS).toEqual(["first_output_ms", "prefill_tokens_per_second", "decode_tokens_per_second", "tpot_ms",
      "reported_tokens_per_second", "output_bytes_per_second", "e2e_ms", "peak_memory_bytes"]);
  });

  it("retains per-metric medians and sample counts without averaging unknowns", () => {
    const points = summarizeServingPoints([
      ...rows([
        { output_bytes: 2, e2e_ms: 200 },
        { output_bytes: 4, e2e_ms: 0 },
        { output_bytes: 6, e2e_ms: 200 },
        { output_bytes: 100, failed: true },
      ]),
      { ...base(), output_bytes: 100, error: "failed request" },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0]!.samples).toBe(3);
    expect(points[0]!.output_bytes_per_second).toEqual({ median: 20, min: 10, max: 30, samples: 2 });
    expect(points[0]!.first_output_ms).toEqual({ median: 20, min: 20, max: 20, samples: 3 });
    for (const key of ["reported_tokens_per_second", "prefill_tokens_per_second", "decode_tokens_per_second", "tpot_ms", "peak_memory_bytes"] as const) {
      expect(points[0]![key], key).toBeNull();
    }
  });

  it("takes the midpoint of the two middle values on an even count", () => {
    const [point] = summarizeServingPoints(rows([{ e2e_ms: 100 }, { e2e_ms: 400 }]));
    expect(point!.e2e_ms).toEqual({ median: 250, min: 100, max: 400, samples: 2 });
  });

  it("derives the reported token rate per row from completion tokens and E2E, then takes the median", () => {
    const points = summarizeServingPoints(rows([
      { ...usage(1000, 100), e2e_ms: 1000 },
      { ...usage(1000, 100), e2e_ms: 500 },
      { ...usage(1000, 100), e2e_ms: 2000 },
      { e2e_ms: 100 },
    ]));
    expect(points[0]!.reported_tokens_per_second).toEqual({ median: 100, min: 50, max: 200, samples: 3 });
    expect(points[0]!.prefill_tokens_per_second).toEqual({ median: 5000, min: 5000, max: 5000, samples: 3 });
    expect(servingMetricValues({ ...base(), ...usage(1000, 100), e2e_ms: 1000 }).reported_tokens_per_second).toBe(100);
    expect(servingMetricValues(base()).reported_tokens_per_second).toBeNull();
  });

  it("keeps nonfinite derived rates unknown, while observed positive-duration zero is zero", () => {
    const overflow = { ...base(), output_bytes: 1, e2e_ms: 1e-320 };
    expect(servingMetricValues(overflow).output_bytes_per_second).toBeNull();
    expect(summarizeServingPoints([overflow])[0]!.output_bytes_per_second).toBeNull();
    const empty = { ...base(), output_bytes: 0 };
    expect(servingMetricValues(empty).output_bytes_per_second).toBe(0);
    expect(summarizeServingPoints([empty])[0]!.output_bytes_per_second).toEqual({ median: 0, min: 0, max: 0, samples: 1 });
  });

  it("stores the points on the summary", () => {
    const benchmark = syntheticSubmission();
    benchmark.measurements.rows = rows([{ e2e_ms: 100 }, { input_bytes: 16384, e2e_ms: 400 }]);
    const summary = summarizeBenchmark(benchmark);
    expect(summary.serving_points.map((point) => [point.input_bytes, point.e2e_ms!.median])).toEqual([[4096, 100], [16384, 400]]);
    expect(summary).not.toHaveProperty("points");
  });

  it("names all three dimensions within the shared bounds, including the 128-token output cap", () => {
    const points = summarizeServingPoints([base(), { ...base(), max_output_tokens: 64 }]);
    expect(servingPointId(4096, 1, 128)).toBe("b4096/c1/o128");
    expect(parseServingPointId("b4096/c1/o128")).toEqual({ input_bytes: 4096, concurrency: 1, max_output_tokens: 128 });
    expect(parseServingPointId("b256/c64/o1")).toEqual({ input_bytes: 256, concurrency: 64, max_output_tokens: 1 });
    expect(parseServingPointId("b1048576/c1/o128")).toEqual({ input_bytes: 1048576, concurrency: 1, max_output_tokens: 128 });
    for (const id of ["4096/1", "b4096/c1", "b4096/c0/o128", "b0/c1/o128", "b4096/c1/o0", "b04096/c1/o128", "b9007199254740992/c1/o128",
      "b4096/c1/o129", "b4096/c1/o1024", "b255/c1/o128", "b1048577/c1/o128", "b4096/c65/o128"]) {
      expect(parseServingPointId(id), id).toBeNull();
    }
    expect(defaultServingPoint(points)).toBe(points[0]);
    expect(defaultServingPoint([])).toBeNull();
    expect(findServingPoint(points, 4096, 1, 64)).toBe(points[0]);
    expect(findServingPoint(points, 4096, 1, 128)).toBe(points[1]);
    expect(findServingPoint(points, 4096, 1, 32)).toBeNull();
    expect(servingPointMedian(points[1]!, "output_bytes_per_second")).toBe(60);
    expect(servingPointMedian(null, "output_bytes_per_second")).toBeNull();
  });

  it("reads only well-formed points without inventing samples", () => {
    const points = summarizeServingPoints(rows([{}]));
    expect(readServingPoints(points)).toEqual(points);
    expect(readServingPoints(undefined)).toEqual([]);
    expect(readServingPoints([
      { ...points[0], samples: 0 },
      { ...points[0], output_bytes_per_second: { median: Infinity, min: 0, max: Infinity, samples: 1 } },
      { ...points[0], e2e_ms: { median: 200, min: 200, max: 200, samples: 2 } },
      { ...points[0], e2e_ms: { median: 100, min: 200, max: 200, samples: 1 } },
      { input_bytes: 4096, concurrency: 1, samples: 1 },
    ])).toEqual([]);
  });
});

describe("ranking at one operating point", () => {
  function runAt(id: string, measured: Array<Partial<Row>>): StoredRun {
    const benchmark = syntheticSubmission();
    benchmark.measurements.rows = rows(measured);
    benchmark.workload.inputs = [...new Set(benchmark.measurements.rows.map((row) => row.input_bytes))]
      .map((bytes) => ({ bytes, sha256: "a".repeat(64) }));
    return {
      public_id: id, submission_id: id, benchmark, summary: summarizeBenchmark(benchmark), description_md: "",
      owner_hash: "private", body_sha256: "private", revision: 1, hidden: false, deleted: false,
      row_count: measured.length, byte_size: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    };
  }
  const narrow = () => runAt("narrow", [{ e2e_ms: 1000 }]);
  const wide = () => runAt("wide", [{ e2e_ms: 1100 }, { input_bytes: 16384, e2e_ms: 8000 }]);
  const at = (point_bytes: number) => ({ point_bytes, point_concurrency: 1, point_max_tokens: 128 });

  it("reads the selected point and leaves an unmeasured point unknown", () => {
    expect(sortValue(narrow().summary, { ...at(4096), sort: "duration_asc" })).toBe(1000);
    expect(sortValue(wide().summary, { ...at(4096), sort: "duration_asc" })).toBe(1100);
    expect(sortValue(narrow().summary, { ...at(16384), sort: "duration_asc" })).toBeNull();
    expect(sortValue(wide().summary, { ...at(16384), sort: "duration_asc" })).toBe(8000);
    expect(sortValue(narrow().summary, { ...at(4096), sort: "output_rate_desc" })).toBe(12);
    expect(sortValue(narrow().summary, { ...at(4096), sort: "token_rate_desc" })).toBeNull();
  });

  it("orders a page by the selected point and sorts an unmeasured point last", async () => {
    store.runs.set("narrow", narrow());
    store.runs.set("wide", wide());
    expect((await store.listRuns({ ...at(4096), sort: "duration_asc" }, 10, null)).items.map((item) => item.public_id)).toEqual(["narrow", "wide"]);
    expect((await store.listRuns({ ...at(16384), sort: "duration_asc" }, 10, null)).items.map((item) => item.public_id)).toEqual(["wide", "narrow"]);
  });

  it("shows every result at the selected point unless point_only is asked for", async () => {
    store.runs.set("narrow", narrow());
    store.runs.set("wide", wide());
    expect((await store.listRuns(at(16384), 10, null)).items.map((item) => item.public_id).sort()).toEqual(["narrow", "wide"]);
    expect((await store.listRuns({ ...at(16384), point_only: true }, 10, null)).items.map((item) => item.public_id)).toEqual(["wide"]);
    expect(matchesFilters(narrow().summary, { ...at(16384), point_only: true })).toBe(false);
    expect(matchesFilters(narrow().summary, at(16384))).toBe(true);
  });

  it("suggests the points that were measured, ordered by what they measure", async () => {
    store.runs.set("narrow", narrow());
    store.runs.set("wide", wide());
    const { options } = await store.listOptions("point", "", {});
    expect(options).toEqual([{ value: "b4096/c1/o128", count: 2 }, { value: "b16384/c1/o128", count: 1 }]);
  });
});

describe("naming an operating point", () => {
  const filters = (search: string) => parseFilters(new URLSearchParams(search));
  const point = "point_bytes=4096&point_concurrency=1&point_max_tokens=128";

  it("takes a point as a complete triple and rejects part of one", () => {
    expect(filters(point)).toEqual({ point_bytes: 4096, point_concurrency: 1, point_max_tokens: 128 });
    expect(filters("")).toEqual({});
    for (const part of ["point_bytes=4096", "point_concurrency=1", "point_max_tokens=128", "point_bytes=4096&point_concurrency=1"]) {
      expect(() => filters(part), part).toThrow();
    }
    for (const bad of ["point_bytes=0&point_concurrency=1&point_max_tokens=128", "point_bytes=x&point_concurrency=1&point_max_tokens=128",
      "point_bytes=-1&point_concurrency=1&point_max_tokens=128", "point_bytes=4096&point_concurrency=1&point_max_tokens=129"]) {
      expect(() => filters(bad), bad).toThrow();
    }
  });

  it("requires a complete point for the sorts that rank measured speed", () => {
    for (const sort of ["token_rate_desc", "output_rate_desc", "duration_asc"]) {
      expect(() => filters(`sort=${sort}`)).toThrow();
      expect(filters(`sort=${sort}&${point}`)).toMatchObject({ sort });
    }
    // Sorts that read configuration rather than measured speed are unaffected.
    expect(filters("sort=input_bytes_desc")).toEqual({ sort: "input_bytes_desc" });
  });

  it("only narrows the list when point_only is asked for, and needs a point to narrow to", () => {
    expect(filters(`${point}&point_only=1`).point_only).toBe(true);
    expect(filters(`${point}&point_only=0`).point_only).toBeUndefined();
    expect(() => filters("point_only=1")).toThrow();
    expect(() => filters(`${point}&point_only=yes`)).toThrow();
  });

  it("excludes the selected point from its own suggestions", () => {
    const query = parseOptionsQuery(new URLSearchParams(`field=point&${point}&point_only=1&os=linux`));
    expect(query.field).toBe("point");
    expect(query.filters).toEqual({ os: "linux" });
  });
});

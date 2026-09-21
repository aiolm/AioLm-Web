/**
 * Operating points: the unit at which two measurements are comparable.
 *
 * A run's measurement rows are a grid of the configured input lengths against
 * the configured batch sizes, repeated `workload.repetitions` times at one
 * generation length. Averaging that whole grid answers no question a reader
 * has: a duration averaged over a 512-token and a 16K-token prompt describes
 * neither, and a generation rate averaged over concurrency 1 and 16 is not a
 * rate either of them reported.
 *
 * So rows are grouped by (prompt_tokens, concurrency, generation_length) - one
 * operating point - and only the repetitions inside a point are aggregated,
 * because only they measured the same thing more than once.
 *
 * The median is the reported value. Repetition counts are small, and one cold
 * repetition moves a mean of three far more than it moves their middle value.
 * An even count takes the mean of the two middle values, which is exactly what
 * PostgreSQL percentile_cont(0.5) computes, so the value stored at acceptance
 * and the value migration 012 backfills from the same rows agree.
 */

/**
 * Median with the spread it was taken from, so a noisy point cannot hide behind
 * one number. Declared as an object type, like BenchmarkModelInfo, so a summary
 * carrying it stays assignable to the JSON value the store writes.
 */
export type MetricStat = {
  median: number;
  min: number;
  max: number;
};

/** Metrics aggregated per point, named exactly as the contract's row fields name them. */
export const POINT_METRIC_KEYS = ["pp_tps", "tg_tps", "ttft_ms", "e2e_ms"] as const;
export type PointMetric = (typeof POINT_METRIC_KEYS)[number];

export type BenchmarkPoint = {
  /** Input length of every row aggregated here, in tokens. */
  prompt_tokens: number;
  /** Concurrent requests of every row aggregated here. */
  concurrency: number;
  /** Generation length of every row aggregated here, in tokens. */
  generation_length: number;
  /** Rows behind this point: the repetitions that actually ran. */
  samples: number;
  /** Null when no row here reported the metric - unknown, never zero. */
  pp_tps: MetricStat | null;
  tg_tps: MetricStat | null;
  ttft_ms: MetricStat | null;
  e2e_ms: MetricStat | null;
};

/**
 * Upper bound on points kept per result. The contract allows 64 input lengths
 * against 64 batch sizes, and a summary travels with every item of a list page,
 * so the list is cut rather than letting one pathological grid weigh down every
 * query. Points are kept ascending, so a cut drops the largest inputs and the
 * result says it was cut instead of quietly showing a shorter grid.
 */
export const POINT_LIMIT = 64;

/** A row as stored. Every field is read defensively: a hand-edited row must not crash a page. */
export interface MeasurementRowLike {
  prompt_tokens?: unknown;
  concurrency?: unknown;
  generation_length?: unknown;
  pp_tps?: unknown;
  tg_tps?: unknown;
  ttft_ms?: unknown;
  e2e_ms?: unknown;
  failed?: unknown;
}

function wholeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Median, interpolated exactly as PostgreSQL percentile_cont(0.5) interpolates:
 * `low + (high - low) * 0.5` between the two middle values, not `(low + high) / 2`.
 * The two spellings disagree in the last bit for some pairs of doubles, and the
 * value computed here has to equal the value migration 012 backfills from the
 * same rows, so the arithmetic is the same arithmetic.
 */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid]!;
  const low = sorted[mid - 1]!;
  return low + (sorted[mid]! - low) * 0.5;
}

function statOf(values: readonly number[]): MetricStat | null {
  if (values.length === 0) return null;
  let min = values[0]!;
  let max = values[0]!;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { median: median(values), min, max };
}

interface PointGroup {
  prompt_tokens: number;
  concurrency: number;
  generation_length: number;
  samples: number;
  values: Record<PointMetric, number[]>;
}

/**
 * Rows reduced to their operating points, ascending by input length, then
 * concurrency, then generation length.
 *
 * A failed row measured nothing and is skipped. A row whose input length,
 * concurrency or generation length is not a whole positive count belongs to no
 * point a reader could name, so it is skipped rather than filed under an
 * invented one; the run's row_count still counts it. Within a point each metric
 * aggregates only the rows that reported it, so one row missing prefill does not
 * discard that row's generation rate.
 */
export function summarizePoints(rows: readonly MeasurementRowLike[]): { points: BenchmarkPoint[]; truncated: boolean } {
  const groups = new Map<string, PointGroup>();
  for (const row of rows) {
    if (row.failed === true) continue;
    const promptTokens = wholeCount(row.prompt_tokens);
    const concurrency = wholeCount(row.concurrency);
    const generationLength = wholeCount(row.generation_length);
    if (promptTokens === null || concurrency === null || generationLength === null) continue;
    const id = [promptTokens, concurrency, generationLength].join("|");
    let group = groups.get(id);
    if (!group) {
      group = {
        prompt_tokens: promptTokens,
        concurrency,
        generation_length: generationLength,
        samples: 0,
        values: { pp_tps: [], tg_tps: [], ttft_ms: [], e2e_ms: [] },
      };
      groups.set(id, group);
    }
    group.samples += 1;
    for (const metric of POINT_METRIC_KEYS) {
      const value = finiteNumber(row[metric]);
      if (value !== null) group.values[metric].push(value);
    }
  }
  const all = [...groups.values()]
    .sort((a, b) =>
      a.prompt_tokens - b.prompt_tokens || a.concurrency - b.concurrency || a.generation_length - b.generation_length)
    .map((group) => ({
      prompt_tokens: group.prompt_tokens,
      concurrency: group.concurrency,
      generation_length: group.generation_length,
      samples: group.samples,
      pp_tps: statOf(group.values.pp_tps),
      tg_tps: statOf(group.values.tg_tps),
      ttft_ms: statOf(group.values.ttft_ms),
      e2e_ms: statOf(group.values.e2e_ms),
    }));
  return { points: all.slice(0, POINT_LIMIT), truncated: all.length > POINT_LIMIT };
}

/** Stored points, read defensively: anything that is not a usable point is not one. */
export function readPoints(value: unknown): BenchmarkPoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is BenchmarkPoint => {
    if (typeof entry !== "object" || entry === null) return false;
    const point = entry as Partial<BenchmarkPoint>;
    return wholeCount(point.prompt_tokens) !== null && wholeCount(point.concurrency) !== null;
  });
}

export function findPoint(
  points: readonly BenchmarkPoint[] | undefined,
  promptTokens: number,
  concurrency: number,
): BenchmarkPoint | null {
  return (points ?? []).find((point) => point.prompt_tokens === promptTokens && point.concurrency === concurrency) ?? null;
}

/**
 * The point a result leads with when the reader has not chosen one: its
 * shortest input at its lowest concurrency. Points are stored ascending, so
 * that is the first of them, and it is a point the run really measured rather
 * than a blend of several.
 */
export function defaultPoint(points: readonly BenchmarkPoint[] | undefined): BenchmarkPoint | null {
  return points?.[0] ?? null;
}

export function pointMedian(point: BenchmarkPoint | null, metric: PointMetric): number | null {
  return point?.[metric]?.median ?? null;
}

/** Addressable identity of a point, as the list address and the options API spell it. */
export function pointId(promptTokens: number, concurrency: number): string {
  return `${promptTokens}/${concurrency}`;
}

export function parsePointId(value: string): { prompt_tokens: number; concurrency: number } | null {
  const match = /^(\d{1,16})\/(\d{1,16})$/.exec(value.trim());
  if (!match) return null;
  const promptTokens = wholeCount(Number(match[1]));
  const concurrency = wholeCount(Number(match[2]));
  return promptTokens === null || concurrency === null ? null : { prompt_tokens: promptTokens, concurrency };
}

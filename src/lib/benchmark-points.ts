import {
  MAX_SERVING_OUTPUT_TOKENS,
  SERVING_METRIC_KEYS,
  type ServingBenchmarkPoint,
  type ServingMetricKey,
} from "@aiolm/benchmark-contracts";
export {
  SERVING_METRIC_KEYS,
  servingMetricValues,
  summarizeServingPoints,
  type ServingAggregationRow,
  type ServingBenchmarkPoint,
  type ServingMetricKey,
  type ServingMetricStat,
} from "@aiolm/benchmark-contracts";

function wholeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Read the shared serving shape without inventing missing observations or sample counts. */
export function readServingPoints(value: unknown): ServingBenchmarkPoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ServingBenchmarkPoint => {
    if (typeof entry !== "object" || entry === null) return false;
    const point = entry as Partial<ServingBenchmarkPoint>;
    if (wholeCount(point.input_bytes) === null || wholeCount(point.concurrency) === null ||
        wholeCount(point.max_output_tokens) === null || wholeCount(point.samples) === null) return false;
    return SERVING_METRIC_KEYS.every((key) => {
      const stat = point[key];
      return stat === null || (typeof stat === "object" && stat !== undefined &&
        wholeCount(stat.samples) !== null && stat.samples <= point.samples! &&
        [stat.median, stat.min, stat.max].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0) &&
        stat.min <= stat.median && stat.median <= stat.max);
    });
  });
}

export function findServingPoint(
  points: readonly ServingBenchmarkPoint[] | undefined,
  inputBytes: number,
  concurrency: number,
  maxOutputTokens: number,
): ServingBenchmarkPoint | null {
  return (points ?? []).find((point) => point.input_bytes === inputBytes &&
    point.concurrency === concurrency && point.max_output_tokens === maxOutputTokens) ?? null;
}

export function defaultServingPoint(points: readonly ServingBenchmarkPoint[] | undefined): ServingBenchmarkPoint | null {
  return points?.[0] ?? null;
}

export function servingPointMedian(point: ServingBenchmarkPoint | null, metric: ServingMetricKey): number | null {
  return point?.[metric]?.median ?? null;
}

export function servingPointId(inputBytes: number, concurrency: number, maxOutputTokens: number): string {
  return `b${inputBytes}/c${concurrency}/o${maxOutputTokens}`;
}

export function parseServingPointId(value: string): Pick<ServingBenchmarkPoint, "input_bytes" | "concurrency" | "max_output_tokens"> | null {
  const match = /^b([1-9]\d{0,15})\/c([1-9]\d{0,15})\/o([1-9]\d{0,15})$/.exec(value);
  if (!match) return null;
  const input_bytes = wholeCount(Number(match[1]));
  const concurrency = wholeCount(Number(match[2]));
  const max_output_tokens = wholeCount(Number(match[3]));
  if (input_bytes === null || concurrency === null || max_output_tokens === null ||
      input_bytes < 256 || input_bytes > 1048576 || concurrency > 64 || max_output_tokens > MAX_SERVING_OUTPUT_TOKENS) return null;
  return { input_bytes, concurrency, max_output_tokens };
}

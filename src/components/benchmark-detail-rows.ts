import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";
import type { ServingMetricKey } from "@aiolm/benchmark-contracts";
/**
 * Column contract for the measurement table. The published row shape is fixed
 * by `@aiolm/benchmark-contracts` (`$defs/row`), so columns are declared here in
 * one order with each metric's reported unit, rather than taken from whichever
 * keys the first loaded row happened to carry. A key the contract does not know
 * is still shown under its raw name, so no metric is ever lost silently.
 */

import { formatThroughput } from "./benchmark-explorer-format";
import {
  formatCellValue,
  formatCompactBytes,
  formatCount,
  formatSeconds,
  formatMilliseconds,
} from "./benchmark-detail-format";

export interface RowColumn {
  key: string;
  label: string;
  /** Reported unit, rendered beside the label instead of inside every cell. */
  unit?: string;
  /** Numeric columns are aligned and tabulated as a column, not as prose. */
  numeric: boolean;
  format: (value: unknown) => string;
}

function throughput(value: unknown): string {
  return formatThroughput(typeof value === "number" ? value : null);
}

function measurementColumns(t: Translator): readonly RowColumn[] {
  return [
    { key: "prompt_tokens", label: t("benchmark.Prompt"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
    { key: "concurrency", label: t("benchmark.Concurrency"), numeric: true, format: formatCount },
    { key: "repetition", label: t("benchmark.Repetition"), numeric: true, format: formatCount },
    { key: "pp_tps", label: t("benchmark.Prefill"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
    { key: "tg_tps", label: t("benchmark.Decode"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
    { key: "ttft_ms", label: t("benchmark.TTFT"), unit: t("benchmark.ms"), numeric: true, format: formatMilliseconds },
    { key: "peak_memory_bytes", label: t("benchmark.Peak process memory"), numeric: true, format: (value) => formatCompactBytes(value, t) },
    { key: "generation_length", label: t("benchmark.Generation length"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
    { key: "completion_tokens", label: t("benchmark.Completion"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
    { key: "cached_tokens", label: t("benchmark.Cached"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
    { key: "tpot_ms", label: t("benchmark.Time per output token"), unit: t("benchmark.ms"), numeric: true, format: formatMilliseconds },
    { key: "e2e_ms", label: t("benchmark.End-to-end duration"), unit: t("benchmark.s"), numeric: true, format: formatSeconds },
    { key: "total_tps", label: t("benchmark.Total throughput"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
    { key: "timing_source", label: t("benchmark.Timing source"), numeric: false, format: (value: unknown) => formatCellValue(value, t) },
  ];
}

/** Shared metric presentation for serving rows, points and comparison. */
export function servingMetricColumns(t: Translator = benchmarkFallback): RowColumn[] {
  const metrics: { key: ServingMetricKey; label: string; unit: string; format: (value: unknown) => string }[] = [
    { key: "first_output_ms", label: "First observed output", unit: "ms", format: formatMilliseconds },
    { key: "first_content_ms", label: "First observed content", unit: "ms", format: formatMilliseconds },
    { key: "first_reasoning_ms", label: "First observed reasoning", unit: "ms", format: formatMilliseconds },
    { key: "e2e_ms", label: "End-to-end duration", unit: "s", format: formatSeconds },
    { key: "content_bytes", label: "Observed content", unit: "B", format: formatCount },
    { key: "reasoning_bytes", label: "Observed reasoning", unit: "B", format: formatCount },
    { key: "output_bytes", label: "Observed output", unit: "B", format: formatCount },
    { key: "output_bytes_per_second", label: "Observed output rate", unit: "B/s", format: throughput },
    { key: "reported_prompt_tokens", label: "Reported prompt tokens", unit: "tok", format: formatCount },
    { key: "reported_completion_tokens", label: "Reported completion tokens", unit: "tok", format: formatCount },
    { key: "reported_cached_tokens", label: "Reported cached tokens", unit: "tok", format: formatCount },
    { key: "reported_tokens_per_second", label: "Reported token rate", unit: "tok/s", format: throughput },
    { key: "peak_memory_bytes", label: "Peak process memory", unit: "B", format: formatCount },
  ];
  return metrics.map((metric) => ({ ...metric, label: t(`benchmark.${metric.label}`), numeric: true }));
}

function servingColumns(t: Translator): RowColumn[] {
  return [
    { key: "input_bytes", label: t("benchmark.Input UTF-8 bytes"), unit: "B", numeric: true, format: formatCount },
    { key: "concurrency", label: t("benchmark.Concurrency"), numeric: true, format: formatCount },
    { key: "max_output_tokens", label: t("benchmark.Maximum output token request"), unit: "tok", numeric: true, format: formatCount },
    { key: "repetition", label: t("benchmark.Repetition"), numeric: true, format: formatCount },
    ...servingMetricColumns(t),
    { key: "usage_status", label: t("benchmark.Usage status"), numeric: false, format: (value) => formatCellValue(value, t) },
    { key: "finish_reasons", label: t("benchmark.Finish reasons (request order)"), numeric: false, format: (value) => Array.isArray(value) ? value.join(", ") : formatCellValue(value, t) },
    { key: "timing_source", label: t("benchmark.Timing source"), numeric: false, format: (value) => formatCellValue(value, t) },
  ];
}

const SERVING_CORE_KEYS: Record<string, true> = { input_bytes: true, concurrency: true, max_output_tokens: true, repetition: true, first_output_ms: true, e2e_ms: true, output_bytes: true, output_bytes_per_second: true, reported_tokens_per_second: true, peak_memory_bytes: true };

const CONTRACT_KEYS = new Set(measurementColumns(benchmarkFallback).map((column) => column.key));

export const CORE_ROW_KEYS = new Set([
  "prompt_tokens",
  "concurrency",
  "repetition",
  "pp_tps",
  "tg_tps",
  "ttft_ms",
  "peak_memory_bytes",
]);

/**
 * Contract columns first, in contract order, then any unrecognized key in the
 * order it was first seen. Only keys that some visible row actually carries get
 * a column, so an absent metric is not implied by an empty one.
 *
 * When detailed is false (default), only core metrics are included.
 * When detailed is true, all measured metrics are included.
 */
export function buildRowColumns(
  rows: ReadonlyArray<Record<string, unknown>>,
  tOrDetailed?: Translator | boolean,
  maybeDetailed?: boolean,
  schemaVersion?: unknown,
): RowColumn[] {
  let t: Translator = benchmarkFallback;
  let detailed = !!maybeDetailed;
  if (typeof tOrDetailed === "boolean") {
    detailed = tOrDetailed;
  } else if (typeof tOrDetailed === "function") {
    t = tOrDetailed;
    detailed = !!maybeDetailed;
  }
  if (schemaVersion === 3) {
    const columns = servingColumns(t);
    return detailed ? columns : columns.filter((column) => SERVING_CORE_KEYS[column.key]);
  }
  const seen = new Set<string>();
  const extras: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === "failed") continue;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!CONTRACT_KEYS.has(key)) extras.push(key);
    }
  }
  const allContract = measurementColumns(t).filter((column) => seen.has(column.key));
  const contract = detailed
    ? allContract
    : allContract.filter((column) => CORE_ROW_KEYS.has(column.key));
  const extraCols = detailed
    ? extras.map((key) => ({
        key,
        label: key,
        numeric: false,
        format: (value: unknown) => formatCellValue(value, t),
      }))
    : [];
  return [...contract, ...extraCols];
}

export function isFailedRow(row: Record<string, unknown>): boolean {
  return row["failed"] === true;
}

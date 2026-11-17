import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";
import type { ServingMetricKey } from "@aiolm/benchmark-contracts";
/**
 * Column contract for the measurement table. The published row shape is fixed
 * by `@aiolm/benchmark-contracts` (`$defs/row`), so columns are declared here in
 * one order with each metric's reported unit. Raw output bytes and reported
 * token counts are rate inputs, never columns of their own.
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

/** The eight serving metrics, in `SERVING_METRIC_KEYS` order, shared by rows, points and comparison. */
export function servingMetricColumns(t: Translator = benchmarkFallback): RowColumn[] {
  const metrics: { key: ServingMetricKey; label: string; unit?: string; format: (value: unknown) => string }[] = [
    { key: "first_output_ms", label: "First observed output", unit: "ms", format: formatMilliseconds },
    { key: "prefill_tokens_per_second", label: "prefillRate", unit: "tok/s", format: throughput },
    { key: "decode_tokens_per_second", label: "decodeRate", unit: "tok/s", format: throughput },
    { key: "tpot_ms", label: "tpot", unit: "ms", format: formatMilliseconds },
    { key: "reported_tokens_per_second", label: "reportedRate", unit: "tok/s", format: throughput },
    { key: "output_bytes_per_second", label: "Observed output rate", unit: "B/s", format: throughput },
    { key: "e2e_ms", label: "End-to-end duration", unit: "s", format: formatSeconds },
    { key: "peak_memory_bytes", label: "Peak process memory", format: (value) => formatCompactBytes(value, t) },
  ];
  return metrics.map((metric) => ({ ...metric, label: t(`benchmark.${metric.label}`), numeric: true }));
}

function coordinateColumns(t: Translator): RowColumn[] {
  return [
    { key: "input_bytes", label: t("benchmark.Input UTF-8 bytes"), unit: "B", numeric: true, format: formatCount },
    { key: "concurrency", label: t("benchmark.Concurrency"), numeric: true, format: formatCount },
    { key: "max_output_tokens", label: t("benchmark.Maximum output token request"), unit: "tok", numeric: true, format: formatCount },
    { key: "repetition", label: t("benchmark.Repetition"), numeric: true, format: formatCount },
  ];
}

function evidenceColumns(t: Translator): RowColumn[] {
  return [
    { key: "input_sha256_by_request", label: t("benchmark.Input SHA256 per request (launch order)"), numeric: false, format: (value) => Array.isArray(value) ? value.join(", ") : formatCellValue(value, t) },
    { key: "usage_status", label: t("benchmark.Usage status"), numeric: false, format: (value) => value === "complete" ? t("benchmark.Usage counters complete") : value === "partial" ? t("benchmark.Usage counters partial") : value === "missing" ? t("benchmark.Usage not reported") : value === "invalid" ? t("benchmark.Usage response invalid or inconsistent") : formatCellValue(value, t) },
    { key: "finish_reasons", label: t("benchmark.Finish reasons (request order)"), numeric: false, format: (value) => Array.isArray(value) ? value.join(", ") : formatCellValue(value, t) },
    { key: "timing_source", label: t("benchmark.Timing source"), numeric: false, format: (value) => formatCellValue(value, t) },
  ];
}

/**
 * Operating-point coordinates and the eight metrics; the detailed view adds the
 * per-request evidence (prompt hashes, usage status, finish reasons, timing source).
 */
export function buildRowColumns(t: Translator = benchmarkFallback, detailed = false): RowColumn[] {
  return [...coordinateColumns(t), ...servingMetricColumns(t), ...(detailed ? evidenceColumns(t) : [])];
}

export function isFailedRow(row: Record<string, unknown>): boolean {
  return row["failed"] === true;
}

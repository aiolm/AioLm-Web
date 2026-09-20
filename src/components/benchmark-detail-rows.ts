import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";
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

/** A failed sample is named in words, so the outcome does not depend on styling. */
function outcome(value: unknown, t: Translator): string {
  if (value === true) return t("benchmark.Failed");
  if (value === false) return t("benchmark.OK");
  return formatCellValue(value, t);
}

function measurementColumns(t: Translator): readonly RowColumn[] { return [
  { key: "prompt_tokens", label: t("benchmark.Prompt"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
  { key: "generation_length", label: t("benchmark.Generation length"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
  { key: "concurrency", label: t("benchmark.Concurrency"), numeric: true, format: formatCount },
  { key: "repetition", label: t("benchmark.Repetition"), numeric: true, format: formatCount },
  { key: "completion_tokens", label: t("benchmark.Completion"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
  { key: "cached_tokens", label: t("benchmark.Cached"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
  { key: "ttft_ms", label: t("benchmark.Time to first token"), unit: t("benchmark.ms"), numeric: true, format: formatMilliseconds },
  { key: "tpot_ms", label: t("benchmark.Time per output token"), unit: t("benchmark.ms"), numeric: true, format: formatMilliseconds },
  { key: "pp_tps", label: t("benchmark.Prompt processing"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
  { key: "tg_tps", label: t("benchmark.Generation"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
  { key: "e2e_ms", label: t("benchmark.End-to-end duration"), unit: t("benchmark.ms"), numeric: true, format: formatMilliseconds },
  { key: "total_tps", label: t("benchmark.Total throughput"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
  { key: "peak_memory_bytes", label: t("benchmark.Peak memory"), numeric: true, format: (value) => formatCompactBytes(value, t) },
  { key: "timing_source", label: t("benchmark.Timing source"), numeric: false, format: (value: unknown) => formatCellValue(value, t) },
  { key: "failed", label: t("benchmark.Outcome"), numeric: false, format: (value) => outcome(value, t) },
]; }

const CONTRACT_KEYS = new Set(measurementColumns(benchmarkFallback).map((column) => column.key));

/**
 * Contract columns first, in contract order, then any unrecognized key in the
 * order it was first seen. Only keys that some visible row actually carries get
 * a column, so an absent metric is not implied by an empty one.
 */
export function buildRowColumns(rows: ReadonlyArray<Record<string, unknown>>, t: Translator = benchmarkFallback): RowColumn[] {
  const seen = new Set<string>();
  const extras: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      if (!CONTRACT_KEYS.has(key)) extras.push(key);
    }
  }
  return [
    ...measurementColumns(t).filter((column) => seen.has(column.key)),
    ...extras.map((key) => ({ key, label: key, numeric: false, format: (value: unknown) => formatCellValue(value, t) })),
  ];
}

export function isFailedRow(row: Record<string, unknown>): boolean {
  return row["failed"] === true;
}

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
  formatSeconds,
  formatMilliseconds,
} from "./benchmark-detail-format";

export interface RowColumn {
  key: string;
  label: string;
  enLabel: string;
  localLabel?: string;
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
    { key: "prompt_tokens", label: t("benchmark.Prompt"), enLabel: "Prompt", localLabel: t("benchmark.Prompt"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
    { key: "concurrency", label: t("benchmark.Concurrency"), enLabel: "Concurrency", localLabel: t("benchmark.Concurrency"), numeric: true, format: formatCount },
    { key: "repetition", label: t("benchmark.Repetition"), enLabel: "Repetition", localLabel: t("benchmark.Repetition"), numeric: true, format: formatCount },
    { key: "pp_tps", label: t("benchmark.Prefill"), enLabel: "Prefill", localLabel: t("benchmark.Prefill"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
    { key: "tg_tps", label: t("benchmark.Decode"), enLabel: "Decode", localLabel: t("benchmark.Decode"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
    { key: "ttft_ms", label: t("benchmark.TTFT"), enLabel: "TTFT", localLabel: t("benchmark.TTFT"), unit: t("benchmark.ms"), numeric: true, format: formatMilliseconds },
    { key: "peak_memory_bytes", label: t("benchmark.Peak process memory"), enLabel: "Peak process memory", localLabel: t("benchmark.Peak process memory"), numeric: true, format: (value) => formatCompactBytes(value, t) },
    { key: "generation_length", label: t("benchmark.Generation length"), enLabel: "Generation length", localLabel: t("benchmark.Generation length"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
    { key: "completion_tokens", label: t("benchmark.Completion"), enLabel: "Completion", localLabel: t("benchmark.Completion"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
    { key: "cached_tokens", label: t("benchmark.Cached"), enLabel: "Cached", localLabel: t("benchmark.Cached"), unit: t("benchmark.tokens"), numeric: true, format: formatCount },
    { key: "tpot_ms", label: t("benchmark.Time per output token"), enLabel: "TPOT", localLabel: t("benchmark.Time per output token"), unit: t("benchmark.ms"), numeric: true, format: formatMilliseconds },
    { key: "e2e_ms", label: t("benchmark.End-to-end duration"), enLabel: "Duration", localLabel: t("benchmark.End-to-end duration"), unit: t("benchmark.s"), numeric: true, format: formatSeconds },
    { key: "total_tps", label: t("benchmark.Total throughput"), enLabel: "Total throughput", localLabel: t("benchmark.Total throughput"), unit: t("benchmark.tok/s"), numeric: true, format: throughput },
    { key: "timing_source", label: t("benchmark.Timing source"), enLabel: "Timing source", localLabel: t("benchmark.Timing source"), numeric: false, format: (value: unknown) => formatCellValue(value, t) },
  ];
}

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
): RowColumn[] {
  let t: Translator = benchmarkFallback;
  let detailed = false;
  if (typeof tOrDetailed === "boolean") {
    detailed = tOrDetailed;
  } else if (typeof tOrDetailed === "function") {
    t = tOrDetailed;
    detailed = !!maybeDetailed;
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
        enLabel: key,
        numeric: false,
        format: (value: unknown) => formatCellValue(value, t),
      }))
    : [];
  return [...contract, ...extraCols];
}

export function isFailedRow(row: Record<string, unknown>): boolean {
  return row["failed"] === true;
}

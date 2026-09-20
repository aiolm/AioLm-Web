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
function outcome(value: unknown): string {
  if (value === true) return "Failed";
  if (value === false) return "OK";
  return formatCellValue(value);
}

const MEASUREMENT_COLUMNS: readonly RowColumn[] = [
  { key: "prompt_tokens", label: "Prompt", unit: "tokens", numeric: true, format: formatCount },
  { key: "generation_length", label: "Generation length", unit: "tokens", numeric: true, format: formatCount },
  { key: "concurrency", label: "Concurrency", numeric: true, format: formatCount },
  { key: "repetition", label: "Repetition", numeric: true, format: formatCount },
  { key: "completion_tokens", label: "Completion", unit: "tokens", numeric: true, format: formatCount },
  { key: "cached_tokens", label: "Cached", unit: "tokens", numeric: true, format: formatCount },
  { key: "ttft_ms", label: "Time to first token", unit: "ms", numeric: true, format: formatMilliseconds },
  { key: "tpot_ms", label: "Time per output token", unit: "ms", numeric: true, format: formatMilliseconds },
  { key: "pp_tps", label: "Prompt processing", unit: "tok/s", numeric: true, format: throughput },
  { key: "tg_tps", label: "Generation", unit: "tok/s", numeric: true, format: throughput },
  { key: "e2e_ms", label: "End-to-end duration", unit: "ms", numeric: true, format: formatMilliseconds },
  { key: "total_tps", label: "Total throughput", unit: "tok/s", numeric: true, format: throughput },
  { key: "peak_memory_bytes", label: "Peak memory", numeric: true, format: formatCompactBytes },
  { key: "timing_source", label: "Timing source", numeric: false, format: formatCellValue },
  { key: "failed", label: "Outcome", numeric: false, format: outcome },
];

const CONTRACT_KEYS = new Set(MEASUREMENT_COLUMNS.map((column) => column.key));

/**
 * Contract columns first, in contract order, then any unrecognized key in the
 * order it was first seen. Only keys that some visible row actually carries get
 * a column, so an absent metric is not implied by an empty one.
 */
export function buildRowColumns(rows: ReadonlyArray<Record<string, unknown>>): RowColumn[] {
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
    ...MEASUREMENT_COLUMNS.filter((column) => seen.has(column.key)),
    ...extras.map((key) => ({ key, label: key, numeric: false, format: formatCellValue })),
  ];
}

export function isFailedRow(row: Record<string, unknown>): boolean {
  return row["failed"] === true;
}

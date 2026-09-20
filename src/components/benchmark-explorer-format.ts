import type { Translator } from "@/i18n/types";
import { intlLocales, type Locale } from "@/i18n/config";
import { benchmarkFallback } from "./benchmark-i18n";
/**
 * Cell formatting for the explorer. Values are locale independent so a shared
 * link reads the same everywhere, and a missing measurement is shown as a gap
 * rather than as a zero.
 */

export const EXPLORER_MISSING = "—";

/** Mean generation throughput in tokens per second, as published by the run. */
export function formatThroughput(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : EXPLORER_MISSING;
}

/** Mean end-to-end duration in milliseconds. */
export function formatDuration(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : EXPLORER_MISSING;
}

/** Measurement rows behind a result, calling out failed rows so a partial run is not read as a clean one. */
export function formatSampleCount(rowCount: number, failedRows: number, t: Translator = benchmarkFallback): string {
  if (!Number.isFinite(rowCount)) return EXPLORER_MISSING;
  const total = String(rowCount);
  return Number.isFinite(failedRows) && failedRows > 0 ? t("benchmark.{total} ({failed} failed)", { total, failed: failedRows }) : total;
}

/** Publication date as an ISO calendar day in UTC: stable across time zones and server rendering. */
export function formatPublishedDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return EXPLORER_MISSING;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Explicit locale and UTC keep the update timestamp stable across server and browser. */
export function formatUpdatedDate(iso: string, locale: Locale): string {
 const date = new Date(iso);
 return Number.isNaN(date.getTime()) ? EXPLORER_MISSING : new Intl.DateTimeFormat(intlLocales[locale], { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

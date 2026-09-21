import type { Translator } from "@/i18n/types";
import type { BenchmarkSetup } from "@/lib/benchmark-discovery";
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

/** Mean end-to-end duration in seconds. */
export function formatDuration(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? (value / 1000).toFixed(2) : EXPLORER_MISSING;
}

/** VRAM formatted in gigabytes (GB). */
export function formatVramGb(vramMb: unknown, t: Translator = benchmarkFallback): string {
  if (typeof vramMb !== "number" || !Number.isFinite(vramMb) || vramMb < 0) return t("benchmark.Unknown");
  if (vramMb === 0) return t("benchmark.{value} GB", { value: "0" });
  const gb = vramMb / 1024;
  const formatted = Number.isInteger(gb) ? String(gb) : (Math.round(gb * 10) / 10).toString();
  return t("benchmark.{value} GB", { value: formatted });
}

/** Measurement rows behind a result, calling out failed rows so a partial run is not read as a clean one. */
export function formatSampleCount(rowCount: number, failedRows: number, t: Translator = benchmarkFallback): string {
  if (!Number.isFinite(rowCount)) return EXPLORER_MISSING;
  const total = String(rowCount);
  return Number.isFinite(failedRows) && failedRows > 0 ? t("benchmark.{total} ({failed} failed)", { total, failed: failedRows }) : total;
}

/**
 * One configured input length. An exact multiple of 1024 reads as K so a list of
 * them stays short; any other value keeps its digits rather than being rounded
 * into a size the run was never measured at.
 */
export function formatPromptLength(value: number): string {
  return value % 1024 === 0 ? `${value / 1024}K` : String(value);
}

/**
 * Every input length a result was configured with, compactly (512 · 4K · 8K).
 * This is the workload's own list of prompt lengths, never the total context the
 * server allocated, so an unreported list stays unreported instead of borrowing
 * a number that measures something else.
 */
export function formatPromptLengths(values: readonly number[] | null | undefined): string | null {
  if (!Array.isArray(values)) return null;
  const lengths = [...new Set(values.filter((value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b);
  return lengths.length === 0 ? null : lengths.map(formatPromptLength).join(" · ");
}

/** Binary scale, or null when the value is small enough that bytes are the readable unit. */
function scaleBytes(value: number): string | null {
  if (value < 1024) return null;
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"] as const;
  let scaled = value / 1024;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  return `${scaled.toFixed(scaled < 10 ? 2 : 1)} ${units[unitIndex]}`;
}

function groupDigits(value: number): string {
  const text = String(value);
  const [whole, fraction] = text.split(".");
  const grouped = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** The same scale without the exact byte count, for a table cell that has to stay narrow. */
export function formatCompactBytes(value: unknown, t: Translator = benchmarkFallback): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return EXPLORER_MISSING;
  return scaleBytes(value) ?? t("benchmark.{value} bytes", { value: groupDigits(value) });
}

/** One labeled fact. The label travels with the value so neither reads as the other. */
export interface SummaryFact {
  key: string;
  label: string;
  value: string;
}

/**
 * The reported measurement environment, as labeled facts rather than one run-on
 * line. Each part names what it is, so an operating system is never mistaken for
 * a backend and a missing part leaves no ambiguous gap between two separators.
 * Only reported parts are listed: an unreported one is absent here and named on
 * the result page, where there is room to say so.
 */
export function environmentFacts(setup: (BenchmarkSetup & { ram_bytes?: number | null }) | undefined, t: Translator = benchmarkFallback): SummaryFact[] {
  if (!setup) return [];
  const runtime = [setup.runtime, setup.runtime_version].filter(Boolean).join(" ");
  const facts: SummaryFact[] = [];
  if (setup.gpus && setup.gpus.length > 0) {
    facts.push({ key: "gpu", label: t("benchmark.GPU"), value: setup.gpus.join(", ") });
  }
  if (setup.cpu) {
    facts.push({ key: "cpu", label: t("benchmark.CPU"), value: setup.cpu });
  }
  if (setup.ram_bytes != null && setup.ram_bytes > 0) {
    facts.push({ key: "ram", label: t("benchmark.RAM"), value: formatCompactBytes(setup.ram_bytes, t) });
  }
  facts.push(
    { key: "os", label: t("benchmark.OS"), value: setup.os ?? "" },
    { key: "runtime", label: t("benchmark.Runtime"), value: runtime },
    { key: "backend", label: t("benchmark.Backend"), value: setup.backend ?? "" },
    { key: "vram", label: t("benchmark.VRAM"), value: setup.vram_mb == null ? "" : formatVramGb(setup.vram_mb, t) },
    { key: "cores", label: t("benchmark.Logical cores"), value: setup.cores == null ? "" : String(setup.cores) },
  );
  return facts.filter((fact) => fact.value !== "");
}

/**
 * Comparison cells for the measurement environment. Unlike the compact list
 * facts, these name every gap as unknown so two columns with different gaps
 * do not look identical, and each cell keeps its label in the row header
 * rather than inside the value.
 */
export function formatComparisonOs(setup: BenchmarkSetup | undefined, t: Translator = benchmarkFallback): string {
  const parts = [setup?.os, setup?.arch].filter((part): part is string => typeof part === "string" && part !== "");
  return parts.length > 0 ? parts.join(" · ") : t("benchmark.Unknown");
}

/** Reported CPU and its logical core count, or unknown when neither was recorded. */
export function formatComparisonCpu(setup: (BenchmarkSetup & { ram_bytes?: number | null }) | undefined, t: Translator = benchmarkFallback): string {
  const parts: string[] = [];
  if (typeof setup?.cpu === "string" && setup.cpu !== "") parts.push(setup.cpu);
  if (setup?.cores != null) parts.push(`${t("benchmark.Logical cores")}: ${setup.cores}`);
  if (setup?.ram_bytes != null) parts.push(`${t("benchmark.System RAM")}: ${formatCompactBytes(setup.ram_bytes, t)}`);
  return parts.length > 0 ? parts.join(" · ") : t("benchmark.Unknown");
}

/** Runtime name and version with its backend, or unknown when none was recorded. */
export function formatComparisonRuntime(setup: BenchmarkSetup | undefined, t: Translator = benchmarkFallback): string {
  const runtime = [setup?.runtime, setup?.runtime_version].filter((part): part is string => typeof part === "string" && part !== "").join(" ");
  const parts = [runtime, setup?.backend].filter((part): part is string => typeof part === "string" && part !== "");
  return parts.length > 0 ? parts.join(" · ") : t("benchmark.Unknown");
}

/** Selected GPU memory as published, or unknown when it was not recorded. */
export function formatComparisonVram(setup: BenchmarkSetup | undefined, t: Translator = benchmarkFallback): string {
  return setup?.vram_mb == null ? t("benchmark.Unknown") : formatVramGb(setup.vram_mb, t);
}

/**
 * Essential execution settings: parallel requests, threads and the KV cache
 * types. Each part keeps its label so a bare number is never mistaken for
 * another setting, and an unreported setup reads as unknown.
 */
export function formatComparisonExecution(setup: BenchmarkSetup | undefined, t: Translator = benchmarkFallback): string {
  const parts: string[] = [];
  if (setup?.parallel != null) parts.push(`${t("benchmark.Parallel requests")}: ${setup.parallel}`);
  if (setup?.threads != null) parts.push(`${t("benchmark.Threads")}: ${setup.threads}`);
  if (setup?.cache_type_k || setup?.cache_type_v) {
    parts.push(`${t("benchmark.KV cache type")} K: ${setup.cache_type_k || t("benchmark.Unknown")}, V: ${setup.cache_type_v || t("benchmark.Unknown")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : t("benchmark.Unknown");
}

import type React from "react";
import { formatRuntimeVersionLabel } from "@aiolm/benchmark-contracts";
import { formatGpuLabels } from "@/lib/gpu-labels";
import type { Translator } from "@/i18n/types";
import type { BenchmarkSetup } from "@/lib/benchmark-discovery";
import type { ServingMetricKey, ServingMetricStat } from "@/lib/benchmark-points";
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

/** VRAM uses the same binary size scale as model and process memory. */
export function formatVramGb(vramMb: unknown, t: Translator = benchmarkFallback): string {
  if (typeof vramMb !== "number" || !Number.isFinite(vramMb) || vramMb < 0) return t("benchmark.Unknown");
  return formatCompactBytes(vramMb * 1024 * 1024, t);
}

/** Measurement rows behind a result, calling out failed rows so a partial run is not read as a clean one. */
export function formatSampleCount(rowCount: number, failedRows: number, t: Translator = benchmarkFallback): string {
  if (!Number.isFinite(rowCount)) return EXPLORER_MISSING;
  const total = String(rowCount);
  return Number.isFinite(failedRows) && failedRows > 0 ? t("benchmark.{total} ({failed} failed)", { total, failed: failedRows }) : total;
}

/** One operating point: input bytes, requests in flight and the requested output cap. */
export function formatServingPointLabel(inputBytes: number, concurrency: number, maxTokens: number): string {
  return `${inputBytes} B / c${concurrency} / max ${maxTokens} tok`;
}
export function formatServingMetric(key: ServingMetricKey, value: number | null | undefined, t: Translator = benchmarkFallback): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return t("benchmark.Unknown");
  if (key === "peak_memory_bytes") return formatCompactBytes(value, t);
  if (key.endsWith("_ms")) return `${formatLatency(value)} ms`;
  if (key === "output_bytes_per_second") return `${formatThroughput(value)} B/s`;
  return `${formatThroughput(value)} tok/s`;
}

/**
 * The range the median came from. A point whose repetitions all landed on the
 * same value has no spread to report, and neither does a single sample, so the
 * line is left off rather than printed as a range of one number.
 */
function spread(stat: ServingMetricStat | null | undefined, format: (value: number) => string): string | null {
  if (!stat || stat.min === stat.max) return null;
  return `${format(stat.min)}–${format(stat.max)}`;
}

export function formatThroughputSpread(stat: ServingMetricStat | null | undefined): string | null {
  return spread(stat, (value) => formatThroughput(value));
}

export function formatLatency(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : EXPLORER_MISSING;
}

export function formatLatencySpread(stat: ServingMetricStat | null | undefined): string | null {
  return spread(stat, formatLatency);
}

export function formatSecondsSpread(stat: ServingMetricStat | null | undefined): string | null {
  return spread(stat, (value) => formatDuration(value));
}

const BINARY_SCALE_UNITS = ["KiB", "MiB", "GiB", "TiB", "PiB"] as const;
const BINARY_SCALE_DECIMALS = [1, 1, 2, 2, 2] as const;

/** Binary scale, or null when the value is small enough that bytes are the readable unit. */
function scaleBytes(value: number): string | null {
  if (value < 1024) return null;
  let scaled = value / 1024;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < BINARY_SCALE_UNITS.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  return `${scaled.toFixed(BINARY_SCALE_DECIMALS[unitIndex])} ${BINARY_SCALE_UNITS[unitIndex]}`;
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
  return scaleBytes(value) ?? t("benchmark.{value} B", {value: groupDigits(Math.round(value))});
}

/**
 * `8 Core / 16 Thread`, or `16 Thread` alone when the physical core count was
 * not detected. Hardware detection only reports logical processors on some
 * platforms, and calling those "cores" overstates the machine, so the physical
 * half is omitted rather than guessed.
 */
export function formatCpuCores(cpu: { logical_cores: number; physical_cores?: number | null }): string {
  const threads = `${cpu.logical_cores} Thread`;
  const physical = cpu.physical_cores;
  return typeof physical === "number" && Number.isFinite(physical) && physical > 0
    ? `${physical} Core / ${threads}`
    : threads;
}

/**
 * `version(build)` through the shared contracts formatter, e.g. `0.3.0-dev(10638)`.
 * The runtime name is always passed so only llama.cpp records get llama.cpp
 * parsing; null when neither a version nor a build was recorded. Inputs are
 * unverified, so anything that is not text (or a numeric build) reads as absent.
 */
export function runtimeVersionLabel(runtime: { name?: unknown; version?: unknown; build?: unknown; variant?: unknown; plugin_version?: unknown } | null | undefined): string | null {
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  const build = runtime?.build;
  return formatRuntimeVersionLabel({
    name: text(runtime?.name),
    version: text(runtime?.version),
    build: typeof build === "number" || typeof build === "string" ? build : null,
    variant: text(runtime?.variant),
    plugin_version: text(runtime?.plugin_version),
  });
}

/** One labeled fact. The label travels with the value so neither reads as the other. */
export interface SummaryFact {
  key: string;
  label: string;
  value: React.ReactNode;
}

/** Extracts the list of individual GPUs from a summary and its setup, aggregating identical devices with count x N. */
export function extractGpuList(summary: { hardware_label: string; setup?: { gpus?: string[] | null } }): string[] {
  let raw: string[] = [];
  if (Array.isArray(summary.setup?.gpus) && summary.setup.gpus.length === 0) {
    raw = [];
  } else if (summary.hardware_label && summary.hardware_label.includes(" + ")) {
    raw = summary.hardware_label.split(" + ").map((s) => s.trim()).filter(Boolean);
  } else if (summary.hardware_label && summary.hardware_label !== "cpu" && summary.hardware_label !== "unknown" && !summary.hardware_label.startsWith("Host CPU: ")) {
    raw = [summary.hardware_label.trim()];
  } else if (Array.isArray(summary.setup?.gpus)) {
    raw = summary.setup.gpus;
  }
  return formatGpuLabels(raw);
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

/** Reported CPU and its core/thread topology, or unknown when neither was recorded. */
export function formatComparisonCpu(setup: (BenchmarkSetup & { ram_bytes?: number | null; physical_cores?: number | null }) | undefined, t: Translator = benchmarkFallback): string {
  const parts: string[] = [];
  if (typeof setup?.cpu === "string" && setup.cpu !== "") parts.push(setup.cpu);
  if (setup?.cores != null) {
    parts.push(formatCpuCores({ logical_cores: setup.cores, physical_cores: setup.physical_cores }));
  }
  if (setup?.ram_bytes != null) parts.push(`${t("benchmark.System RAM")}: ${formatCompactBytes(setup.ram_bytes, t)}`);
  return parts.length > 0 ? parts.join(" · ") : t("benchmark.Unknown");
}

/** Selected GPU memory as published, or unknown when it was not recorded. */
export function formatComparisonVram(setup: BenchmarkSetup | undefined, t: Translator = benchmarkFallback): string {
  return setup?.vram_mb == null ? t("benchmark.Unknown") : formatVramGb(setup.vram_mb, t);
}

const CORPUS_KEYS: Record<string, string> = {
  code_python: "benchmark.corpus.code_python",
  code_mixed: "benchmark.corpus.code_mixed",
  novel_ko: "benchmark.corpus.novel_ko",
  novel_en: "benchmark.corpus.novel_en",
  novel_ja: "benchmark.corpus.novel_ja",
};

/** Formats workload corpus to a user-friendly name while retaining original identifier. */
export function formatWorkloadName(workload: string | null | undefined, t: Translator = benchmarkFallback): string {
  if (!workload) return t("benchmark.Unknown");
  const key = CORPUS_KEYS[workload];
  if (key) {
    return `${t(key)} (${workload})`;
  }
  return workload;
}

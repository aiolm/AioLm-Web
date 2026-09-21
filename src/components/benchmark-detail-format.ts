import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";
/**
 * Value formatting for one published benchmark. Absent data reads as "Unknown",
 * an empty list as "None reported", a missing measurement as a gap, and a
 * structured value as its JSON - never as a zero, never as "[object Object]".
 */

import { EXPLORER_MISSING, formatCompactBytes, formatVramGb } from "./benchmark-explorer-format";

/** The same gap glyph the explorer uses, so a missing value reads alike on both pages. */
export const DETAIL_MISSING = EXPLORER_MISSING;

/** Structured values are shown as bounded JSON so an object never renders as "[object Object]". */
const STRUCTURED_MAX_CHARS = 120;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Setup display: explicit Unknown instead of blank or machine defaults. */
export function displayText(value: unknown, t: Translator = benchmarkFallback): string {
  if (value === null || value === undefined) return t("benchmark.Unknown");
  if (typeof value === "string") return value.trim() === "" ? t("benchmark.Unknown") : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : t("benchmark.Unknown");
  if (typeof value === "boolean") return value ? t("benchmark.Yes") : t("benchmark.No");
  return structuredText(value);
}

/** A reported list. Not a list at all and an empty list are different facts. */
export function joinList(values: unknown, t: Translator = benchmarkFallback): string {
  if (!Array.isArray(values)) return t("benchmark.Unknown");
  if (values.length === 0) return t("benchmark.None reported");
  return values.map((v) => displayText(v, t)).join(", ");
}

/**
 * One graphics device, with every member the contract publishes for it
 * (`$defs/gpu`). Each part names itself because any of them can be null: an
 * unreported driver reads "Driver: Unknown" instead of borrowing a neighbouring
 * value, and `integrated: false` reads "No", which an unreported one does not.
 */
export function describeGpu(value: unknown, t: Translator = benchmarkFallback): string {
  const gpu = asRecord(value);
  if (!gpu) return t("benchmark.Unknown device");
  return [
    `${t("benchmark.Name")}: ${displayText(gpu["name"], t)}`,
    `${t("benchmark.Vendor")}: ${displayText(gpu["vendor"], t)}`,
    `${t("benchmark.VRAM")}: ${formatVramGb(gpu["vram_mb"], t)}`,
    `${t("benchmark.Driver")}: ${displayText(gpu["driver"], t)}`,
    `${t("benchmark.Integrated")}: ${displayText(gpu["integrated"], t)}`,
  ].join(" · ");
}

export interface ReportedDevice {
  name: string;
  facts: { label: string; value: string }[];
}

/** Structured device facts keep model names and driver strings intact. Identical devices aggregated with count x N. */
export function describeGpuDetails(value: unknown, t: Translator = benchmarkFallback): ReportedDevice[] {
  if (!Array.isArray(value)) return [];
  const entries = value.map(asRecord).filter((d): d is Record<string, unknown> => d !== null);
  const groups: { device: Record<string, unknown>; count: number }[] = [];
  for (const entry of entries) {
    const key = [
      entry["name"] ?? "",
      entry["vendor"] ?? "",
      entry["vram_mb"] ?? "",
      entry["driver"] ?? "",
      entry["integrated"] ?? "",
    ].join("|");
    const existing = groups.find((g) => {
      const gKey = [
        g.device["name"] ?? "",
        g.device["vendor"] ?? "",
        g.device["vram_mb"] ?? "",
        g.device["driver"] ?? "",
        g.device["integrated"] ?? "",
      ].join("|");
      return gKey === key;
    });
    if (existing) {
      existing.count += 1;
    } else {
      groups.push({ device: entry, count: 1 });
    }
  }
  return groups.map(({ device, count }) => {
    const baseName = displayText(device["name"], t);
    const name = count > 1 ? `${baseName} x ${count}` : baseName;
    return {
      name,
      facts: [
        { label: t("benchmark.Vendor"), value: displayText(device["vendor"], t) },
        { label: t("benchmark.VRAM"), value: formatVramGb(device["vram_mb"], t) },
        { label: t("benchmark.Driver"), value: displayText(device["driver"], t) },
        { label: t("benchmark.Integrated"), value: displayText(device["integrated"], t) },
      ],
    };
  });
}

/** One description per distinct device type. Identical GPUs aggregated with count x N. */
export function describeGpuList(value: unknown, t: Translator = benchmarkFallback): string | string[] {
  if (!Array.isArray(value)) return t("benchmark.Unknown");
  if (value.length === 0) return t("benchmark.None reported");
  const details = describeGpuDetails(value, t);
  if (details.length === 0) return t("benchmark.Unknown device");
  return details.map((d) => {
    return [
      `${t("benchmark.Name")}: ${d.name}`,
      ...d.facts.map((f) => `${f.label}: ${f.value}`),
    ].join(" · ");
  });
}

/**
 * The published launch options (`execution.effective_args`), one line per
 * option so the block reads as a command and can be copied into a local setup.
 * An option keeps the value it was given: a following token that does not begin
 * another option is that option's value, which also keeps a negative number
 * such as `--sleep-idle-seconds -1` on its own option's line.
 *
 * Not reported and reported-as-empty are different facts, so an absent list
 * reads Unknown and an empty one reads as none reported.
 */
export function describeArguments(value: unknown, t: Translator = benchmarkFallback): string | string[] {
  if (!Array.isArray(value)) return t("benchmark.Unknown");
  const tokens = value.filter((token): token is string => typeof token === "string" && token !== "");
  if (tokens.length === 0) return t("benchmark.None reported");
  const isOption = (token: string) => /^--?[a-zA-Z]/.test(token);
  const lines: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const argument = isOption(tokens[index]!) && index + 1 < tokens.length && !isOption(tokens[index + 1]!)
      ? tokens[index + 1] : undefined;
    lines.push(argument === undefined ? tokens[index]! : `${tokens[index]} ${argument}`);
    if (argument !== undefined) index += 1;
  }
  return lines;
}

/** The native vram_mb field records binary mebibytes; preserve the reported count. */
export function formatMegabytes(value: unknown, t: Translator = benchmarkFallback): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return displayText(value, t);
  return formatCompactBytes(value * 1024 * 1024, t);
}

/** A human-scale unit with the published number kept alongside it. */
export function formatByteSize(value: unknown, t: Translator = benchmarkFallback): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return displayText(value, t);
  const exact = `${groupDigits(Math.round(value))} B`;
  const scaled = scaleBytes(value);
  return scaled === null ? exact : `${scaled} (${exact})`;
}

export { formatCompactBytes, formatVramGb } from "./benchmark-explorer-format";

/** Seconds formatted to two decimal places (input in milliseconds). */
export function formatSeconds(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? (value / 1000).toFixed(2) : DETAIL_MISSING;
}

/** One decimal: sub-millisecond per-token times are normal and rounding erases them. */
export function formatMilliseconds(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : DETAIL_MISSING;
}

/** Whole counts (tokens, repetitions, slots). A non-number is a gap, not a zero. */
export function formatCount(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? groupDigits(value) : DETAIL_MISSING;
}

/** A value with no column contract behind it: readable, bounded, never "[object Object]". */
export function formatCellValue(value: unknown, t: Translator = benchmarkFallback): string {
  if (value === null || value === undefined) return DETAIL_MISSING;
  if (typeof value === "string") return value.trim() === "" ? DETAIL_MISSING : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : DETAIL_MISSING;
  if (typeof value === "boolean") return value ? t("benchmark.Yes") : t("benchmark.No");
  return structuredText(value);
}

/**
 * Tone for the shared `.status` pill: only a completed run earns ok, a failed
 * run is bad, and partial or cancelled stay neutral rather than borrow either.
 */
export function statusTone(status: unknown): "ok" | "bad" | "" {
  if (status === "complete") return "ok";
  if (status === "failed") return "bad";
  return "";
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

function structuredText(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof json !== "string") return DETAIL_MISSING;
  return json.length > STRUCTURED_MAX_CHARS ? `${json.slice(0, STRUCTURED_MAX_CHARS - 1)}…` : json;
}

/** Locale independent digit grouping, so a shared link reads the same everywhere. */
function groupDigits(value: number): string {
  const text = String(value);
  const [whole, fraction] = text.split(".");
  const grouped = (whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import { findPoint, pointMedian, type PointMetric } from "./benchmark-points";
import type { BenchmarkSummary } from "./summary";

export interface BenchmarkSetup {
  os: string | null; arch: string | null; cpu: string | null; cores: number | null;
  /** Physical CPU cores, when measured. `cores` remains the legacy logical thread count. */
  physical_cores?: number | null;
  /** OS-reported system RAM captured with this run, separate from GPU memory. */
  ram_bytes?: number | null;
  vendors: string[]; gpus: string[]; vram_mb: number | null;
  runtime: string | null; runtime_version: string | null; backend: string | null; mode: string | null;
  /** Raw runtime allocation exactly as submitted; a server-side total, not an input length. */
  context_size: number | null; parallel: number | null; threads: number | null; gpu_layers: number | null;
  flash_attention: string | null; cache_type_k: string | null; cache_type_v: string | null; split_mode: string | null;
  /** Largest configured input length. Absent on summaries stored before migration 009; null when unrecorded. */
  prompt_length?: number | null;
}

/**
 * Configured input lengths, ascending and deduplicated. The contract records
 * them as whole token counts of at least one, so anything else carries no usable
 * length and is dropped. Nothing is substituted from the runtime allocation, so a
 * workload without usable lengths stays empty rather than reporting an invented one.
 *
 * These are what the run was configured to send, not proof that it got there: a
 * partial or cancelled run may never have reached its longest input.
 */
export function normalizePromptLengths(values: readonly number[] | null | undefined): number[] {
  return [...new Set((values ?? []).filter((v) => typeof v === "number" && Number.isSafeInteger(v) && v > 0))].sort((a, b) => a - b);
}

/** Largest configured input length, or null when the workload records none. */
export function largestPromptLength(values: readonly number[] | null | undefined): number | null {
  return normalizePromptLengths(values).at(-1) ?? null;
}
export const TEXT_FILTER_KEYS = ["q", "model", "publisher", "quantization", "base_model", "hardware", "vendor", "gpu", "cpu", "os", "arch", "runtime", "backend", "mode", "method", "workload", "flash_attention", "cache_type_k", "cache_type_v", "split_mode"] as const;
export type TextFilterKey = typeof TEXT_FILTER_KEYS[number];
/**
 * Model metadata q searches beyond the dedicated publisher/quantization/base_model
 * filters: the precise identifiers a reader would paste in to find one exact
 * artifact. format and source are descriptors shared by every described run, so
 * they stay out of the global search rather than matching everything.
 */
export const MODEL_INFO_SEARCH_KEYS = ["name", "architecture", "size_label", "quantized_by", "repository", "artifact", "sha256"] as const;
/** Suggestion fields. "point" is not a text filter: it expands the measured operating points. */
export const POINT_OPTION_FIELD = "point";
export type OptionField = Exclude<TextFilterKey, "q"> | typeof POINT_OPTION_FIELD;
export const RANGE_FILTER_KEYS = ["context", "vram", "cores", "parallel", "threads", "gpu_layers"] as const;
export type RangeFilterKey = typeof RANGE_FILTER_KEYS[number];
export const SORT_VALUES = ["newest", "oldest", "context_asc", "context_desc", "vram_asc", "vram_desc", "throughput_desc", "duration_asc"] as const;
export type BenchmarkSort = typeof SORT_VALUES[number];
/**
 * The two sorts that rank measured speed. They read one operating point, so
 * they require one to be named: ranking on a value averaged across input
 * lengths and concurrencies would put whoever configured the narrowest grid on
 * top, which is what the point selection exists to stop.
 */
const POINT_SORT_METRICS: Partial<Record<BenchmarkSort, PointMetric>> = { throughput_desc: "tg_tps", duration_asc: "e2e_ms" };
/**
 * The operating point a list is read at. It is display and ranking basis, not a
 * filter, unless point_only is set: without it a result that never measured the
 * point keeps its place in the list and reports the point as missing.
 */
export interface BenchmarkPointSelection {
  point_tokens?: number;
  point_concurrency?: number;
  point_only?: boolean;
}
export type BenchmarkFilters = Partial<Record<TextFilterKey, string>> & Partial<Record<`${RangeFilterKey}_${"min" | "max"}`, number>> & BenchmarkPointSelection & { sort?: BenchmarkSort };
export interface BenchmarkOptions { options: Array<{ value: string; count: number }>; has_more: boolean }
export class DiscoveryQueryError extends Error {}
export function parseFilters(search: URLSearchParams): BenchmarkFilters {
  const out: BenchmarkFilters = {};
  for (const key of TEXT_FILTER_KEYS) {
    const value = search.get(key)?.trim();
    if (value && value.length > 120) throw new DiscoveryQueryError(`${key} must be at most 120 characters.`);
    if (value) out[key] = value;
  }
  for (const key of RANGE_FILTER_KEYS) {
    for (const bound of ["min", "max"] as const) {
      const name = `${key}_${bound}` as const;
      const raw = search.get(name);
      if (raw === null || raw === "") continue;
      const value = Number(raw);
      if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(value) || value < (key === "gpu_layers" ? -1 : 0)) throw new DiscoveryQueryError(`${name} must be a valid integer.`);
      out[name] = value;
    }
    if (out[`${key}_min`] !== undefined && out[`${key}_max`] !== undefined && out[`${key}_min`]! > out[`${key}_max`]!) throw new DiscoveryQueryError(`${key} minimum must not exceed maximum.`);
  }
  Object.assign(out, parseBasisPoint(search));
  const sort = search.get("sort");
  if (sort && !SORT_VALUES.includes(sort as BenchmarkSort)) throw new DiscoveryQueryError("Invalid sort.");
  if (sort && sort !== "newest") out.sort = sort as BenchmarkSort;
  if (out.sort && POINT_SORT_METRICS[out.sort] && out.point_tokens === undefined) {
    throw new DiscoveryQueryError("This sort reads one operating point; give point_tokens and point_concurrency.");
  }
  return out;
}
/**
 * The named operating point. Both halves name one point together, so one
 * without the other is rejected rather than silently read as "any concurrency",
 * which would rank a single-stream result against a batched one.
 */
function parseBasisPoint(search: URLSearchParams): BenchmarkPointSelection {
  const out: BenchmarkPointSelection = {};
  for (const name of ["point_tokens", "point_concurrency"] as const) {
    const raw = search.get(name);
    if (raw === null || raw === "") continue;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) throw new DiscoveryQueryError(`${name} must be a whole number of at least 1.`);
    out[name] = value;
  }
  if ((out.point_tokens === undefined) !== (out.point_concurrency === undefined)) {
    throw new DiscoveryQueryError("point_tokens and point_concurrency name one point together.");
  }
  const only = search.get("point_only");
  if (only !== null && only !== "" && only !== "0" && only !== "1") throw new DiscoveryQueryError("point_only must be 0 or 1.");
  if (only === "1") {
    if (out.point_tokens === undefined) throw new DiscoveryQueryError("point_only requires point_tokens and point_concurrency.");
    out.point_only = true;
  }
  return out;
}
export function parseOptionsQuery(search: URLSearchParams): { field: OptionField; query: string; filters: BenchmarkFilters } {
  const field = search.get("field") as OptionField;
  if (field !== POINT_OPTION_FIELD && (!TEXT_FILTER_KEYS.includes(field as TextFilterKey) || (field as string) === "q")) throw new DiscoveryQueryError("Invalid option field.");
  const query = search.get("option_query")?.trim() ?? "";
  if (query.length > 120) throw new DiscoveryQueryError("option_query must be at most 120 characters.");
  const filters = parseFilters(search);
  // The field being edited is excluded from its own constraints, so the point
  // suggestions list every point the other filters still allow rather than only
  // the one already selected.
  if (field === POINT_OPTION_FIELD) {
    delete filters.point_tokens;
    delete filters.point_concurrency;
    delete filters.point_only;
  } else {
    delete filters[field];
  }
  return { field, query, filters };
}
export function selectedExecutionGpus(b: PublicBenchmarkSubmission) {
  return b.environment?.execution.mode === "cpu" ? [] : b.environment?.execution.selected_gpus ?? [];
}
export function normalizeSetup(b: PublicBenchmarkSubmission): BenchmarkSetup {
  const env = b.environment;
  const devices = selectedExecutionGpus(b);
  const settings = b.execution.settings;
  const strings = (values: Array<string | null>) => [...new Set(values.filter((v): v is string => !!v))];
  return {
    os: env?.os ?? null, arch: env?.arch ?? null, cpu: env?.cpu.name ?? null, cores: env?.cpu.logical_cores ?? null,
    physical_cores: env?.cpu.physical_cores ?? null,
    ram_bytes: env?.system_memory_bytes ?? null,
    vendors: strings(devices.map(g => g.vendor)), gpus: strings(devices.map(g => g.name)),
    vram_mb: devices.length > 0 && env?.execution.selection_complete && devices.every(g => g.vram_mb !== null) ? devices.reduce((sum, g) => sum + g.vram_mb!, 0) : null,
    runtime: b.runtime.name, runtime_version: b.runtime.version, backend: b.runtime.backend, mode: env?.execution.mode ?? null,
    context_size: b.execution.context_size, parallel: b.execution.parallel, threads: settings?.threads ?? null, gpu_layers: settings?.gpu_layers ?? null,
    prompt_length: largestPromptLength(b.workload?.prompt_lengths),
    flash_attention: settings?.flash_attention ?? null, cache_type_k: settings?.cache_type_k ?? null, cache_type_v: settings?.cache_type_v ?? null, split_mode: settings?.split_mode ?? null,
  };
}
export function textValues(summary: BenchmarkSummary, field: TextFilterKey): string[] {
  // Stored summaries are written by the application helper, but a corrupted or
  // hand-edited row must never crash matching: only strings are searchable, so
  // a boolean, number, or nested object in model metadata reads as unknown.
  const infoString = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
  if (field === "q") return [...new Set(TEXT_FILTER_KEYS.filter(k => k !== "q").flatMap(k => textValues(summary, k)).concat(summary.setup?.runtime_version ?? [], summary.status, MODEL_INFO_SEARCH_KEYS.map(k => infoString(summary.model_info?.[k])).filter((v): v is string => v !== null)))];
  if (["model", "hardware", "method", "workload"].includes(field)) return [summary[`${field}_label` as "model_label"]];
  if (field === "base_model") {
    const values = summary.model_info?.base_models;
    return Array.isArray(values) ? values.filter((v): v is string => typeof v === "string" && !!v) : [];
  }
  if (field === "publisher" || field === "quantization") { const value = infoString(summary.model_info?.[field]); return value ? [value] : []; }
  const value = field === "vendor" ? summary.setup?.vendors : field === "gpu" ? summary.setup?.gpus : summary.setup?.[field as "os"];
  return Array.isArray(value) ? value : value ? [value] : [];
}
// "context" ranges describe the largest configured input length, never the raw runtime allocation.
export function numericValue(summary: BenchmarkSummary, field: RangeFilterKey): number | null {
  return summary.setup?.[field === "context" ? "prompt_length" : field === "vram" ? "vram_mb" : field] ?? null;
}
/** The selected point on this result, or null when it never measured that point. */
export function selectedPoint(summary: BenchmarkSummary, filters: BenchmarkFilters) {
  if (filters.point_tokens === undefined || filters.point_concurrency === undefined) return null;
  return findPoint(summary.points, filters.point_tokens, filters.point_concurrency);
}
export function matchesFilters(summary: BenchmarkSummary, filters: BenchmarkFilters): boolean {
  return TEXT_FILTER_KEYS.every(k => !filters[k] || textValues(summary, k).some(v => v.toLowerCase().includes(filters[k]!.toLowerCase()))) && RANGE_FILTER_KEYS.every(k => {
    const value = numericValue(summary, k), min = filters[`${k}_min`], max = filters[`${k}_max`];
    return (min === undefined && max === undefined) || (value !== null && (min === undefined || value >= min) && (max === undefined || value <= max));
  }) && (!filters.point_only || selectedPoint(summary, filters) !== null);
}
/**
 * Ordering value for the current query. The two speed sorts read the median of
 * the selected operating point, never a mean taken across different inputs and
 * concurrencies, and a result that did not measure that point has no value here
 * and sorts last with the rest of the missing metadata.
 */
export function sortValue(summary: BenchmarkSummary, filters: BenchmarkFilters): number | null {
  const sort = filters.sort ?? "newest";
  if (sort.startsWith("context_")) return summary.setup?.prompt_length ?? null;
  if (sort.startsWith("vram_")) return summary.setup?.vram_mb ?? null;
  const metric = POINT_SORT_METRICS[sort];
  return metric ? pointMedian(selectedPoint(summary, filters), metric) : null;
}

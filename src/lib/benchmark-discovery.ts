import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import type { BenchmarkSummary } from "./summary";

export interface BenchmarkSetup {
  os: string | null; arch: string | null; cpu: string | null; cores: number | null;
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
export type OptionField = Exclude<TextFilterKey, "q">;
export const RANGE_FILTER_KEYS = ["context", "vram", "cores", "parallel", "threads", "gpu_layers"] as const;
export type RangeFilterKey = typeof RANGE_FILTER_KEYS[number];
export const SORT_VALUES = ["newest", "oldest", "context_asc", "context_desc", "vram_asc", "vram_desc", "throughput_desc", "duration_asc"] as const;
export type BenchmarkSort = typeof SORT_VALUES[number];
export type BenchmarkFilters = Partial<Record<TextFilterKey, string>> & Partial<Record<`${RangeFilterKey}_${"min" | "max"}`, number>> & { sort?: BenchmarkSort };
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
  const sort = search.get("sort");
  if (sort && !SORT_VALUES.includes(sort as BenchmarkSort)) throw new DiscoveryQueryError("Invalid sort.");
  if (sort && sort !== "newest") out.sort = sort as BenchmarkSort;
  return out;
}
export function parseOptionsQuery(search: URLSearchParams): { field: OptionField; query: string; filters: BenchmarkFilters } {
  const field = search.get("field") as OptionField;
  if (!TEXT_FILTER_KEYS.includes(field) || (field as string) === "q") throw new DiscoveryQueryError("Invalid option field.");
  const query = search.get("option_query")?.trim() ?? "";
  if (query.length > 120) throw new DiscoveryQueryError("option_query must be at most 120 characters.");
  const filters = parseFilters(search);
  delete filters[field];
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
export function matchesFilters(summary: BenchmarkSummary, filters: BenchmarkFilters): boolean {
  return TEXT_FILTER_KEYS.every(k => !filters[k] || textValues(summary, k).some(v => v.toLowerCase().includes(filters[k]!.toLowerCase()))) && RANGE_FILTER_KEYS.every(k => {
    const value = numericValue(summary, k), min = filters[`${k}_min`], max = filters[`${k}_max`];
    return (min === undefined && max === undefined) || (value !== null && (min === undefined || value >= min) && (max === undefined || value <= max));
  });
}
export function sortValue(summary: BenchmarkSummary, sort: BenchmarkSort): number | null {
  if (sort.startsWith("context_")) return summary.setup?.prompt_length ?? null;
  if (sort.startsWith("vram_")) return summary.setup?.vram_mb ?? null;
  if (sort === "throughput_desc") return summary.mean_tg_tps;
  if (sort === "duration_asc") return summary.mean_e2e_ms;
  return null;
}

import { MAX_SERVING_OUTPUT_TOKENS, type BenchmarkCorpus, type PublicBenchmarkSubmission, type RecordedSetting, type ServingExecution } from "@aiolm/benchmark-contracts";
import { findServingPoint, servingPointMedian } from "./benchmark-points";
import type { BenchmarkSummary } from "./summary";
import { isWeightBitValue, weightBits } from "./weight-bits";

/** Installed on the AioLM host, not evidence of execution placement or allocated VRAM. */
export type BenchmarkHostGpu = NonNullable<PublicBenchmarkSubmission["environment"]>["installed_gpus"][number];

export interface BenchmarkSetup {
  os: string | null; arch: string | null; cpu: string | null; cores: number | null;
  physical_cores: number | null; ram_bytes: number | null;
  vendors: string[]; gpus: string[]; vram_mb: number | null;
  /** Null means host environment unavailable; [] is a recorded empty inventory. */
  host_gpus: BenchmarkHostGpu[] | null;
  execution_selection_complete: boolean | null;
  runtime: string | null; runtime_version: string | null; backend: string | null; mode: string | null;
  runtime_build: string | null; runtime_variant: string | null; runtime_plugin_version: string | null;
  max_input_bytes: number; max_concurrency: number; max_output_tokens: number;
  repetitions: number; warmup: false; request_usage: boolean;
  settings: RecordedSetting[];
  /** Bounded canonical recommendation strings, derived once from accepted settings. */
  setting_facets: SettingFacet[];
  inputs: Array<{ bytes: number; sha256: string }>;
  corpus: BenchmarkCorpus; corpus_version: 2; cache_policy: "cold_prompt";
  prompt_nonce: string;
  concurrencies: number[];
  topology: ServingExecution["topology"]; memory_scope: ServingExecution["memory_scope"];
}

/** Browser-safe source of scalar filter names, groups and display labels. */
export const FILTER_DEFINITIONS = {
  q: { kind: "text", group: "model", label: "search" },
  model: { kind: "text", group: "model", label: "model" },
  model_query: { kind: "text", group: "model", label: "modelQuery" },
  publisher: { kind: "text", group: "model", label: "publisher" },
  weight_bits: { kind: "text", group: "model", label: "weightBits" },
  quantization: { kind: "text", group: "model", label: "quantization" },
  base_model: { kind: "text", group: "model", label: "baseModel" },
  model_format: { kind: "text", group: "model", label: "modelFormat" },
  model_sha256: { kind: "text", group: "model", label: "modelSha256" },
  model_repository: { kind: "text", group: "model", label: "modelRepository" },
  model_revision: { kind: "text", group: "model", label: "modelRevision" },
  runtime: { kind: "text", group: "engine", label: "runtime" },
  runtime_version: { kind: "text", group: "engine", label: "runtimeVersion" },
  runtime_variant: { kind: "text", group: "engine", label: "runtimeVariant" },
  runtime_build: { kind: "text", group: "engine", label: "runtimeBuild" },
  runtime_plugin_version: { kind: "text", group: "engine", label: "runtimePluginVersion" },
  app_version: { kind: "text", group: "engine", label: "appVersion" },
  backend: { kind: "text", group: "engine", label: "backend" },
  hardware: { kind: "text", group: "hardware", label: "hardware" },
  vendor: { kind: "text", group: "hardware", label: "vendor" },
  gpu: { kind: "text", group: "hardware", label: "gpu" },
  cpu: { kind: "text", group: "hardware", label: "cpu" },
  os: { kind: "text", group: "hardware", label: "os" },
  arch: { kind: "text", group: "hardware", label: "arch" },
  mode: { kind: "text", group: "hardware", label: "mode" },
  method: { kind: "text", group: "measurement", label: "method" },
  workload: { kind: "text", group: "measurement", label: "workload" },
  input_bytes: { kind: "range", group: "measurement", label: "inputBytes", unit: "bytes" },
  max_output_tokens: { kind: "range", group: "measurement", label: "maxOutputTokens", unit: "tokens" },
  max_concurrency: { kind: "range", group: "measurement", label: "maxConcurrency" },
  model_size: { kind: "range", group: "model", label: "modelSize", unit: "bytes" },
  ram: { kind: "range", group: "hardware", label: "ram", unit: "bytes" },
  physical_cores: { kind: "range", group: "hardware", label: "physicalCores" },
  repetitions: { kind: "range", group: "measurement", label: "repetitions" },
  vram: { kind: "range", group: "hardware", label: "vram", unit: "MiB" },
  cores: { kind: "range", group: "hardware", label: "cores" },
  warmup: { kind: "boolean", group: "measurement", label: "warmup" },
  request_usage: { kind: "boolean", group: "measurement", label: "requestUsage" },
} as const;
type DefinitionKeys<K extends "text" | "range" | "boolean"> = { [P in keyof typeof FILTER_DEFINITIONS]: typeof FILTER_DEFINITIONS[P]["kind"] extends K ? P : never }[keyof typeof FILTER_DEFINITIONS];
export type TextFilterKey = DefinitionKeys<"text">;
export type RangeFilterKey = DefinitionKeys<"range">;
export type BooleanFilterKey = DefinitionKeys<"boolean">;
const definitionKeys = Object.keys(FILTER_DEFINITIONS) as Array<keyof typeof FILTER_DEFINITIONS>;
export const TEXT_FILTER_KEYS = definitionKeys.filter(k => FILTER_DEFINITIONS[k].kind === "text") as TextFilterKey[];
export const RANGE_FILTER_KEYS = definitionKeys.filter(k => FILTER_DEFINITIONS[k].kind === "range") as RangeFilterKey[];
export const BOOLEAN_FILTER_KEYS = definitionKeys.filter(k => FILTER_DEFINITIONS[k].kind === "boolean") as BooleanFilterKey[];
export const TEXT_FILTER_MAX_LENGTH = 120;
export const GLOBAL_SEARCH_FILTER_KEYS = TEXT_FILTER_KEYS.filter(k => k !== "q" && k !== "model_query" && k !== "weight_bits");
export const MODEL_INFO_SEARCH_KEYS = ["name", "architecture", "size_label", "quantized_by", "repository", "revision", "artifact", "sha256"] as const;
export const MODEL_QUERY_INFO_KEYS = ["name", "repository", "revision", "artifact", "sha256"] as const;
export const POINT_OPTION_FIELD = "point";
export type OptionField = Exclude<TextFilterKey, "q"> | "point" | "setting" | "setting_value";
export const SORT_VALUES = ["newest", "oldest", "input_bytes_asc", "input_bytes_desc", "vram_asc", "vram_desc", "token_rate_desc", "output_rate_desc", "duration_asc"] as const;
export type BenchmarkSort = typeof SORT_VALUES[number];
/** Speed sorts are read at one complete operating point, never across a result's grid. */
export const POINT_SORT_VALUES = ["token_rate_desc", "output_rate_desc", "duration_asc"] as const satisfies readonly BenchmarkSort[];
export function isServingOutputInScope(maxOutputTokens: number): boolean {
  return Number.isSafeInteger(maxOutputTokens) && maxOutputTokens >= 1 && maxOutputTokens <= MAX_SERVING_OUTPUT_TOKENS;
}
export interface BenchmarkPointSelection {
  point_bytes?: number; point_concurrency?: number; point_max_tokens?: number; point_only?: boolean;
}
export type SettingDescriptor = Pick<RecordedSetting, "target" | "scope" | "name" | "unit" | "role">;
export type SettingValue = Exclude<RecordedSetting["value"], null>;
export type SettingCondition = SettingDescriptor & ({ op: "eq"; value: SettingValue } | { op: "range"; min?: number; max?: number });
export type BenchmarkFilters = Partial<Record<TextFilterKey, string>> & Partial<Record<`${RangeFilterKey}_${"min" | "max"}`, number>> & Partial<Record<BooleanFilterKey, boolean>> & BenchmarkPointSelection & { sort?: BenchmarkSort; setting?: SettingCondition[] };
export interface BenchmarkOptions { options: Array<{ value: string; count: number }>; has_more: boolean }
export class DiscoveryQueryError extends Error {}
export const SETTING_MAX_BYTES = 1024;
export const SETTING_MAX_CONDITIONS = 8;
export const DISCOVERY_MAX_QUERY_BYTES = 8192;
export const SETTING_UNITS = ["tokens", "bytes", "MiB", "GiB", "threads", "layers", "count", "ratio", "bits", "percent"] as const;
export const SETTING_ROLES = ["context.total_tokens", "context.per_sequence_tokens", "context.per_request_kv_tokens", "concurrency.capacity"] as const;
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;
/** C collation compares UTF-8 code points, not UTF-16 surrogate code units. */
export function compareCanonical(a: string, b: string): number {
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    const ac = a.codePointAt(i)!, bc = b.codePointAt(j)!;
    if (ac !== bc) return ac < bc ? -1 : 1;
    i += ac > 0xffff ? 2 : 1; j += bc > 0xffff ? 2 : 1;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}
function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    if (utf8Bytes(value) > SETTING_MAX_BYTES) throw new DiscoveryQueryError("Setting JSON must be at most 1024 UTF-8 bytes.");
    try { value = JSON.parse(value); } catch { throw new DiscoveryQueryError("Invalid setting JSON."); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DiscoveryQueryError("Setting must be an object.");
  return value as Record<string, unknown>;
}
const descriptorKeys = ["target", "scope", "name", "unit", "role"] as const;
function descriptorObject(v: Record<string, unknown>): SettingDescriptor {
  const identifier = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(s);
  if ((v.target !== "launch" && v.target !== "request") || !Array.isArray(v.scope) || v.scope.length > 8 || !v.scope.every(identifier) || !identifier(v.name) || !(v.unit === null || SETTING_UNITS.includes(v.unit as typeof SETTING_UNITS[number])) || !(v.role === null || SETTING_ROLES.includes(v.role as typeof SETTING_ROLES[number]))) throw new DiscoveryQueryError("Invalid setting descriptor.");
  return { target: v.target, scope: [...v.scope] as string[], name: v.name, unit: v.unit as SettingDescriptor["unit"], role: v.role as SettingDescriptor["role"] };
}
export function parseSettingDescriptor(value: unknown): SettingDescriptor {
  const v = objectInput(value);
  if (Object.keys(v).some(k => !descriptorKeys.includes(k as typeof descriptorKeys[number]))) throw new DiscoveryQueryError("Unknown setting descriptor field.");
  const out = descriptorObject(v);
  if (utf8Bytes(JSON.stringify(out)) > SETTING_MAX_BYTES) throw new DiscoveryQueryError("Setting descriptor is too large.");
  return out;
}
export function isSettingValue(value: unknown): value is SettingValue {
  return typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && [...value].length <= 128 && /^(?!-)[^\\/:@\u0000-\u001f\u007f]+$/.test(value)) || (Array.isArray(value) && value.length <= 64 && value.every(v => typeof v === "number" && Number.isFinite(v)));
}
export function canonicalSettingDescriptor(value: SettingDescriptor): string { return JSON.stringify(descriptorObject(value as unknown as Record<string, unknown>)); }
export function canonicalSettingValue(value: SettingValue): string { return JSON.stringify(value); }
export function parseSettingCondition(value: unknown): SettingCondition {
  const v = objectInput(value), descriptor = descriptorObject(v);
  const allowed: string[] = [...descriptorKeys, "op", ...(v.op === "eq" ? ["value"] : ["min", "max"])];
  if (Object.keys(v).some(k => !allowed.includes(k))) throw new DiscoveryQueryError("Unknown setting condition field.");
  let out: SettingCondition;
  if (v.op === "eq" && isSettingValue(v.value)) out = { ...descriptor, op: "eq", value: v.value };
  else if (v.op === "range" && (v.min !== undefined || v.max !== undefined) && [v.min, v.max].every(n => n === undefined || (typeof n === "number" && Number.isFinite(n))) && !(typeof v.min === "number" && typeof v.max === "number" && v.min > v.max)) out = { ...descriptor, op: "range", ...(v.min !== undefined ? { min: v.min as number } : {}), ...(v.max !== undefined ? { max: v.max as number } : {}) };
  else throw new DiscoveryQueryError("Invalid setting condition value or range.");
  if (utf8Bytes(JSON.stringify(out)) > SETTING_MAX_BYTES) throw new DiscoveryQueryError("Setting JSON must be at most 1024 UTF-8 bytes.");
  return out;
}
export function canonicalSettingCondition(value: SettingCondition): string { return JSON.stringify(parseSettingCondition(value)); }
export function normalizeSettingConditions(values: readonly SettingCondition[]): SettingCondition[] {
  return [...new Set(values.map(canonicalSettingCondition))].sort(compareCanonical).map(v => parseSettingCondition(v));
}
export function settingValueApplicable(descriptor: SettingDescriptor, value: unknown): value is SettingValue {
  try {
    const condition = parseSettingCondition({ ...descriptor, op: "eq", value });
    return new URLSearchParams({ setting: canonicalSettingCondition(condition) }).toString().length <= DISCOVERY_MAX_QUERY_BYTES;
  } catch { return false; }
}
export interface SettingFacet { descriptor: string; value: string | null }
export function normalizeSettingFacets(settings: readonly RecordedSetting[]): SettingFacet[] {
  const facets: SettingFacet[] = [];
  for (const setting of settings.slice(0, 128)) {
    let descriptor: SettingDescriptor;
    try { descriptor = parseSettingDescriptor({ target: setting.target, scope: setting.scope, name: setting.name, unit: setting.unit, role: setting.role }); }
    catch { continue; }
    if (!settingValueApplicable(descriptor, 0)) continue;
    facets.push({ descriptor: canonicalSettingDescriptor(descriptor), value: settingValueApplicable(descriptor, setting.value) ? canonicalSettingValue(setting.value) : null });
  }
  return facets;
}
export function matchesSetting(setting: RecordedSetting, condition: SettingCondition): boolean {
  if (setting.value === null || canonicalSettingDescriptor(setting) !== canonicalSettingDescriptor(condition)) return false;
  if (condition.op === "range") return typeof setting.value === "number" && (condition.min === undefined || setting.value >= condition.min) && (condition.max === undefined || setting.value <= condition.max);
  return canonicalSettingValue(setting.value) === canonicalSettingValue(condition.value);
}
export function parseFilters(search: URLSearchParams): BenchmarkFilters {
  if (search.toString().length > DISCOVERY_MAX_QUERY_BYTES) throw new DiscoveryQueryError("Encoded query must be at most 8192 bytes.");
  const out: BenchmarkFilters = {};
  for (const key of TEXT_FILTER_KEYS) {
    const value = search.get(key)?.trim();
    if (key === "weight_bits" && value && (!isWeightBitValue(Number(value)) || String(Number(value)) !== value)) throw new DiscoveryQueryError("weight_bits must be a supported weight bit count.");
    if (value && [...value].length > TEXT_FILTER_MAX_LENGTH) throw new DiscoveryQueryError(`${key} must be at most ${TEXT_FILTER_MAX_LENGTH} characters.`);
    if (value) out[key] = value;
  }
  for (const key of RANGE_FILTER_KEYS) {
    for (const bound of ["min", "max"] as const) {
      const name = `${key}_${bound}` as const, raw = search.get(name);
      if (raw === null || raw === "") continue;
      const value = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value)) throw new DiscoveryQueryError(`${name} must be a valid integer.`);
      out[name] = value;
    }
    if (out[`${key}_min`] !== undefined && out[`${key}_max`] !== undefined && out[`${key}_min`]! > out[`${key}_max`]!) throw new DiscoveryQueryError(`${key} minimum must not exceed maximum.`);
  }
  for (const key of BOOLEAN_FILTER_KEYS) {
    const raw = search.get(key);
    if (raw === null || raw === "") continue;
    if (raw !== "0" && raw !== "1") throw new DiscoveryQueryError(`${key} must be 0 or 1.`);
    out[key] = raw === "1";
  }
  const settings = search.getAll("setting");
  if (settings.length > SETTING_MAX_CONDITIONS) throw new DiscoveryQueryError("At most 8 setting conditions are allowed.");
  if (settings.length) out.setting = normalizeSettingConditions(settings.map(parseSettingCondition));
  Object.assign(out, parseBasisPoint(search));
  const sort = search.get("sort");
  if (sort && !SORT_VALUES.includes(sort as BenchmarkSort)) throw new DiscoveryQueryError("Invalid sort.");
  if (sort && sort !== "newest") out.sort = sort as BenchmarkSort;
  if ((POINT_SORT_VALUES as readonly string[]).includes(sort ?? "") && out.point_concurrency === undefined) throw new DiscoveryQueryError("This sort requires a complete operating point.");
  return out;
}
function parseBasisPoint(search: URLSearchParams): BenchmarkPointSelection {
  const out: BenchmarkPointSelection = {};
  const names = ["point_bytes", "point_concurrency", "point_max_tokens"] as const;
  for (const name of names) {
    const raw = search.get(name);
    if (raw === null || raw === "") continue;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) throw new DiscoveryQueryError(`${name} must be a positive whole number.`);
    out[name] = value;
  }
  const count = names.filter(name => out[name] !== undefined).length;
  if (count > 0 && count !== names.length) throw new DiscoveryQueryError("Give all operating point coordinates together.");
  if (count && (out.point_bytes! < 256 || out.point_bytes! > 1048576 || out.point_concurrency! > 64 || !isServingOutputInScope(out.point_max_tokens!))) throw new DiscoveryQueryError("Serving operating point is out of bounds.");
  const only = search.get("point_only");
  if (only !== null && only !== "" && only !== "0" && only !== "1") throw new DiscoveryQueryError("point_only must be 0 or 1.");
  if (only === "1") {
    if (!count) throw new DiscoveryQueryError("point_only requires a complete operating point.");
    out.point_only = true;
  }
  return out;
}
export function parseOptionsQuery(search: URLSearchParams): { field: OptionField; query: string; filters: BenchmarkFilters; setting?: SettingDescriptor } {
  const field = search.get("field") as OptionField;
  if (!["point", "setting", "setting_value"].includes(field) && (!TEXT_FILTER_KEYS.includes(field as TextFilterKey) || field === ("q" as string))) throw new DiscoveryQueryError("Invalid option field.");
  const query = search.get("option_query")?.trim() ?? "";
  if ([...query].length > TEXT_FILTER_MAX_LENGTH) throw new DiscoveryQueryError("option_query is too long.");
  const filters = parseFilters(search);
  const rawDescriptor = search.get("option_setting");
  if (field === "setting_value" && rawDescriptor === null) throw new DiscoveryQueryError("setting_value requires option_setting.");
  if (rawDescriptor !== null && field !== "setting_value") throw new DiscoveryQueryError("option_setting is only valid for setting_value.");
  const setting = rawDescriptor === null ? undefined : parseSettingDescriptor(rawDescriptor);
  if (field === POINT_OPTION_FIELD) {
    delete filters.point_bytes; delete filters.point_concurrency; delete filters.point_max_tokens; delete filters.point_only;
  } else if (field !== "setting" && field !== "setting_value") delete filters[field];
  return { field, query, filters, ...(setting ? { setting } : {}) };
}
export function selectedExecutionGpus(b: PublicBenchmarkSubmission) {
  return b.environment?.execution.mode === "cpu" ? [] : b.environment?.execution.selected_gpus ?? [];
}
export function normalizeSetup(b: PublicBenchmarkSubmission): BenchmarkSetup {
  const env = b.environment, devices = selectedExecutionGpus(b);
  const strings = (values: Array<string | null>) => [...new Set(values.filter((v): v is string => !!v))];
  return {
    os: env?.os ?? null, arch: env?.arch ?? null, cpu: env?.cpu.name ?? null, cores: env?.cpu.logical_cores ?? null,
    physical_cores: env?.cpu.physical_cores ?? null, ram_bytes: env?.system_memory_bytes ?? null,
    host_gpus: env?.installed_gpus ?? null, execution_selection_complete: env?.execution.selection_complete ?? null,
    vendors: strings(devices.map(g => g.vendor)), gpus: strings(devices.map(g => g.name)),
    vram_mb: devices.length > 0 && env?.execution.selection_complete && devices.every(g => g.vram_mb !== null) ? devices.reduce((sum, g) => sum + g.vram_mb!, 0) : null,
    runtime: b.runtime.name, runtime_version: b.runtime.version, runtime_build: b.runtime.build, backend: b.runtime.backend,
    runtime_variant: b.runtime.variant, runtime_plugin_version: b.runtime.plugin_version, mode: env?.execution.mode ?? null,
    repetitions: b.workload.repetitions, warmup: b.workload.warmup,
    corpus: b.workload.corpus, corpus_version: b.workload.corpus_version,
    max_input_bytes: Math.max(...b.workload.inputs.map(i => i.bytes)), max_concurrency: Math.max(...b.workload.concurrencies),
    max_output_tokens: b.workload.max_output_tokens, request_usage: b.workload.request_usage, settings: b.execution.settings,
    setting_facets: normalizeSettingFacets(b.execution.settings),
    inputs: b.workload.inputs, cache_policy: b.workload.cache_policy, prompt_nonce: b.workload.prompt_nonce,
    concurrencies: b.workload.concurrencies,
    topology: b.execution.topology, memory_scope: b.execution.memory_scope,
  };
}
export function textValues(summary: BenchmarkSummary, field: TextFilterKey): string[] {
  if (field === "weight_bits") { const bits = weightBits(summary.model_info); return bits === null ? [] : [String(bits)]; }
  const infoString = (value: unknown): string | null => typeof value === "string" && value ? value : null;
  const identity = summary.identity;
  if (field === "q") return [...new Set(GLOBAL_SEARCH_FILTER_KEYS.flatMap(k => textValues(summary, k)).concat(summary.status, MODEL_INFO_SEARCH_KEYS.flatMap(k => infoString(summary.model_info?.[k]) ?? []), (summary.setup.host_gpus ?? []).flatMap(g => [g.name, g.vendor].filter((v): v is string => !!v))))];
  if (field === "model_query") return [...new Set([summary.model_label, ...MODEL_QUERY_INFO_KEYS.map(k => infoString(summary.model_info?.[k])), identity.model_sha256, identity.model_repository, identity.model_revision].filter((v): v is string => typeof v === "string" && !!v))];
  if (["model", "hardware", "method", "workload"].includes(field)) return [summary[`${field}_label` as "model_label"]];
  if (field === "base_model") {
    const values = summary.model_info?.base_models;
    return Array.isArray(values) ? values.filter((v): v is string => typeof v === "string" && !!v) : [];
  }
  if (field === "publisher" || field === "quantization") { const v = infoString(summary.model_info?.[field]); return v ? [v] : []; }
  const identityKey = field === "runtime" ? "engine_name" : field.startsWith("runtime_") ? `engine_${field.slice(8)}` : field;
  if (identityKey in identity) { const v = infoString(identity[identityKey as keyof typeof identity]); return v ? [v] : []; }
  const value = field === "vendor" ? summary.setup.vendors : field === "gpu" ? summary.setup.gpus : summary.setup[field as "os"];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : typeof value === "string" && value ? [value] : [];
}
export function numericValue(summary: BenchmarkSummary, field: RangeFilterKey): number | null {
  if (field === "model_size") return summary.identity.model_size_bytes;
  const key = field === "vram" ? "vram_mb" : field === "ram" ? "ram_bytes" : field === "input_bytes" ? "max_input_bytes" : field;
  return summary.setup[key];
}
export function selectedPoint(summary: BenchmarkSummary, filters: BenchmarkFilters) {
  if (filters.point_bytes === undefined || filters.point_concurrency === undefined || filters.point_max_tokens === undefined) return null;
  return findServingPoint(summary.serving_points, filters.point_bytes, filters.point_concurrency, filters.point_max_tokens);
}
export function matchesFilters(summary: BenchmarkSummary, filters: BenchmarkFilters, workload?: PublicBenchmarkSubmission["workload"]): boolean {
  return TEXT_FILTER_KEYS.every(k => !filters[k] || textValues(summary, k).some(v => k === "weight_bits" ? v === filters[k] : v.toLowerCase().includes(filters[k]!.toLowerCase()))) && RANGE_FILTER_KEYS.every(k => {
    const min = filters[`${k}_min`], max = filters[`${k}_max`];
    if (min === undefined && max === undefined) return true;
    const value = k === "repetitions" && workload ? workload.repetitions : numericValue(summary, k);
    return value !== null && (min === undefined || value >= min) && (max === undefined || value <= max);
  }) && BOOLEAN_FILTER_KEYS.every(k => {
    if (filters[k] === undefined) return true;
    const value = workload ? workload[k] : summary.setup[k];
    return value === filters[k];
  }) && (filters.setting ?? []).every(c => summary.setup.settings.some(s => matchesSetting(s, c))) && (!filters.point_only || selectedPoint(summary, filters) !== null);
}
export function sortValue(summary: BenchmarkSummary, filters: BenchmarkFilters): number | null {
  const sort = filters.sort ?? "newest";
  if (sort.startsWith("input_bytes_")) return summary.setup.max_input_bytes;
  if (sort.startsWith("vram_")) return summary.setup.vram_mb;
  if (!(POINT_SORT_VALUES as readonly string[]).includes(sort)) return null;
  return servingPointMedian(selectedPoint(summary, filters), sort === "token_rate_desc" ? "reported_tokens_per_second" : sort === "output_rate_desc" ? "output_bytes_per_second" : "e2e_ms");
}

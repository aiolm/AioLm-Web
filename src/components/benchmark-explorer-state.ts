/**
 * Explorer state for the public benchmark list: URL-backed filters, bounded
 * keyset paging and an explicit comparison basket.
 *
 * The whole model is a pure reducer so deep links, browser back/forward, filter
 * resets and comparison bounds are verified directly instead of through a DOM.
 */

import { FILTER_DEFINITIONS, TEXT_FILTER_KEYS, TEXT_FILTER_MAX_LENGTH, RANGE_FILTER_KEYS, BOOLEAN_FILTER_KEYS, DEFAULT_MEASUREMENT, DISCOVERY_MAX_QUERY_BYTES, POINT_SORT_VALUES, compareCanonical, isServingOutputInScope, measurementScope, parseFilters, parseOptionsQuery, parseSettingCondition, canonicalSettingCondition, canonicalSettingDescriptor, sortAvailable, type SettingDescriptor, type BenchmarkSetup, type ServingMeasurementScope } from "@/lib/benchmark-discovery";
import { parsePointId, parseServingPointId, type BenchmarkPoint, type ServingBenchmarkPoint } from "@/lib/benchmark-points";
import type { BenchmarkModelInfo } from "./benchmark-model-identity";
import type { BenchmarkIdentity } from "@/lib/summary";

export const EXPLORER_NUMERIC_KEYS = RANGE_FILTER_KEYS.flatMap(key => [`${key}_min`, `${key}_max`] as const);
export const EXPLORER_SORTS = { newest: "Newest first", oldest: "Oldest first", input_bytes_asc: "Input bytes: low to high", input_bytes_desc: "Input bytes: high to low", context_asc: "Input length: low to high", context_desc: "Input length: high to low", vram_asc: "VRAM: low to high", vram_desc: "VRAM: high to low", token_rate_desc: "Output tokens per second at the basis point: fastest first", output_rate_desc: "Observed output: fastest first", throughput_desc: "Decode at the basis point: fastest first", duration_asc: "Duration at the basis point: shortest first" } as const;
export const EXPLORER_POINT_SORTS = POINT_SORT_VALUES;
export const EXPLORER_BASIS_KEYS = ["point_tokens", "point_bytes", "point_concurrency", "point_max_tokens"] as const;
export const EXPLORER_FILTER_KEYS = [...TEXT_FILTER_KEYS, ...EXPLORER_NUMERIC_KEYS, ...BOOLEAN_FILTER_KEYS, ...EXPLORER_BASIS_KEYS, "measurement", "point_only", "sort"] as const;
export type ExplorerFilterKey = (typeof EXPLORER_FILTER_KEYS)[number];
export type ExplorerFilters = Record<ExplorerFilterKey, string> & { setting: string[] };
/** A serving basis names the method scope it was chosen in, so another method's same tuple is never read as it. */
export type ExplorerBasis = { prompt_tokens: number; concurrency: number } | { input_bytes: number; concurrency: number; max_output_tokens: number; scope: ServingMeasurementScope };
export const EXPLORER_FILTER_LABELS: Record<ExplorerFilterKey, string> = Object.fromEntries([
  ...Object.entries(FILTER_DEFINITIONS).flatMap(([key, definition]) => definition.kind === "range"
    ? [[`${key}_min`, definition.label], [`${key}_max`, definition.label]]
    : [[key, definition.label]]),
  ["measurement", "Measurement"], ["sort", "Sort"], ["point_tokens", "Basis input length"], ["point_bytes", "Input UTF-8 bytes"],
  ["point_concurrency", "Basis concurrency"], ["point_max_tokens", "Maximum output token request"], ["point_only", "Only results measured at the basis point"],
]) as Record<ExplorerFilterKey, string>;

export function invalidExplorerRanges(filters: ExplorerFilters): string[] {
  return RANGE_FILTER_KEYS.filter(range => {
    const low = filters[`${range}_min`].trim(), high = filters[`${range}_max`].trim();
    const invalid = (value: string) => value !== "" && (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < (range === "gpu_layers" ? -1 : 0));
    return invalid(low) || invalid(high) || (low !== "" && high !== "" && Number(low) > Number(high));
  });
}
export function invalidExplorerDraft(filters: ExplorerFilters): boolean {
  if (invalidExplorerRanges(filters).length) return true;
  try { parseFilters(new URLSearchParams(buildExplorerSearch({ filters, cursor: null }))); return false; } catch { return true; }
}
export function buildExplorerOptionsPath(field: string, value: string, filters: ExplorerFilters): string {
  const params = new URLSearchParams(buildExplorerSearch({ filters, cursor: null }));
  params.delete(field);
  params.delete("sort");
  params.set("field", field);
  params.set("option_query", value.trim().slice(0, 120));
  return `/v1/benchmark-runs/options?${params}`;
}
export function buildExplorerSettingOptionsPath(field: "setting" | "setting_value", filters: ExplorerFilters, editingIndex: number, descriptor?: SettingDescriptor): string {
  const remaining = { ...filters, setting: filters.setting.filter((_, index) => index !== editingIndex) };
  const params = new URLSearchParams(buildExplorerSearch({ filters: remaining, cursor: null }));
  params.delete("sort");
  params.set("field", field);
  if (descriptor) params.set("option_setting", canonicalSettingDescriptor(descriptor));
  return `/v1/benchmark-runs/options?${params}`;
}
export function buildExplorerPointOptionsPath(filters: ExplorerFilters): string {
  const params = new URLSearchParams(buildExplorerSearch({ filters, cursor: null }));
  for (const key of [...EXPLORER_BASIS_KEYS, "point_only", "sort"]) params.delete(key);
  params.set("field", "point");
  return `/v1/benchmark-runs/options?${params}`;
}

/** The list API accepts at most 120 characters per text filter. */
export const EXPLORER_FILTER_MAX_LENGTH = TEXT_FILTER_MAX_LENGTH;

/** Page size requested from the list API, whose own default is 25 and maximum 100. */
export const EXPLORER_PAGE_SIZE = 25;

/** Bounded keyset back-stack so paging state stays small and predictable. */
export const EXPLORER_HISTORY_LIMIT = 20;

/** Comparison is an explicit pick of a few results, never a ranking of everything. */
export const EXPLORER_COMPARE_LIMIT = 3;

/** Cursors are opaque base64url strings; anything else is treated as absent. */
export const EXPLORER_CURSOR_MAX_LENGTH = 2048;

export const EMPTY_EXPLORER_FILTERS = { ...Object.fromEntries(EXPLORER_FILTER_KEYS.map(key => [key, ""])), setting: [] } as unknown as ExplorerFilters;
function normalizeValue(value: string, key: ExplorerFilterKey): string {
  const trimmed = value.trim();
  // An explicit Common API selection is the same scope as an omitted default.
  return key === "measurement" && trimmed === DEFAULT_MEASUREMENT ? "" : trimmed;
}
function normalizeSettings(settings: string[]): string[] {
  return [...new Set(settings.map(value => { try { return canonicalSettingCondition(parseSettingCondition(value)); } catch { return value; } }))].sort(compareCanonical);
}
export function normalizeExplorerFilters(filters: ExplorerFilters): ExplorerFilters {
  return { ...Object.fromEntries(EXPLORER_FILTER_KEYS.map(key => [key, normalizeValue(filters[key] ?? "", key)])), setting: normalizeSettings(filters.setting ?? []) } as ExplorerFilters;
}
export function sameExplorerFilters(a: ExplorerFilters, b: ExplorerFilters): boolean {
  return EXPLORER_FILTER_KEYS.every(key => a[key] === b[key]) && JSON.stringify(normalizeSettings(a.setting)) === JSON.stringify(normalizeSettings(b.setting));
}
export function basisPointOf(filters: ExplorerFilters): ExplorerBasis | null {
  const scope = measurementScope(filters.measurement);
  if (scope === "legacy") return parsePointId(`${filters.point_tokens}/${filters.point_concurrency}`);
  const point = parseServingPointId(`b${filters.point_bytes}/c${filters.point_concurrency}/o${filters.point_max_tokens}`);
  return point && isServingOutputInScope(point.max_output_tokens, scope) ? { ...point, scope } : null;
}

export function isPointSort(sort: string): boolean {
  return (EXPLORER_POINT_SORTS as readonly string[]).includes(sort);
}

/**
 * A basis point and display order do not narrow results. Only point_only narrows
 * the basis selection; sort stays in its visible menu, not in filter chips.
 */
function narrowingKeys(): readonly ExplorerFilterKey[] {
  return EXPLORER_FILTER_KEYS.filter((key) => key !== "sort" && !(EXPLORER_BASIS_KEYS as readonly string[]).includes(key));
}

export function hasActiveExplorerFilters(filters: ExplorerFilters): boolean {
  return narrowingKeys().some(key => filters[key] !== "") || filters.setting.length > 0;
}
export interface ActiveExplorerFilter { key: ExplorerFilterKey; label: string; value: string }
export function activeExplorerFilters(filters: ExplorerFilters): ActiveExplorerFilter[] {
  return narrowingKeys().filter(key => filters[key] !== "").map(key => ({
    key, label: EXPLORER_FILTER_LABELS[key], value: key === "weight_bits" ? `${filters[key]} bit` : filters[key],
  }));
}
export function clearExplorerFilter(filters: ExplorerFilters, key: ExplorerFilterKey): ExplorerFilters {
  return repairBasis({ ...filters, [key]: "" });
}

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Cursors pass through untouched, but a hand-edited address never forwards junk to the API. */
export function sanitizeExplorerCursor(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > EXPLORER_CURSOR_MAX_LENGTH) return null;
  return CURSOR_PATTERN.test(trimmed) ? trimmed : null;
}

export interface ExplorerLocation {
  filters: ExplorerFilters;
  cursor: string | null;
}

/**
 * Serving points require bytes, concurrency and output tokens (a fixed-output
 * preset or a historical cap); legacy points require tokens and concurrency.
 * Repair incomplete or unreadable tuples without ever reinterpreting a token
 * length as bytes. Point-ranked sorts need a whole tuple, and a sort that the
 * scope cannot read is dropped rather than sent.
 */
function repairBasis(filters: ExplorerFilters): ExplorerFilters {
  const repaired = { ...filters };
  if (basisPointOf(repaired) === null) {
    for (const key of EXPLORER_BASIS_KEYS) repaired[key] = "";
    repaired.point_only = "";
    if (isPointSort(repaired.sort)) repaired.sort = "";
  }
  if (repaired.sort && !sortAvailable(repaired.sort, measurementScope(repaired.measurement))) repaired.sort = "";
  if (repaired.point_only !== "1") repaired.point_only = "";
  return repaired;
}

/** Read a shared or bookmarked address back into filters and a page cursor. */
export function parseExplorerLocation(search: string): ExplorerLocation {
  const params = new URLSearchParams(search);
  const filters: ExplorerFilters = { ...EMPTY_EXPLORER_FILTERS, setting: params.getAll("setting") };
  for (const key of EXPLORER_FILTER_KEYS) filters[key] = normalizeValue(params.get(key) ?? "", key);
  filters.setting = normalizeSettings(filters.setting);
  if (!(filters.sort in EXPLORER_SORTS) || filters.sort === "newest") filters.sort = "";
  return { filters: repairBasis(filters), cursor: sanitizeExplorerCursor(params.get("cursor")) };
}

/** Canonical address for the current view: set filters only, plus the cursor of a later page. */
export function buildExplorerSearch(location: ExplorerLocation): string {
  const params = new URLSearchParams();
  for (const key of EXPLORER_FILTER_KEYS) {
    const value = normalizeValue(location.filters[key] ?? "", key);
    if (value) params.set(key, value);
  }
  for (const condition of normalizeSettings(location.filters.setting)) params.append("setting", condition);
  const cursor = sanitizeExplorerCursor(location.cursor);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** List request for the current view. Summary fields only; measurement rows are never fetched here. */
export function buildExplorerRequestPath(location: ExplorerLocation, limit: number = EXPLORER_PAGE_SIZE): string {
  const params = new URLSearchParams({ limit: String(limit) });
  new URLSearchParams(buildExplorerSearch(location)).forEach((value, key) => params.append(key, value));
  return `/v1/benchmark-runs?${params.toString()}`;
}

/** All builders percent-encode their query. The wire bound includes cursor/facet metadata. */
export function isExplorerRequestWithinBounds(path: string): boolean {
  return path.slice(path.indexOf("?") + 1).length <= DISCOVERY_MAX_QUERY_BYTES;
}
export const EXPLORER_QUERY_LIMIT_MESSAGE = "Shorten or remove conditions to page or request suggestions: the complete query exceeds the URL limit.";
export const EXPLORER_INCOMPLETE_MESSAGE = "Complete the other conditions before requesting suggestions.";
export function explorerOptionsRequestError(path: string): string | undefined {
  if (!isExplorerRequestWithinBounds(path)) return EXPLORER_QUERY_LIMIT_MESSAGE;
  try {
    parseOptionsQuery(new URLSearchParams(path.slice(path.indexOf("?") + 1)));
    return undefined;
  } catch {
    return EXPLORER_INCOMPLETE_MESSAGE;
  }
}

/** Page hosting the client-side explorer. */
export const EXPLORER_PAGE_PATH = "/benchmarks";

export function explorerDetailHref(publicId: string): string {
  return `${EXPLORER_PAGE_PATH}/${encodeURIComponent(publicId)}`;
}

export function pushExplorerHistory(history: string[], currentCursor: string | null): string[] {
  const next = [...history, currentCursor ?? ""];
  return next.length > EXPLORER_HISTORY_LIMIT ? next.slice(next.length - EXPLORER_HISTORY_LIMIT) : next;
}

export function popExplorerHistory(history: string[]): { previous: string | null; rest: string[] } {
  const prev = history.length > 0 ? (history[history.length - 1] ?? null) : null;
  return { previous: prev === "" ? null : prev, rest: history.slice(0, -1) };
}

function boundExplorerHistory(history: string[]): string[] {
  return history.length > EXPLORER_HISTORY_LIMIT ? history.slice(history.length - EXPLORER_HISTORY_LIMIT) : history;
}

/**
 * Only application-owned paging data belongs in a public history write.
 * Next merges its router metadata when the native History API is called.
 */
export function explorerHistoryState(history: string[]): Record<string, unknown> {
  return { explorerHistory: boundExplorerHistory([...history]) };
}
export function readExplorerHistory(historyState: unknown): string[] {
  if (typeof historyState !== "object" || historyState === null) return [];
  const raw = (historyState as { explorerHistory?: unknown }).explorerHistory;
  if (!Array.isArray(raw)) return [];
  return boundExplorerHistory(raw.filter((value): value is string => typeof value === "string"));
}

/** Public list fields used by the explorer. The list API exposes no submission ids and no local file paths; the repository-relative artifact filename is public when reported. */
export interface ExplorerSummary {
  schema_version?: 1 | 2 | 3;
  model_label: string;
  hardware_label: string;
  method_label: string;
  workload_label: string;
  row_count: number;
  failed_rows: number;
  status: string;
  mean_tg_tps: number | null;
  mean_e2e_ms: number | null;
  /** Mean prompt processing throughput over the successful rows. */
  mean_pp_tps?: number | null;
  /** Input lengths the run was configured with, sorted and deduplicated. */
  prompt_lengths?: number[];
  /**
   * What the explorer reads: one entry per operating point the run measured.
   * The mean_* fields above mix input lengths and concurrencies together, so
   * they are no longer displayed. Absent on results stored before migration 012.
   */
  points?: BenchmarkPoint[];
  points_truncated?: boolean;
  /**
   * Published model metadata. Absent on results stored before the metadata
   * migration and null when the publication carried none, which the explorer
   * reports as unknown rather than filling in from the curated label.
   */
  model_info?: BenchmarkModelInfo | null;
  setup?: BenchmarkSetup;
  identity?: BenchmarkIdentity;
  input_unit?: "utf8_bytes";
  serving_points?: ServingBenchmarkPoint[];
}

export interface ExplorerItem {
  public_id: string;
  summary: ExplorerSummary;
  revision: number;
  created_at: string;
}

export interface ExplorerListResponse {
  items: ExplorerItem[];
  next_cursor: string | null;
}

export function isCompared(compare: ExplorerItem[], publicId: string): boolean {
  return compare.some((item) => item.public_id === publicId);
}

export function canAddToComparison(compare: ExplorerItem[]): boolean {
  return compare.length < EXPLORER_COMPARE_LIMIT;
}

export interface ComparisonCompatibility {
  comparable: boolean;
  methods: string[];
  workloads: string[];
}

/**
 * Results measured with a different method or workload describe different work.
 * The panel says so instead of presenting the numbers as a contest.
 */
export function comparisonCompatibility(compare: ExplorerItem[]): ComparisonCompatibility {
  const methods = [...new Set(compare.map((item) => item.summary.method_label))];
  const workloads = [...new Set(compare.map((item) => item.summary.workload_label))];
  return { comparable: methods.length <= 1 && workloads.length <= 1, methods, workloads };
}

export interface ExplorerState {
  /** Filter text being edited; it reaches the address and the request on submit. */
  draft: ExplorerFilters;
  /** Filters backing the current address and request. */
  applied: ExplorerFilters;
  cursor: string | null;
  history: string[];
  compare: ExplorerItem[];
}

export type ExplorerAction =
  | { type: "route"; search: string; history?: string[] }
  | { type: "location"; search: string; history?: string[] }
  | { type: "draft"; key: ExplorerFilterKey; value: string }
  | { type: "settings"; value: string[] }
  | { type: "removeSetting"; index: number }
  | { type: "sort"; value: string }
  | { type: "basisPoint"; value: string }
  | { type: "pointOnly"; value: boolean }
  | { type: "apply" }
  | { type: "reset" }
  | { type: "removeFilter"; key: ExplorerFilterKey }
  | { type: "nextPage"; cursor: string | null }
  | { type: "previousPage" }
  | { type: "firstPage" }
  | { type: "toggleComparison"; item: ExplorerItem }
  | { type: "clearComparison" };

export function explorerStateFromSearch(search: string, history: string[] = []): ExplorerState {
  const { filters, cursor } = parseExplorerLocation(search);
  return { draft: filters, applied: filters, cursor, history: boundExplorerHistory(history), compare: [] };
}

export function explorerReducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case "route": {
      const { filters, cursor } = parseExplorerLocation(action.search);
      // Acknowledging a local history write must preserve draft edits and the
      // current back-stack. A different routed view takes precedence over both.
      if (sameExplorerFilters(filters, state.applied) && cursor === state.cursor) return state;
      return explorerReducer(state, { ...action, type: "location" });
    }
    case "location": {
      // Deep link or back/forward: the address is the source of truth. Picked
      // results survive navigation because they were chosen by hand.
      const { filters, cursor } = parseExplorerLocation(action.search);
      return {
        draft: filters,
        applied: filters,
        cursor,
        history: boundExplorerHistory(action.history ?? []),
        compare: state.compare,
      };
    }
    case "draft": {
      const draft = { ...state.draft, [action.key]: action.key === "measurement" ? normalizeValue(action.value, action.key) : action.value };
      if (action.key === "measurement") {
        for (const key of EXPLORER_BASIS_KEYS) draft[key] = "";
        draft.point_only = "";
        draft.sort = "";
      }
      return { ...state, draft };
    }
    case "settings":
      return { ...state, draft: { ...state.draft, setting: action.value } };
    case "removeSetting": {
      const value = state.applied.setting[action.index];
      return { ...state, applied: { ...state.applied, setting: state.applied.setting.filter((_, index) => index !== action.index) },
        draft: { ...state.draft, setting: state.draft.setting.filter(condition => condition !== value) }, cursor: null, history: [] };
    }
    case "sort": {
      const sort = action.value !== "newest" && Object.hasOwn(EXPLORER_SORTS, action.value) ? action.value : "";
      if (sort && !sortAvailable(sort, measurementScope(state.applied.measurement))) return state;
      // Ranking measured speed needs a point to rank at; without one the order is refused.
      if (isPointSort(sort) && basisPointOf(state.applied) === null) return state;
      if (sort === state.applied.sort) return state;
      // Ordering applies to displayed results without submitting unfinished filters.
      return { ...state, applied: { ...state.applied, sort }, draft: { ...state.draft, sort }, cursor: null, history: [] };
    }
    case "basisPoint": {
      // The basis decides which measurement every row reports, so it applies at
      // once like sorting does, without submitting unfinished filter edits.
      const scope = measurementScope(state.applied.measurement);
      const parsed = scope === "legacy" ? parsePointId(action.value) : parseServingPointId(action.value);
      // A fixed-output basis names one of the shared presets; any other cap is no basis here.
      const point = parsed && "max_output_tokens" in parsed && !isServingOutputInScope(parsed.max_output_tokens, scope) ? null : parsed;
      const next: ExplorerFilters = {
        ...state.applied,
        point_tokens: point && "prompt_tokens" in point ? String(point.prompt_tokens) : "",
        point_bytes: point && "input_bytes" in point ? String(point.input_bytes) : "",
        point_max_tokens: point && "max_output_tokens" in point ? String(point.max_output_tokens) : "",
        point_concurrency: point ? String(point.concurrency) : "",
      };
      // Dropping the basis drops what point_only narrowed to and what the two
      // speed sorts ranked at, rather than leaving either pointing at nothing.
      if (!point) {
        next.point_only = "";
        if (isPointSort(next.sort)) next.sort = "";
      }
      if (sameExplorerFilters(next, state.applied)) return state;
      return { ...state, applied: next, draft: { ...state.draft, ...Object.fromEntries(EXPLORER_BASIS_KEYS.map(key => [key, next[key]])), point_only: next.point_only, sort: next.sort }, cursor: null, history: [] };
    }
    case "pointOnly": {
      const value = action.value && basisPointOf(state.applied) ? "1" : "";
      if (value === state.applied.point_only) return state;
      const next = { ...state.applied, point_only: value };
      return { ...state, applied: next, draft: { ...state.draft, point_only: value }, cursor: null, history: [] };
    }
    case "apply": {
      if (invalidExplorerDraft(state.draft)) return state;
      const next = normalizeExplorerFilters(state.draft);
      // An unchanged filter set keeps the current page; the caller re-requests it.
      if (sameExplorerFilters(next, state.applied)) return { ...state, draft: next };
      return { ...state, draft: next, applied: next, cursor: null, history: [] };
    }
    case "reset":
      return {
        ...state,
        draft: { ...EMPTY_EXPLORER_FILTERS },
        applied: { ...EMPTY_EXPLORER_FILTERS },
        cursor: null,
        history: [],
      };
    case "removeFilter": {
      const applied = clearExplorerFilter(state.applied, action.key);
      if (sameExplorerFilters(applied, state.applied)) return state;
      return {
        ...state,
        applied,
        draft: clearExplorerFilter(state.draft, action.key),
        cursor: null,
        history: [],
      };
    }
    case "nextPage": {
      const cursor = sanitizeExplorerCursor(action.cursor);
      if (!cursor) return state;
      if (!isExplorerRequestWithinBounds(buildExplorerRequestPath({ filters: state.applied, cursor }))) return state;
      return { ...state, history: pushExplorerHistory(state.history, state.cursor), cursor };
    }
    case "firstPage":
      return { ...state, cursor: null, history: [] };
    case "previousPage": {
      if (state.history.length === 0) return state;
      const { previous, rest } = popExplorerHistory(state.history);
      return { ...state, cursor: previous, history: rest };
    }
    case "toggleComparison": {
      if (isCompared(state.compare, action.item.public_id)) {
        return { ...state, compare: state.compare.filter((item) => item.public_id !== action.item.public_id) };
      }
      if (!canAddToComparison(state.compare)) return state;
      return { ...state, compare: [...state.compare, action.item] };
    }
    case "clearComparison":
      return { ...state, compare: [] };
  }
}

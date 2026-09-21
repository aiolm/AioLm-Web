/**
 * Explorer state for the public benchmark list: URL-backed filters, bounded
 * keyset paging and an explicit comparison basket.
 *
 * The whole model is a pure reducer so deep links, browser back/forward, filter
 * resets and comparison bounds are verified directly instead of through a DOM.
 */

import type { BenchmarkSetup } from "@/lib/benchmark-discovery";
import type { BenchmarkModelInfo } from "./benchmark-model-identity";

export const EXPLORER_TEXT_KEYS = ["q", "model", "publisher", "quantization", "base_model", "hardware", "vendor", "gpu", "cpu", "os", "arch", "runtime", "backend", "mode", "method", "workload", "flash_attention", "cache_type_k", "cache_type_v", "split_mode"] as const;
export const EXPLORER_RANGES = ["context", "vram", "cores", "parallel", "threads", "gpu_layers"] as const;
export const EXPLORER_NUMERIC_KEYS = ["context_min", "context_max", "vram_min", "vram_max", "cores_min", "cores_max", "parallel_min", "parallel_max", "threads_min", "threads_max", "gpu_layers_min", "gpu_layers_max"] as const;
export const EXPLORER_SORTS = { newest: "Newest first", oldest: "Oldest first", context_asc: "Input length: low to high", context_desc: "Input length: high to low", vram_asc: "VRAM: low to high", vram_desc: "VRAM: high to low", throughput_desc: "Generation: fastest first", duration_asc: "Duration: shortest first" } as const;
export const EXPLORER_FILTER_KEYS = [...EXPLORER_TEXT_KEYS, ...EXPLORER_NUMERIC_KEYS, "sort"] as const;
export type ExplorerFilterKey = (typeof EXPLORER_FILTER_KEYS)[number];
export type ExplorerFilters = Record<ExplorerFilterKey, string>;
export const EXPLORER_RANGE_LABELS = { context: "Max input length (tokens)", vram: "Selected GPU VRAM (MiB)", cores: "Logical cores", parallel: "Parallel sequences", threads: "Threads", gpu_layers: "GPU layers (-1 = all)" } as const;
export const EXPLORER_FILTER_LABELS: Record<ExplorerFilterKey, string> = {
  q: "Search", model: "Model fingerprint", publisher: "Publisher", quantization: "Weight quantization", base_model: "Base model", hardware: "Hardware", vendor: "GPU vendor", gpu: "GPU model", cpu: "CPU", os: "Operating system", arch: "Architecture", runtime: "Runtime", backend: "Backend", mode: "Execution mode", method: "Measurement method", workload: "Workload", flash_attention: "Flash attention", cache_type_k: "Key cache type", cache_type_v: "Value cache type", split_mode: "Split mode", sort: "Sort",
  context_min: "Minimum input length", context_max: "Maximum input length", vram_min: "Minimum VRAM", vram_max: "Maximum VRAM", cores_min: "Minimum cores", cores_max: "Maximum cores", parallel_min: "Minimum parallel sequences", parallel_max: "Maximum parallel sequences", threads_min: "Minimum threads", threads_max: "Maximum threads", gpu_layers_min: "Minimum GPU layers", gpu_layers_max: "Maximum GPU layers",
};
/**
 * The context range and its sorts read the largest input length a result was
 * configured with, which is not the total context the server allocated. The
 * address keys stay `context_*`, so a link shared before this wording still
 * opens the same view.
 */
export const EXPLORER_RANGE_HINTS = { context: "Matches the largest input length a result was configured with, not the total context the server allocated." } as const;
export const EXPLORER_FILTER_PLACEHOLDERS = { model: "sha256: or unidentified", publisher: "Hugging Face namespace", quantization: "Q4_K_M, Q8_0", base_model: "namespace/repo", hardware: "GPU name or vendor", method: "cold-prompt-serving@1", workload: "code_python, novel_en" };

export function invalidExplorerRanges(filters: ExplorerFilters): string[] {
  return EXPLORER_RANGES.filter(range => {
    const low = filters[`${range}_min`].trim();
    const high = filters[`${range}_max`].trim();
    const invalid = (value: string) => value !== "" && (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < (range === "gpu_layers" ? -1 : 0));
    return invalid(low) || invalid(high) || (low !== "" && high !== "" && Number(low) > Number(high));
  });
}

export function buildExplorerOptionsPath(field: string, value: string, filters: ExplorerFilters): string {
  const params = new URLSearchParams(buildExplorerSearch({ filters, cursor: null }));
  params.delete(field);
  params.delete("sort");
  params.set("field", field);
  params.set("option_query", value.trim().slice(0, 120));
  return `/v1/benchmark-runs/options?${params}`;
}

/** The list API accepts at most 120 characters per text filter. */
export const EXPLORER_FILTER_MAX_LENGTH = 120;

/** Page size requested from the list API, whose own default is 25 and maximum 100. */
export const EXPLORER_PAGE_SIZE = 25;

/** Bounded keyset back-stack so paging state stays small and predictable. */
export const EXPLORER_HISTORY_LIMIT = 20;

/** Comparison is an explicit pick of a few results, never a ranking of everything. */
export const EXPLORER_COMPARE_LIMIT = 3;

/** Cursors are opaque base64url strings; anything else is treated as absent. */
export const EXPLORER_CURSOR_MAX_LENGTH = 2048;

export const EMPTY_EXPLORER_FILTERS = Object.fromEntries(EXPLORER_FILTER_KEYS.map(key => [key, ""])) as ExplorerFilters;

function normalizeValue(value: string): string {
  return value.trim().slice(0, EXPLORER_FILTER_MAX_LENGTH);
}

export function normalizeExplorerFilters(filters: ExplorerFilters): ExplorerFilters {
  return Object.fromEntries(EXPLORER_FILTER_KEYS.map(key => [key, normalizeValue(filters[key] ?? "")])) as ExplorerFilters;
}

export function sameExplorerFilters(a: ExplorerFilters, b: ExplorerFilters): boolean {
  return EXPLORER_FILTER_KEYS.every((key) => a[key] === b[key]);
}

export function hasActiveExplorerFilters(filters: ExplorerFilters): boolean {
  return EXPLORER_FILTER_KEYS.some((key) => filters[key] !== "");
}

export interface ActiveExplorerFilter {
  key: ExplorerFilterKey;
  label: string;
  value: string;
}

/** Applied filters rendered as removable chips, in a stable field order. */
export function activeExplorerFilters(filters: ExplorerFilters): ActiveExplorerFilter[] {
  return EXPLORER_FILTER_KEYS.filter((key) => filters[key] !== "").map((key) => ({
    key,
    label: EXPLORER_FILTER_LABELS[key],
    value: filters[key],
  }));
}

export function clearExplorerFilter(filters: ExplorerFilters, key: ExplorerFilterKey): ExplorerFilters {
  return { ...filters, [key]: "" };
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

/** Read a shared or bookmarked address back into filters and a page cursor. */
export function parseExplorerLocation(search: string): ExplorerLocation {
  const params = new URLSearchParams(search);
  const filters: ExplorerFilters = { ...EMPTY_EXPLORER_FILTERS };
  for (const key of EXPLORER_FILTER_KEYS) filters[key] = normalizeValue(params.get(key) ?? "");
  if (!(filters.sort in EXPLORER_SORTS) || filters.sort === "newest") filters.sort = "";
  return { filters, cursor: sanitizeExplorerCursor(params.get("cursor")) };
}

/** Canonical address for the current view: set filters only, plus the cursor of a later page. */
export function buildExplorerSearch(location: ExplorerLocation): string {
  const params = new URLSearchParams();
  for (const key of EXPLORER_FILTER_KEYS) {
    const value = normalizeValue(location.filters[key] ?? "");
    if (value) params.set(key, value);
  }
  const cursor = sanitizeExplorerCursor(location.cursor);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** List request for the current view. Summary fields only; measurement rows are never fetched here. */
export function buildExplorerRequestPath(location: ExplorerLocation, limit: number = EXPLORER_PAGE_SIZE): string {
  const params = new URLSearchParams({ limit: String(limit) });
  for (const key of EXPLORER_FILTER_KEYS) {
    const value = normalizeValue(location.filters[key] ?? "");
    if (value) params.set(key, value);
  }
  const cursor = sanitizeExplorerCursor(location.cursor);
  if (cursor) params.set("cursor", cursor);
  return `/v1/benchmark-runs?${params.toString()}`;
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
   * Published model metadata. Absent on results stored before the metadata
   * migration and null when the publication carried none, which the explorer
   * reports as unknown rather than filling in from the curated label.
   */
  model_info?: BenchmarkModelInfo | null;
  setup?: BenchmarkSetup;
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
  | { type: "sort"; value: string }
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
    case "draft":
      return { ...state, draft: { ...state.draft, [action.key]: action.value } };
    case "sort": {
      const sort = action.value !== "newest" && Object.hasOwn(EXPLORER_SORTS, action.value) ? action.value : "";
      if (sort === state.applied.sort) return state;
      // Ordering applies to displayed results without submitting unfinished filters.
      return { ...state, applied: { ...state.applied, sort }, draft: { ...state.draft, sort }, cursor: null, history: [] };
    }
    case "apply": {
      if (invalidExplorerRanges(state.draft).length) return state;
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

/**
 * Explorer state for the public benchmark list: URL-backed filters, bounded
 * keyset paging and an explicit comparison basket.
 *
 * The whole model is a pure reducer so deep links, browser back/forward, filter
 * resets and comparison bounds are verified directly instead of through a DOM.
 */

export const EXPLORER_FILTER_KEYS = ["model", "hardware", "method", "workload"] as const;

export type ExplorerFilterKey = (typeof EXPLORER_FILTER_KEYS)[number];

export type ExplorerFilters = Record<ExplorerFilterKey, string>;

/** Field names shown in the filter form and the active-filter chips. */
export const EXPLORER_FILTER_LABELS: Record<ExplorerFilterKey, string> = {
  model: "Model fingerprint",
  hardware: "Hardware",
  method: "Measurement method",
  workload: "Workload",
};

/**
 * Placeholders describe the shape of a published label instead of naming a model
 * or a product: a fingerprint prefix, the method id this app records, and corpus
 * names from the workload contract.
 */
export const EXPLORER_FILTER_PLACEHOLDERS: Record<ExplorerFilterKey, string> = {
  model: "sha256: or unidentified",
  hardware: "GPU name or vendor",
  method: "cold-prompt-serving@1",
  workload: "code_python, novel_en",
};

/** The list API truncates every filter to 120 characters; match it so the address and the request agree. */
export const EXPLORER_FILTER_MAX_LENGTH = 120;

/** Page size requested from the list API, whose own default is 25 and maximum 100. */
export const EXPLORER_PAGE_SIZE = 25;

/** Bounded keyset back-stack so paging state stays small and predictable. */
export const EXPLORER_HISTORY_LIMIT = 20;

/** Comparison is an explicit pick of a few results, never a ranking of everything. */
export const EXPLORER_COMPARE_LIMIT = 3;

/** Cursors are opaque base64url strings; anything else is treated as absent. */
export const EXPLORER_CURSOR_MAX_LENGTH = 512;

export const EMPTY_EXPLORER_FILTERS: ExplorerFilters = { model: "", hardware: "", method: "", workload: "" };

function normalizeValue(value: string): string {
  return value.trim().slice(0, EXPLORER_FILTER_MAX_LENGTH);
}

export function normalizeExplorerFilters(filters: ExplorerFilters): ExplorerFilters {
  return {
    model: normalizeValue(filters.model),
    hardware: normalizeValue(filters.hardware),
    method: normalizeValue(filters.method),
    workload: normalizeValue(filters.workload),
  };
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
  return { filters, cursor: sanitizeExplorerCursor(params.get("cursor")) };
}

/** Canonical address for the current view: set filters only, plus the cursor of a later page. */
export function buildExplorerSearch(location: ExplorerLocation): string {
  const params = new URLSearchParams();
  for (const key of EXPLORER_FILTER_KEYS) {
    const value = normalizeValue(location.filters[key]);
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
    const value = normalizeValue(location.filters[key]);
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

/** Public list fields used by the explorer. The list API exposes no submission ids and no file names. */
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
  | { type: "apply" }
  | { type: "reset" }
  | { type: "removeFilter"; key: ExplorerFilterKey }
  | { type: "nextPage"; cursor: string | null }
  | { type: "previousPage" }
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
    case "apply": {
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

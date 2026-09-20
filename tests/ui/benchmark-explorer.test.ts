import { describe, expect, it } from "vitest";
import {
  BROWSER_HISTORY_LIMIT,
  normalizeBrowserFilters,
  popBrowserHistory,
  pushBrowserHistory,
  sameBrowserFilters,
} from "@/components/benchmark-browser";
import {
  EXPLORER_COMPARE_LIMIT,
  EXPLORER_FILTER_MAX_LENGTH,
  EXPLORER_FILTER_PLACEHOLDERS,
  EXPLORER_HISTORY_LIMIT,
  EXPLORER_PAGE_PATH,
  activeExplorerFilters,
  buildExplorerRequestPath,
  buildExplorerSearch,
  comparisonCompatibility,
  explorerDetailHref,
  explorerHistoryState,
  explorerReducer,
  explorerStateFromSearch,
  normalizeExplorerFilters,
  parseExplorerLocation,
  popExplorerHistory,
  pushExplorerHistory,
  readExplorerHistory,
  sameExplorerFilters,
  sanitizeExplorerCursor,
  type ExplorerItem,
  type ExplorerState,
  type ExplorerSummary,
} from "@/components/benchmark-explorer-state";
import {
  EXPLORER_MISSING,
  formatDuration,
  formatPublishedDate,
  formatSampleCount,
  formatThroughput,
} from "@/components/benchmark-explorer-format";

/** Synthetic results: fabricated labels only, no published model names or file paths. */
function result(id: string, overrides: Partial<ExplorerSummary> = {}): ExplorerItem {
  return {
    public_id: id,
    revision: 1,
    created_at: "2026-01-02T03:04:05.000Z",
    summary: {
      model_label: `sha256:${id}`,
      hardware_label: "synthetic-gpu-a",
      method_label: "synthetic-method@1",
      workload_label: "synthetic-corpus",
      row_count: 12,
      failed_rows: 0,
      status: "complete",
      mean_tg_tps: 42.25,
      mean_e2e_ms: 1234.6,
      ...overrides,
    },
  };
}

function withCompare(state: ExplorerState, items: ExplorerItem[]): ExplorerState {
  return items.reduce((acc, item) => explorerReducer(acc, { type: "toggleComparison", item }), state);
}

describe("shareable filter links", () => {
  it("loads filters and the page cursor from the address on arrival", () => {
    const state = explorerStateFromSearch("?model=sha256%3A0000aaaa&workload=synthetic-corpus&cursor=Q3Vyc29yMQ");
    expect(state.applied).toEqual({
      model: "sha256:0000aaaa",
      hardware: "",
      method: "",
      workload: "synthetic-corpus",
    });
    // The form shows what the link asked for, so the reader can edit it.
    expect(state.draft).toEqual(state.applied);
    expect(state.cursor).toBe("Q3Vyc29yMQ");
  });

  it("requests exactly the filtered page the link describes", () => {
    const state = explorerStateFromSearch("?model=sha256%3A0000aaaa&workload=synthetic-corpus&cursor=Q3Vyc29yMQ");
    expect(buildExplorerRequestPath({ filters: state.applied, cursor: state.cursor })).toBe(
      "/v1/benchmark-runs?limit=25&model=sha256%3A0000aaaa&workload=synthetic-corpus&cursor=Q3Vyc29yMQ",
    );
  });

  it("round-trips a view through the address without drift", () => {
    const search = "?hardware=synthetic-gpu-a&method=synthetic-method%401&cursor=Q3Vyc29yMg";
    const first = parseExplorerLocation(search);
    const canonical = buildExplorerSearch(first);
    expect(parseExplorerLocation(canonical)).toEqual(first);
    expect(buildExplorerSearch(parseExplorerLocation(canonical))).toBe(canonical);
  });

  it("writes only the parts of the view that are set", () => {
    expect(buildExplorerSearch({ filters: normalizeExplorerFilters({ model: "", hardware: "", method: "", workload: "" }), cursor: null })).toBe("");
    expect(
      buildExplorerSearch({ filters: { model: "", hardware: "synthetic-gpu-a", method: "", workload: "" }, cursor: null }),
    ).toBe("?hardware=synthetic-gpu-a");
  });

  it("ignores unrelated parameters and a hand-edited cursor", () => {
    const location = parseExplorerLocation("?foo=bar&limit=9999&cursor=not%20a%20cursor");
    expect(location.filters).toEqual({ model: "", hardware: "", method: "", workload: "" });
    expect(location.cursor).toBeNull();
    expect(sanitizeExplorerCursor("Q3Vyc29yMQ")).toBe("Q3Vyc29yMQ");
    expect(sanitizeExplorerCursor(`${"a".repeat(513)}`)).toBeNull();
    expect(sanitizeExplorerCursor(null)).toBeNull();
  });

  it("caps a filter at the length the list API accepts", () => {
    const long = "x".repeat(EXPLORER_FILTER_MAX_LENGTH + 40);
    expect(parseExplorerLocation(`?model=${long}`).filters.model).toHaveLength(EXPLORER_FILTER_MAX_LENGTH);
    expect(normalizeExplorerFilters({ model: `  ${long}  `, hardware: "", method: "", workload: "" }).model).toHaveLength(
      EXPLORER_FILTER_MAX_LENGTH,
    );
  });

  it("links to a detail page by public id only, under the explorer page", () => {
    expect(EXPLORER_PAGE_PATH).toBe("/benchmarks");
    expect(explorerDetailHref("ab/cd")).toBe("/benchmarks/ab%2Fcd");
  });
});

describe("filter field hints", () => {
  it("describes label shapes instead of naming a model or a competing product", () => {
    // The contract defines exactly one measurement method, so the hint can be exact.
    expect(EXPLORER_FILTER_PLACEHOLDERS.method).toBe("cold-prompt-serving@1");
    expect(EXPLORER_FILTER_PLACEHOLDERS.model).toContain("sha256:");
    // Workload hints are corpus names from the workload contract.
    expect(EXPLORER_FILTER_PLACEHOLDERS.workload).toBe("code_python, novel_en");
  });
});

describe("applying, resetting and removing filters", () => {
  it("trims a draft and restarts paging when the filter set changes", () => {
    let state = explorerStateFromSearch("");
    state = explorerReducer(state, { type: "nextPage", cursor: "Q3Vyc29yMQ" });
    state = explorerReducer(state, { type: "draft", key: "hardware", value: "  synthetic-gpu-a  " });
    state = explorerReducer(state, { type: "apply" });
    expect(state.applied.hardware).toBe("synthetic-gpu-a");
    expect(state.draft.hardware).toBe("synthetic-gpu-a");
    expect(state.cursor).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("keeps the current page when the same filters are applied again", () => {
    let state = explorerStateFromSearch("?hardware=synthetic-gpu-a");
    state = explorerReducer(state, { type: "nextPage", cursor: "Q3Vyc29yMQ" });
    state = explorerReducer(state, { type: "apply" });
    expect(state.cursor).toBe("Q3Vyc29yMQ");
    expect(state.history).toEqual([""]);
  });

  it("resets every filter and returns to the first page", () => {
    let state = explorerStateFromSearch("?model=sha256%3A0000aaaa&hardware=synthetic-gpu-a");
    state = explorerReducer(state, { type: "nextPage", cursor: "Q3Vyc29yMQ" });
    state = explorerReducer(state, { type: "reset" });
    expect(state.applied).toEqual({ model: "", hardware: "", method: "", workload: "" });
    expect(state.draft).toEqual(state.applied);
    expect(state.cursor).toBeNull();
    expect(state.history).toEqual([]);
    expect(buildExplorerSearch({ filters: state.applied, cursor: state.cursor })).toBe("");
  });

  it("removes one active filter and leaves the others applied", () => {
    let state = explorerStateFromSearch("?model=sha256%3A0000aaaa&hardware=synthetic-gpu-a");
    state = explorerReducer(state, { type: "nextPage", cursor: "Q3Vyc29yMQ" });
    state = explorerReducer(state, { type: "removeFilter", key: "model" });
    expect(state.applied).toEqual({ model: "", hardware: "synthetic-gpu-a", method: "", workload: "" });
    expect(state.draft.model).toBe("");
    expect(state.cursor).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("does nothing when the removed filter was not active", () => {
    const state = explorerStateFromSearch("?hardware=synthetic-gpu-a");
    expect(explorerReducer(state, { type: "removeFilter", key: "workload" })).toBe(state);
  });

  it("lists active filters as labelled chips in field order", () => {
    const state = explorerStateFromSearch("?workload=synthetic-corpus&model=sha256%3A0000aaaa");
    expect(activeExplorerFilters(state.applied).map((filter) => filter.key)).toEqual(["model", "workload"]);
    expect(activeExplorerFilters(state.applied)[0]).toEqual({
      key: "model",
      label: "Model fingerprint",
      value: "sha256:0000aaaa",
    });
  });
});

describe("bounded keyset paging", () => {
  it("walks forward and back to the first page", () => {
    let state = explorerStateFromSearch("");
    state = explorerReducer(state, { type: "nextPage", cursor: "Q3Vyc29yMQ" });
    state = explorerReducer(state, { type: "nextPage", cursor: "Q3Vyc29yMg" });
    expect(state.cursor).toBe("Q3Vyc29yMg");
    expect(state.history).toEqual(["", "Q3Vyc29yMQ"]);
    state = explorerReducer(state, { type: "previousPage" });
    expect(state.cursor).toBe("Q3Vyc29yMQ");
    state = explorerReducer(state, { type: "previousPage" });
    expect(state.cursor).toBeNull();
    expect(state.history).toEqual([]);
    expect(explorerReducer(state, { type: "previousPage" })).toBe(state);
  });

  it("ignores a missing or unusable next cursor", () => {
    const state = explorerStateFromSearch("");
    expect(explorerReducer(state, { type: "nextPage", cursor: null })).toBe(state);
    expect(explorerReducer(state, { type: "nextPage", cursor: "not a cursor" })).toBe(state);
  });

  it("keeps the back-stack bounded while paging deep", () => {
    let state = explorerStateFromSearch("");
    for (let i = 0; i < EXPLORER_HISTORY_LIMIT + 5; i += 1) {
      state = explorerReducer(state, { type: "nextPage", cursor: `Q3Vyc29y${i}` });
    }
    expect(state.history).toHaveLength(EXPLORER_HISTORY_LIMIT);
    expect(state.history[state.history.length - 1]).toBe(`Q3Vyc29y${EXPLORER_HISTORY_LIMIT + 3}`);
  });

  it("clamps a restored back-stack that claims to be longer than the limit", () => {
    const oversized = Array.from({ length: EXPLORER_HISTORY_LIMIT + 6 }, (_, i) => `Q3Vyc29y${i}`);
    expect(readExplorerHistory({ explorerHistory: oversized })).toHaveLength(EXPLORER_HISTORY_LIMIT);
    expect(explorerStateFromSearch("", oversized).history).toHaveLength(EXPLORER_HISTORY_LIMIT);
  });
});

describe("browser back and forward", () => {
  it("restores the filtered page and its back-stack from the history entry", () => {
    const firstPageSearch = "?method=synthetic-method%401";
    let page2 = explorerStateFromSearch(firstPageSearch);
    page2 = explorerReducer(page2, { type: "nextPage", cursor: "Q3Vyc29yMQ" });
    const page2Search = buildExplorerSearch({ filters: page2.applied, cursor: page2.cursor });
    const page2Entry = explorerHistoryState(page2.history);

    // Back to the first page: no cursor, no back-stack.
    const back = explorerReducer(page2, { type: "location", search: firstPageSearch, history: readExplorerHistory({}) });
    expect(back.applied.method).toBe("synthetic-method@1");
    expect(back.cursor).toBeNull();
    expect(back.history).toEqual([]);

    // Forward again: the second page and the stack that makes "Previous page" work.
    const forward = explorerReducer(back, {
      type: "location",
      search: page2Search,
      history: readExplorerHistory(page2Entry),
    });
    expect(forward.cursor).toBe("Q3Vyc29yMQ");
    expect(forward.history).toEqual([""]);
    expect(explorerReducer(forward, { type: "previousPage" }).cursor).toBeNull();
  });

  it("writes only bounded application paging data for the router to merge", () => {
    const history = Array.from({ length: 25 }, (_, i) => "cursor_" + i);
    const entry = explorerHistoryState(history);
    expect(entry).toEqual({ explorerHistory: history.slice(-20) });
    expect(entry).not.toHaveProperty("__NA");
    expect(entry).not.toHaveProperty("_N");
    expect(entry).not.toHaveProperty("__PRIVATE_NEXTJS_INTERNALS_TREE");
    history.push("later");
    expect(readExplorerHistory(entry)).not.toContain("later");
  });

  it("clears the filtered page on navigation to the plain explorer and preserves picked results", () => {
    let state = withCompare(explorerStateFromSearch("?hardware=Synthetic%20GPU%20B"), [result("0000aaaa")]);
    state = explorerReducer(state, { type: "nextPage", cursor: "second_page" });
    state = explorerReducer(state, { type: "draft", key: "model", value: "unapplied-edit" });
    const navigated = explorerReducer(state, { type: "route", search: "" });
    expect(navigated.applied).toEqual({ model: "", hardware: "", method: "", workload: "" });
    expect(navigated.draft).toEqual(navigated.applied);
    expect(navigated.cursor).toBeNull();
    expect(navigated.history).toEqual([]);
    expect(navigated.compare).toEqual(state.compare);
    expect(buildExplorerRequestPath({ filters: navigated.applied, cursor: navigated.cursor })).toBe(
      "/v1/benchmark-runs?limit=25",
    );
  });

  it("switches directly between routed filters and keyset pages", () => {
    const state = explorerStateFromSearch("?hardware=Synthetic%20GPU%20B");
    const navigated = explorerReducer(state, {
      type: "route",
      search: "model=sha256%3Asynthetic&cursor=second_page",
      history: [""],
    });
    expect(navigated.draft.model).toBe("sha256:synthetic");
    expect(navigated.draft.hardware).toBe("");
    expect(navigated.history).toEqual([""]);
    expect(buildExplorerRequestPath({ filters: navigated.applied, cursor: navigated.cursor })).toBe(
      "/v1/benchmark-runs?limit=25&model=sha256%3Asynthetic&cursor=second_page",
    );
  });

  it("keeps unapplied edits when Next acknowledges a local filter removal or page change", () => {
    let state = explorerStateFromSearch("?hardware=Synthetic%20GPU%20B&method=synthetic");
    state = explorerReducer(state, { type: "draft", key: "model", value: "unapplied-edit" });
    state = explorerReducer(state, { type: "removeFilter", key: "method" });
    state = explorerReducer(state, { type: "nextPage", cursor: "second_page" });
    const acknowledged = explorerReducer(state, {
      type: "route",
      search: buildExplorerSearch({ filters: state.applied, cursor: state.cursor }),
    });
    expect(acknowledged.draft.model).toBe("unapplied-edit");
    expect(acknowledged.applied.model).toBe("");
    expect(acknowledged.history).toEqual([""]);
    expect(acknowledged.cursor).toBe("second_page");
  });
  it("treats a missing or malformed history entry as an empty back-stack", () => {
    expect(readExplorerHistory(null)).toEqual([]);
    expect(readExplorerHistory({})).toEqual([]);
    expect(readExplorerHistory({ explorerHistory: "Q3Vyc29yMQ" })).toEqual([]);
    expect(readExplorerHistory({ explorerHistory: ["Q3Vyc29yMQ", 7, null] })).toEqual(["Q3Vyc29yMQ"]);
  });

  it("carries hand-picked results across navigation", () => {
    const picked = withCompare(explorerStateFromSearch(""), [result("0000aaaa")]);
    const navigated = explorerReducer(picked, { type: "location", search: "?hardware=synthetic-gpu-b" });
    expect(navigated.compare.map((item) => item.public_id)).toEqual(["0000aaaa"]);
    expect(explorerReducer(picked, { type: "reset" }).compare).toHaveLength(1);
  });
});

describe("hand-picked comparison", () => {
  it("holds no more than the selection limit", () => {
    const state = withCompare(explorerStateFromSearch(""), [
      result("0000aaaa"),
      result("0000bbbb"),
      result("0000cccc"),
    ]);
    expect(state.compare).toHaveLength(EXPLORER_COMPARE_LIMIT);
    // A fourth pick is refused rather than silently replacing one.
    const refused = explorerReducer(state, { type: "toggleComparison", item: result("0000dddd") });
    expect(refused).toBe(state);
  });

  it("frees a slot when a result is unpicked", () => {
    const three = withCompare(explorerStateFromSearch(""), [
      result("0000aaaa"),
      result("0000bbbb"),
      result("0000cccc"),
    ]);
    const two = explorerReducer(three, { type: "toggleComparison", item: result("0000bbbb") });
    expect(two.compare.map((item) => item.public_id)).toEqual(["0000aaaa", "0000cccc"]);
    const refilled = explorerReducer(two, { type: "toggleComparison", item: result("0000dddd") });
    expect(refilled.compare.map((item) => item.public_id)).toEqual(["0000aaaa", "0000cccc", "0000dddd"]);
    expect(explorerReducer(refilled, { type: "clearComparison" }).compare).toEqual([]);
  });

  it("calls out results that measured different work", () => {
    const sameSetup = comparisonCompatibility([result("0000aaaa"), result("0000bbbb")]);
    expect(sameSetup.comparable).toBe(true);
    expect(sameSetup.methods).toEqual(["synthetic-method@1"]);

    const otherMethod = comparisonCompatibility([
      result("0000aaaa"),
      result("0000bbbb", { method_label: "synthetic-method@2" }),
    ]);
    expect(otherMethod.comparable).toBe(false);
    expect(otherMethod.methods).toEqual(["synthetic-method@1", "synthetic-method@2"]);

    const otherWorkload = comparisonCompatibility([
      result("0000aaaa"),
      result("0000bbbb", { workload_label: "synthetic-corpus-long" }),
    ]);
    expect(otherWorkload.comparable).toBe(false);
    expect(otherWorkload.workloads).toEqual(["synthetic-corpus", "synthetic-corpus-long"]);
  });

  it("treats a single selection as internally consistent", () => {
    expect(comparisonCompatibility([result("0000aaaa")]).comparable).toBe(true);
    expect(comparisonCompatibility([]).comparable).toBe(true);
  });
});

describe("result cell formatting", () => {
  it("shows a gap instead of inventing a measurement", () => {
    expect(formatThroughput(null)).toBe(EXPLORER_MISSING);
    expect(formatThroughput(Number.NaN)).toBe(EXPLORER_MISSING);
    expect(formatThroughput(42.25)).toBe("42.3");
    expect(formatDuration(null)).toBe(EXPLORER_MISSING);
    expect(formatDuration(1234.6)).toBe("1235");
  });

  it("marks failed measurement rows so a partial run is not read as clean", () => {
    expect(formatSampleCount(12, 0)).toBe("12");
    expect(formatSampleCount(12, 3)).toBe("12 (3 failed)");
  });

  it("prints the publication day in UTC so a shared link reads the same everywhere", () => {
    expect(formatPublishedDate("2026-01-02T03:04:05.000Z")).toBe("2026-01-02");
    expect(formatPublishedDate("not a date")).toBe(EXPLORER_MISSING);
  });
});

describe("original browser helper names", () => {
  it("still exports the history and filter helpers", () => {
    expect(BROWSER_HISTORY_LIMIT).toBe(EXPLORER_HISTORY_LIMIT);
    expect(pushBrowserHistory).toBe(pushExplorerHistory);
    expect(popBrowserHistory).toBe(popExplorerHistory);
    expect(normalizeBrowserFilters).toBe(normalizeExplorerFilters);
    expect(sameBrowserFilters).toBe(sameExplorerFilters);
  });
});

import { describe, expect, it } from "vitest";
import {
  EXPLORER_COMPARE_LIMIT,
  EMPTY_EXPLORER_FILTERS,
  activeExplorerFilters,
  hasActiveExplorerFilters,
  invalidExplorerRanges,
  invalidExplorerDraft,
  buildExplorerOptionsPath,
  EXPLORER_FILTER_MAX_LENGTH,
  EXPLORER_HISTORY_LIMIT,
  EXPLORER_PAGE_PATH,
  buildExplorerRequestPath,
  isExplorerRequestWithinBounds,
  type ExplorerFilters,
  buildExplorerSearch,
  comparisonCompatibility,
  explorerDetailHref,
  explorerHistoryState,
  explorerReducer,
  explorerStateFromSearch,
  normalizeExplorerFilters,
  parseExplorerLocation,
  readExplorerHistory,
  sanitizeExplorerCursor,
  type ExplorerItem,
  type ExplorerState,
  type ExplorerSummary,
} from "@/components/benchmark-explorer-state";
import {
  EXPLORER_MISSING,
  formatDuration,
  formatPromptLength,
  formatPromptLengths,
  formatSampleCount,
  formatThroughput,
} from "@/components/benchmark-explorer-format";
import { parseFilters } from "@/lib/benchmark-discovery";

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
  it("keeps model lookup independent from legacy keywords through apply, removal and navigation", () => {
    const search = "?q=synthetic-gpu&model=legacy-label&model_query=synthetic-repo&gpu=synthetic-gpu&cursor=page2";
    let state = explorerStateFromSearch(search);
    expect(parseExplorerLocation(buildExplorerSearch({ filters: state.applied, cursor: state.cursor })).filters).toEqual(state.applied);
    state = explorerReducer(state, { type: "draft", key: "model_query", value: "new-model" });
    expect(state.applied.model_query).toBe("synthetic-repo");
    state = explorerReducer(state, { type: "apply" });
    expect(state.applied).toMatchObject({ model_query: "new-model", q: "synthetic-gpu", model: "legacy-label", gpu: "synthetic-gpu" });
    expect(state.cursor).toBeNull();
    state = explorerReducer(state, { type: "removeFilter", key: "q" });
    expect(state.draft.q).toBe("");
    expect(state.applied).toMatchObject({ q: "", model_query: "new-model", gpu: "synthetic-gpu" });
    state = explorerReducer(state, { type: "location", search, history: [] });
    expect(state.applied).toMatchObject({ q: "synthetic-gpu", model_query: "synthetic-repo" });
    expect(explorerReducer(state, { type: "reset" }).applied).toEqual(EMPTY_EXPLORER_FILTERS);
  });

  it("scopes model suggestions to other conditions without keeping its own query as a filter", () => {
    const filters = explorerStateFromSearch("?q=legacy&model_query=synthetic&gpu=synthetic-gpu&runtime=custom").applied;
    const path = new URL(buildExplorerOptionsPath("model_query", "  artifact.gguf  ", filters), "https://example.test");
    expect(Object.fromEntries(path.searchParams)).toEqual({ q: "legacy", gpu: "synthetic-gpu", runtime: "custom", field: "model_query", option_query: "artifact.gguf" });
  });
  it("loads filters and the page cursor from the address on arrival", () => {
    const state = explorerStateFromSearch("?model=sha256%3A0000aaaa&workload=synthetic-corpus&cursor=Q3Vyc29yMQ");
    expect(state.applied).toEqual({
      ...EMPTY_EXPLORER_FILTERS,
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
    expect(buildExplorerSearch({ filters: normalizeExplorerFilters({ ...EMPTY_EXPLORER_FILTERS, model: "", hardware: "", method: "", workload: "" }), cursor: null })).toBe("");
    expect(
      buildExplorerSearch({ filters: { ...EMPTY_EXPLORER_FILTERS, model: "", hardware: "synthetic-gpu-a", method: "", workload: "" }, cursor: null }),
    ).toBe("?hardware=synthetic-gpu-a");
  });

  it("ignores unrelated parameters and a hand-edited cursor", () => {
    const location = parseExplorerLocation("?foo=bar&limit=9999&cursor=not%20a%20cursor");
    expect(location.filters).toEqual({ ...EMPTY_EXPLORER_FILTERS, model: "", hardware: "", method: "", workload: "" });
    expect(location.cursor).toBeNull();
    expect(sanitizeExplorerCursor("Q3Vyc29yMQ")).toBe("Q3Vyc29yMQ");
    expect(sanitizeExplorerCursor(`${"a".repeat(2049)}`)).toBeNull();
    expect(sanitizeExplorerCursor(null)).toBeNull();
  });

  it("rejects overlong filters without silently changing the requested identity", () => {
    const long = "x".repeat(EXPLORER_FILTER_MAX_LENGTH + 40);
    const state = explorerStateFromSearch(`?model=${long}`);
    expect(state.draft.model).toBe(long);
    expect(invalidExplorerDraft(state.draft)).toBe(true);
    expect(explorerReducer(state, { type: "apply" })).toBe(state);
  });

  it("links to a detail page by public id only, under the explorer page", () => {
    expect(EXPLORER_PAGE_PATH).toBe("/benchmarks");
    expect(explorerDetailHref("ab/cd")).toBe("/benchmarks/ab%2Fcd");
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
    expect(state.applied).toEqual({ ...EMPTY_EXPLORER_FILTERS, model: "", hardware: "", method: "", workload: "" });
    expect(state.draft).toEqual(state.applied);
    expect(state.cursor).toBeNull();
    expect(state.history).toEqual([]);
    expect(buildExplorerSearch({ filters: state.applied, cursor: state.cursor })).toBe("");
  });

  it("removes one active filter and leaves the others applied", () => {
    let state = explorerStateFromSearch("?model=sha256%3A0000aaaa&hardware=synthetic-gpu-a");
    state = explorerReducer(state, { type: "nextPage", cursor: "Q3Vyc29yMQ" });
    state = explorerReducer(state, { type: "removeFilter", key: "model" });
    expect(state.applied).toEqual({ ...EMPTY_EXPLORER_FILTERS, model: "", hardware: "synthetic-gpu-a", method: "", workload: "" });
    expect(state.draft.model).toBe("");
    expect(state.cursor).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("does nothing when the removed filter was not active", () => {
    const state = explorerStateFromSearch("?hardware=synthetic-gpu-a");
    expect(explorerReducer(state, { type: "removeFilter", key: "workload" })).toBe(state);
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
    expect(navigated.applied).toEqual({ ...EMPTY_EXPLORER_FILTERS, model: "", hardware: "", method: "", workload: "" });
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
    expect(formatDuration(1234.6)).toBe("1.23");
  });

  it("marks failed measurement rows so a partial run is not read as clean", () => {
    expect(formatSampleCount(12, 0)).toBe("12");
    expect(formatSampleCount(12, 3)).toBe("12 (3 failed)");
  });


});



describe("discovery filters and sorting", () => {
  it("round-trips arbitrary text, numeric bounds and sorting and restores them on back", () => {
    const link = "?measurement=legacy&q=synthetic+search&vendor=unlisted+vendor&gpu=new+device&os=custom+os&runtime=engine&context_min=0&context_max=8192&gpu_layers_min=-1&sort=context_desc";
    const original = explorerStateFromSearch(link);
    expect(buildExplorerRequestPath({ filters: original.applied, cursor: null })).toContain("vendor=unlisted+vendor");
    expect(parseExplorerLocation(buildExplorerSearch({ filters: original.applied, cursor: null })).filters).toEqual(original.applied);
    let next = explorerReducer(original, { type: "nextPage", cursor: "page2" });
    next = explorerReducer(next, { type: "draft", key: "sort", value: "vram_desc" });
    next = explorerReducer(next, { type: "apply" });
    expect(next.cursor).toBeNull();
    expect(next.history).toEqual([]);
    expect(explorerReducer(next, { type: "location", search: link }).applied).toEqual(original.applied);
    expect(buildExplorerSearch({ filters: explorerReducer(next, { type: "reset" }).applied, cursor: null })).toBe("");
  });
  it.each(["NaN", "Infinity", "1.5", "1e3", "9007199254740992", "-1"])("refuses invalid context bounds %s without changing results", value => {
    const state = explorerReducer(explorerStateFromSearch("?measurement=legacy&model=synthetic"), { type: "draft", key: "context_min", value });
    expect(invalidExplorerRanges(state.draft)).toContain("context");
    expect(explorerReducer(state, { type: "apply" })).toBe(state);
  });
  it("validates paired ranges, accepts zero and the GPU layer sentinel", () => {
    expect(invalidExplorerRanges({ ...EMPTY_EXPLORER_FILTERS, context_min: "100", context_max: "99" })).toEqual(["context"]);
    expect(invalidExplorerRanges({ ...EMPTY_EXPLORER_FILTERS, context_min: "0", gpu_layers_min: "-1" })).toEqual([]);
  });
  it("suggestions honor other filters and use a separate query without paging or own filter", () => {
    const filters = { ...EMPTY_EXPLORER_FILTERS, measurement: "legacy", q: "global", vendor: "synthetic vendor", gpu: "typed", sort: "oldest", context_min: "128" };
    const params = new URLSearchParams(buildExplorerOptionsPath("gpu", "new text", filters).split("?")[1]);
    expect(Object.fromEntries(params)).toEqual({ measurement: "legacy", q: "global", vendor: "synthetic vendor", context_min: "128", field: "gpu", option_query: "new text" });
  });
});

describe("immediate result sorting", () => {
  it("keeps ordering out of narrowing conditions without dropping it from the shared view", () => {
    const ordered = explorerStateFromSearch("?sort=oldest");
    expect(hasActiveExplorerFilters(ordered.applied)).toBe(false);
    expect(activeExplorerFilters(ordered.applied)).toEqual([]);
    const draft = explorerReducer(ordered, { type: "draft", key: "q", value: "synthetic query" });
    const applied = explorerReducer(draft, { type: "apply" });
    expect(hasActiveExplorerFilters(applied.applied)).toBe(true);
    expect(activeExplorerFilters(applied.applied).map(filter => filter.key)).toEqual(["q"]);
    expect(new URLSearchParams(buildExplorerSearch({ filters: applied.applied, cursor: null })).get("sort")).toBe("oldest");
  });
  it("sorts applied results without submitting unfinished text or invalid ranges", () => {
    let state = explorerStateFromSearch("?measurement=legacy&vendor=synthetic&cursor=page2", [""]);
    state = explorerReducer(state, { type: "draft", key: "q", value: "unfinished query" });
    state = explorerReducer(state, { type: "draft", key: "context_min", value: "invalid" });
    const sorted = explorerReducer(state, { type: "sort", value: "context_desc" });
    expect(sorted.applied.vendor).toBe("synthetic");
    expect(sorted.applied.q).toBe("");
    expect(sorted.applied.context_min).toBe("");
    expect(sorted.applied.sort).toBe("context_desc");
    expect(sorted.draft.q).toBe("unfinished query");
    expect(sorted.draft.context_min).toBe("invalid");
    expect(sorted.draft.sort).toBe("context_desc");
    expect(sorted.cursor).toBeNull();
    expect(sorted.history).toEqual([]);
    expect(buildExplorerSearch({ filters: sorted.applied, cursor: null })).toContain("sort=context_desc");
    const restored = explorerReducer(sorted, { type: "location", search: "?measurement=legacy&vendor=synthetic&cursor=page2", history: [""] });
    expect(restored.applied.sort).toBe("");
    expect(restored.cursor).toBe("page2");
  });
  it("retains pagination for unchanged sorting and canonicalizes newest", () => {
    const state = explorerStateFromSearch("?sort=oldest&cursor=page2", [""]);
    expect(explorerReducer(state, { type: "sort", value: "oldest" })).toBe(state);
    const newest = explorerReducer(state, { type: "sort", value: "newest" });
    expect(buildExplorerSearch({ filters: newest.applied, cursor: newest.cursor })).toBe("");
  });
});

describe("configured input lengths", () => {
  it("shortens an exact multiple of 1024 and leaves every other length as measured", () => {
    expect(formatPromptLength(512)).toBe("512");
    expect(formatPromptLength(1024)).toBe("1K");
    expect(formatPromptLength(4096)).toBe("4K");
    expect(formatPromptLength(8192)).toBe("8K");
    expect(formatPromptLength(1500)).toBe("1500");
    expect(formatPromptLength(8704)).toBe("8704");
  });

  it("lists every reported length once, in ascending order", () => {
    expect(formatPromptLengths([8192, 512, 4096, 512])).toBe("512 · 4K · 8K");
    expect(formatPromptLengths([128])).toBe("128");
  });

  it("stays absent rather than standing in for the context the server allocated", () => {
    expect(formatPromptLengths(undefined)).toBeNull();
    expect(formatPromptLengths(null)).toBeNull();
    expect(formatPromptLengths([])).toBeNull();
    expect(formatPromptLengths([0, -1, Number.NaN, 1.5] as number[])).toBeNull();
  });

});

describe("serving point and condition links", () => {
  const descriptor = { target: "launch", scope: [], name: "batch", unit: "count", role: null };
  it("round-trips repeated typed conditions, canonicalizes order and deduplicates exact duplicates", () => {
    const a = JSON.stringify({ ...descriptor, op: "eq", value: false });
    const b = JSON.stringify({ ...descriptor, name: "split", op: "eq", value: [2, 1] });
    const params = new URLSearchParams();
    for (const value of [b, a, a]) params.append("setting", value);
    const location = parseExplorerLocation(params.toString());
    expect(location.filters.setting).toHaveLength(2);
    const canonical = buildExplorerSearch(location);
    const reverse = new URLSearchParams();
    for (const value of [a, b]) reverse.append("setting", value);
    expect(buildExplorerSearch(parseExplorerLocation(reverse.toString()))).toBe(canonical);
    expect(parseExplorerLocation(canonical)).toEqual(location);
  });
  it("keeps a complete historical byte/concurrency/cap tuple in its own scope and requires it before ranking output rate", () => {
    let state = explorerStateFromSearch("measurement=openai-chat-serving@1&runtime=sglang");
    expect(explorerReducer(state, { type: "sort", value: "output_rate_desc" })).toBe(state);
    state = explorerReducer(state, { type: "basisPoint", value: "b4096/c4/o128" });
    expect(explorerReducer(state, { type: "sort", value: "token_rate_desc" })).toBe(state);
    state = explorerReducer(state, { type: "sort", value: "output_rate_desc" });
    expect(state.applied).toMatchObject({ measurement: "openai-chat-serving@1", point_bytes: "4096", point_concurrency: "4", point_max_tokens: "128", point_tokens: "", sort: "output_rate_desc" });
    expect(parseExplorerLocation(buildExplorerSearch({ filters: state.applied, cursor: null })).filters).toEqual(state.applied);
    expect(explorerReducer(state, { type: "basisPoint", value: "" }).applied.sort).toBe("");
  });
  it("defaults to fixed output, accepts only preset output points and ranks them by exact token rate", () => {
    let state = explorerStateFromSearch("runtime=sglang");
    expect(state.applied.measurement).toBe("");
    expect(explorerReducer(state, { type: "basisPoint", value: "b4096/c4/o128" })).toBe(state);
    expect(explorerStateFromSearch("point_bytes=4096&point_concurrency=4&point_max_tokens=128&sort=token_rate_desc").applied).toMatchObject({ point_bytes: "", point_max_tokens: "", sort: "" });
    state = explorerReducer(state, { type: "basisPoint", value: "b4096/c4/o204800" });
    state = explorerReducer(state, { type: "sort", value: "token_rate_desc" });
    expect(state.applied).toMatchObject({ point_bytes: "4096", point_concurrency: "4", point_max_tokens: "204800", sort: "token_rate_desc" });
    expect(parseFilters(new URLSearchParams(buildExplorerSearch({ filters: state.applied, cursor: null })))).toMatchObject({ point_max_tokens: 204800, sort: "token_rate_desc" });
    // Changing scope drops a basis and sort chosen for another method.
    const changed = explorerReducer(state, { type: "draft", key: "measurement", value: "openai-chat-serving@1" });
    expect(changed.draft).toMatchObject({ measurement: "openai-chat-serving@1", point_bytes: "", point_max_tokens: "", sort: "" });
  });
  it("refuses byte/token mixing and never uses an old token value as input bytes", () => {
    const serving = explorerStateFromSearch("context_min=128");
    expect(invalidExplorerDraft(serving.draft)).toBe(true);
    expect(explorerReducer(serving, { type: "apply" })).toBe(serving);
    const legacy = explorerStateFromSearch("measurement=legacy&input_bytes_min=4096");
    expect(invalidExplorerDraft(legacy.draft)).toBe(true);
    const stale = explorerStateFromSearch("point_tokens=4096&point_concurrency=4");
    expect(stale.applied.point_bytes).toBe("");
    expect(stale.applied.point_concurrency).toBe("");
  });
  it("keeps pending option drafts when immediately changing the basis", () => {
    let state = explorerStateFromSearch("runtime=sglang");
    const pending = JSON.stringify({ _draft: { name: "batch", text: "-" } });
    state = explorerReducer(state, { type: "settings", value: [pending] });
    state = explorerReducer(state, { type: "basisPoint", value: "b4096/c4/o1024" });
    expect(state.draft.setting).toEqual([pending]);
    expect(state.applied.setting).toEqual([]);
  });
});

describe("whole encoded query boundaries", () => {
  it("keeps a valid near-limit first page, but refuses an oversized next page or facet without clearing the view", () => {
    const filters: ExplorerFilters = { ...EMPTY_EXPLORER_FILTERS, setting: Array.from({ length: 8 }, (_, index) => JSON.stringify({
      target: "launch", scope: [], name: `option${index}`, unit: null, role: null, op: "eq", value: "é".repeat(128),
    })) };
    // Fill ordinary, independently bounded text fields up to a real wire query
    // near 8192. The cursor and facet metadata must not get a separate allowance.
    for (const key of ["q", "model", "model_query", "publisher", "base_model", "model_repository", "model_revision", "gpu"] as const) {
      const size = buildExplorerRequestPath({ filters, cursor: null }).split("?")[1]!.length;
      const remaining = 8180 - size - key.length - 2;
      if (remaining > 0) filters[key] = "x".repeat(Math.min(120, remaining));
    }
    const first = buildExplorerRequestPath({ filters, cursor: null });
    expect(first.split("?")[1]!.length).toBeGreaterThan(8160);
    expect(isExplorerRequestWithinBounds(first)).toBe(true);
    expect(invalidExplorerDraft(filters)).toBe(false);
    const initial = explorerStateFromSearch("");
    const state = { ...initial, applied: filters, draft: filters, compare: [result("chosen")] };
    const cursor = "a".repeat(256);
    expect(isExplorerRequestWithinBounds(buildExplorerRequestPath({ filters, cursor }))).toBe(false);
    const next = explorerReducer(state, { type: "nextPage", cursor });
    expect(next).toBe(state);
    expect(next.cursor).toBeNull();
    expect(next.applied.setting).toHaveLength(8);
    expect(next.compare[0]?.public_id).toBe("chosen");
    expect(isExplorerRequestWithinBounds(buildExplorerOptionsPath("runtime", "suggestions".repeat(10), filters))).toBe(false);
    expect(isExplorerRequestWithinBounds(`/v1/benchmark-runs?${"a".repeat(8192)}`)).toBe(true);
    expect(isExplorerRequestWithinBounds(`/v1/benchmark-runs?${"a".repeat(8193)}`)).toBe(false);
  });
});

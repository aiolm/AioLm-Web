import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/client";
import en from "@/i18n/messages/benchmark/en";
import { BenchmarkExplorerFilters } from "@/components/benchmark-explorer-filters";
import { EMPTY_EXPLORER_FILTERS, EXPLORER_FILTER_KEYS, explorerReducer, explorerStateFromSearch } from "@/components/benchmark-explorer-state";

function renderFilters(search = "") {
  return renderToStaticMarkup(<I18nProvider locale="en" messages={en}><BenchmarkExplorerFilters
    draft={explorerStateFromSearch(search).draft} onChange={() => {}}
    actions={<button type="submit">Apply filters</button>}
  /></I18nProvider>);
}

describe("sidebar filter disclosures", () => {
  it("renders every sidebar field once and carries legacy and result controls separately", () => {
    const html = renderFilters();
    const carriedKeys = ["hardware", "q", "model", "point_tokens", "point_concurrency", "point_only"];
    const names = [...html.matchAll(/name="([^"]+)"/g)].map(match => match[1]);
    for (const key of EXPLORER_FILTER_KEYS.filter(key => key !== "sort")) {
      expect(names.filter(name => name === key), key).toHaveLength(1);
    }
    for (const key of carriedKeys) {
      expect(html, key).toContain('type="hidden" name="' + key + '"');
    }
    expect(names).not.toContain('sort');
  });
  it("reveals invalid numeric ranges and associates their errors with the fields", () => {
    const draft = { ...EMPTY_EXPLORER_FILTERS, cores_min: "8", cores_max: "4", threads_min: "invalid" };
    const html = renderToStaticMarkup(<I18nProvider locale="en" messages={en}><BenchmarkExplorerFilters draft={draft} onChange={() => {}} /></I18nProvider>);
    expect(html).toContain('aria-invalid="true" aria-describedby="error-cores"');
    expect(html).toContain('aria-invalid="true" aria-describedby="error-threads"');
  });
  it("keeps results stable while editing then applies or clears the complete draft", () => {
    let state = explorerStateFromSearch("?vendor=synthetic&cursor=page2", [""]);
    state = explorerReducer(state, { type: "draft", key: "os", value: "custom os" });
    expect(state.applied.os).toBe("");
    expect(state.cursor).toBe("page2");
    const applied = explorerReducer(state, { type: "apply" });
    expect(applied.applied.os).toBe("custom os");
    expect(applied.cursor).toBeNull();
    const reset = explorerReducer(state, { type: "reset" });
    expect(reset.draft).toEqual(EMPTY_EXPLORER_FILTERS);
    expect(reset.applied).toEqual(EMPTY_EXPLORER_FILTERS);
    expect(reset.history).toEqual([]);
  });
});

it("returns a shared cursor view to the first page without clearing filters or drafts", () => {
  let state = explorerStateFromSearch("?vendor=synthetic&cursor=last-page");
  state = explorerReducer(state, { type: "draft", key: "q", value: "pending search" });
  const first = explorerReducer(state, { type: "firstPage" });
  expect(first.cursor).toBeNull();
  expect(first.history).toEqual([]);
  expect(first.applied.vendor).toBe("synthetic");
  expect(first.draft.q).toBe("pending search");
});

describe("stable discovery layout", () => {
  it("only references mounted suggestions and connects range explanations to both bounds", () => {
    const html = renderFilters();
    expect(html).not.toContain("aria-controls=");
    expect(html.match(/aria-describedby="hint-context"/g)).toHaveLength(2);
    expect(html).toContain('id="hint-context"');
    const invalid = renderFilters("?context_min=100&context_max=50");
    expect(invalid.match(/aria-describedby="hint-context error-context"/g)).toHaveLength(2);
  });
});

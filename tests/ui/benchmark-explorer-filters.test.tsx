import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { createTranslator } from "@/i18n/translate";
import en from "@/i18n/messages/benchmark/en";
import { BenchmarkExplorerFilters } from "@/components/benchmark-explorer-filters";
import { EMPTY_EXPLORER_FILTERS, EXPLORER_FILTER_KEYS, EXPLORER_RANGE_HINTS, explorerReducer, explorerStateFromSearch } from "@/components/benchmark-explorer-state";

function renderFilters(search = "") {
  return renderToStaticMarkup(<I18nProvider locale="en" messages={en}><BenchmarkExplorerFilters
    draft={explorerStateFromSearch(search).draft} onChange={() => {}}
    actions={<button type="submit">Apply filters</button>}
  /></I18nProvider>);
}

describe("sidebar filter disclosures", () => {
  it("keeps common conditions always visible and only collapses advanced settings", () => {
    const html = renderFilters();
    const groups = html.split('<section class="explorer-filter-group"').slice(1);
    expect(groups).toHaveLength(3);
    const visible = groups.map(group => group.split('<details')[0]).join('');
    expect([...visible.matchAll(/name="([^"]+)"/g)].map(match => match[1])).toEqual(["model_query", "quantization", "vendor", "gpu", "vram_min", "vram_max", "os"]);
    expect(html.match(/<details class="explorer-secondary-filters">/g)).toHaveLength(4);
    expect(html).toContain('<details class="explorer-secondary-filters"><summary><span>Measurement settings');
    expect(html.match(/type="submit"/g)).toHaveLength(1);
  });
  it("renders every sidebar field once and carries legacy and result controls separately", () => {
    const html = renderFilters();
    const carriedKeys = ["hardware", "q", "model", "point_tokens", "point_concurrency", "point_only"];
    const names = [...html.matchAll(/name="([^"]+)"/g)].map(match => match[1]);
    for (const key of EXPLORER_FILTER_KEYS.filter(key => key !== "sort")) {
      expect(names.filter(name => name === key), key).toHaveLength(1);
    }
    for (const key of carriedKeys) {
      expect(html, key).toContain('type="hidden" name="' + key + '"');
      expect(html.lastIndexOf('</details>')).toBeLessThan(html.indexOf('name="' + key + '"'));
    }
    expect(names).not.toContain('sort');
  });
  it("opens linked secondary and measurement conditions and counts each range once", () => {
    const html = renderFilters("?hardware=synthetic-gpu&os=synthetic&runtime=custom&context_min=128&context_max=4096");
    expect(html).toContain('class="explorer-secondary-filters" open=""');
    expect(html).toContain('class="explorer-secondary-filters" open=""><summary><span>Measurement settings</span><span class="explorer-filter-count">1 selected</span>');
    expect(html).toContain('Execution environment<span class="explorer-filter-count">2</span>');
    expect(html).toContain('value="synthetic"');
    expect(html).toContain('type="hidden" name="hardware" value="synthetic-gpu"');
    expect(renderFilters("?hardware=synthetic-gpu")).not.toContain('explorer-filter-count');
  });
  it("reveals invalid numeric ranges and associates their errors with the fields", () => {
    const draft = { ...EMPTY_EXPLORER_FILTERS, cores_min: "8", cores_max: "4", threads_min: "invalid" };
    const html = renderToStaticMarkup(<I18nProvider locale="en" messages={en}><BenchmarkExplorerFilters draft={draft} onChange={() => {}} /></I18nProvider>);
    expect(html).toContain('aria-invalid="true" aria-describedby="error-cores"');
    expect(html).toContain('aria-invalid="true" aria-describedby="error-threads"');
    expect(html).toContain('class="explorer-secondary-filters" open=""');
    expect(html).toContain('class="explorer-secondary-filters" open=""><summary><span>Measurement settings</span>');
    expect(html).toContain('Check numeric ranges before applying filters.');
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
  it("names the input length range as the largest configured input, not the allocated context", () => {
    const html = renderFilters();
    const hintKey = `benchmark.${EXPLORER_RANGE_HINTS.context}`;
    expect(EXPLORER_RANGE_HINTS.context).toContain("largest input length");
    expect(en).toHaveProperty(hintKey);
    expect(html).toContain("Max input length (tokens)");
    expect(html).toContain(createTranslator(en)(hintKey));
    // The address keys stay the ones already shared in links.
    expect(html).toContain('name="context_min"');
    expect(html).toContain('name="context_max"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { createTranslator } from "@/i18n/translate";
import en from "@/i18n/messages/benchmark/en";
import { BenchmarkExplorerFilters } from "@/components/benchmark-explorer-filters";
import { EMPTY_EXPLORER_FILTERS, EXPLORER_FILTER_KEYS, EXPLORER_RANGE_HINTS, explorerReducer, explorerStateFromSearch } from "@/components/benchmark-explorer-state";

function renderFilters(search = "", pending = false) {
  return renderToStaticMarkup(<I18nProvider locale="en" messages={en}><BenchmarkExplorerFilters
    draft={explorerStateFromSearch(search).draft} pending={pending} onChange={() => {}}
    actions={<><button type="submit">Apply filters</button><button type="button">Clear filters</button></>}
  /></I18nProvider>);
}

describe("compact filter disclosure", () => {
  it("starts with search and just vendor/GPU discovery, with apply beside search", () => {
    const html = renderFilters();
    const visible = html.split('<details')[0];
    expect([...visible.matchAll(/name="([^"]+)"/g)].map(match => match[1])).toEqual(["q", "vendor", "gpu"]);
    expect(visible).toContain('type="submit"');
    expect(visible.indexOf('type="submit"')).toBeLessThan(visible.indexOf('name="vendor"'));
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toContain('<details class="explorer-more-filters">');
    expect(html).toContain('<summary>More filters');
    expect(html).not.toContain(' open=');
  });
  it("retains every advanced field inside one native disclosure with semantic groups", () => {
    const advanced = renderFilters().split('<details')[1];
    for (const key of EXPLORER_FILTER_KEYS.filter(key => !["q", "vendor", "gpu", "sort"].includes(key))) {
      expect(advanced, key).toContain('name="' + key + '"');
    }
    expect(advanced.match(/class="explorer-advanced-group"/g)).toHaveLength(4);
    // Model identity leads the advanced panel; the primary row is untouched by it.
    expect(advanced.indexOf('name="publisher"')).toBeLessThan(advanced.indexOf('name="hardware"'));
    expect(advanced).toContain('type="submit"');
    expect(advanced).not.toContain('<details');
  });
  it("keeps linked advanced values collapsed and shows their count and unapplied status", () => {
    const html = renderFilters("?os=synthetic&context_min=128", true);
    expect(html).not.toContain(' open=');
    expect(html).toContain('explorer-filter-count">2</span>');
    expect(html).toContain('value="synthetic"');
    expect(html).toContain('Changes not applied. Select Search to update results.');
    expect(renderFilters()).not.toContain('Changes not applied.');
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
  it("keeps the unapplied-changes line after the disclosure, where it cannot move the trigger", () => {
    const pending = renderFilters("", true);
    expect(pending.indexOf("</details>")).toBeLessThan(pending.indexOf("explorer-draft-status"));
    expect(pending).toContain("Changes not applied.");
    // The line is always rendered, so turning the message on and off changes no structure.
    expect(renderFilters()).toContain('<div class="explorer-draft-status" role="status"></div>');
  });

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

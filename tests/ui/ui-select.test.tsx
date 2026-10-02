import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UiSelect, committedValue, initialHighlight, selectKeyAction, type SelectKeyState, type UiSelectOption } from "@/components/ui-select";

const options: UiSelectOption[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "fastest", label: "Fastest first", disabled: true },
  { value: "vram", label: "VRAM: low to high" },
  { value: "vram_desc", label: "VRAM: high to low" },
  { value: "slowest", label: "Slowest first", disabled: true },
];
const closed = (selected = 0): SelectKeyState => ({ open: false, highlighted: -1, selected, typeahead: "" });
const open = (highlighted: number, selected = 0): SelectKeyState => ({ open: true, highlighted, selected, typeahead: "" });

describe("select keyboard behavior", () => {
  it("opens from the closed trigger at the committed value and consumes Enter so forms are not submitted", () => {
    for (const key of ["Enter", " ", "ArrowDown", "ArrowUp"]) expect(selectKeyAction(key, closed(3), options), key).toEqual({ type: "open", highlighted: 3 });
    expect(selectKeyAction("Home", closed(3), options)).toEqual({ type: "open", highlighted: 0 });
    // The last option is disabled, so End lands on the last enabled one.
    expect(selectKeyAction("End", closed(0), options)).toEqual({ type: "open", highlighted: 4 });
  });
  it("seeds the highlight past a disabled committed value", () => {
    expect(initialHighlight(options, 2)).toBe(3);
    expect(initialHighlight(options, -1)).toBe(0);
    expect(selectKeyAction("ArrowDown", closed(2), options)).toEqual({ type: "open", highlighted: 3 });
  });
  it("moves over enabled options with arrows, Home and End, wrapping at the ends", () => {
    expect(selectKeyAction("ArrowDown", open(1), options)).toEqual({ type: "highlight", index: 3 });
    expect(selectKeyAction("ArrowUp", open(3), options)).toEqual({ type: "highlight", index: 1 });
    expect(selectKeyAction("ArrowDown", open(4), options)).toEqual({ type: "highlight", index: 0 });
    expect(selectKeyAction("ArrowUp", open(0), options)).toEqual({ type: "highlight", index: 4 });
    expect(selectKeyAction("ArrowDown", open(-1), options)).toEqual({ type: "highlight", index: 0 });
    expect(selectKeyAction("Home", open(4), options)).toEqual({ type: "highlight", index: 0 });
    expect(selectKeyAction("End", open(0), options)).toEqual({ type: "highlight", index: 4 });
  });
  it("commits the highlighted option with Enter or Space", () => {
    expect(selectKeyAction("Enter", open(3), options)).toEqual({ type: "commit", index: 3 });
    expect(selectKeyAction(" ", open(1), options)).toEqual({ type: "commit", index: 1 });
  });
  it("closes on Escape only while open, and lets Tab move focus", () => {
    expect(selectKeyAction("Escape", open(1), options)).toEqual({ type: "close", handled: true });
    // A closed select must not swallow Escape meant for the page.
    expect(selectKeyAction("Escape", closed(), options)).toEqual({ type: "none" });
    expect(selectKeyAction("Tab", open(1), options)).toEqual({ type: "close", handled: false });
    expect(selectKeyAction("Tab", closed(), options)).toEqual({ type: "none" });
  });
  it("jumps by typed label prefix, skipping disabled options", () => {
    // Closed, typing commits directly like a native select.
    expect(selectKeyAction("o", closed(), options)).toEqual({ type: "commit", index: 1, typeahead: "o" });
    expect(selectKeyAction("v", open(0), options)).toEqual({ type: "highlight", index: 3, typeahead: "v" });
    // Repeating a letter cycles through matches.
    expect(selectKeyAction("v", open(3), options)).toEqual({ type: "highlight", index: 4, typeahead: "v" });
    // Buffered characters narrow the match; "fastest" and "slowest" are disabled.
    expect(selectKeyAction("h", { ...open(0), typeahead: "vram: " }, options)).toEqual({ type: "highlight", index: 4, typeahead: "vram: h" });
    expect(selectKeyAction("f", open(0), options)).toEqual({ type: "highlight", index: 0, typeahead: "f" });
    expect(selectKeyAction("s", closed(), options)).toEqual({ type: "highlight", index: -1, typeahead: "s" });
  });
  it("ignores shortcuts and unrelated keys", () => {
    expect(selectKeyAction("a", closed(), options, true)).toEqual({ type: "none" });
    expect(selectKeyAction("PageDown", open(0), options)).toEqual({ type: "none" });
    expect(selectKeyAction("ArrowLeft", closed(), options)).toEqual({ type: "none" });
  });
  it("reports a change only for a different enabled value", () => {
    expect(committedValue(options, 1, "newest")).toBe("oldest");
    expect(committedValue(options, 0, "newest")).toBeNull();
    expect(committedValue(options, 2, "newest")).toBeNull();
    expect(committedValue(options, -1, "newest")).toBeNull();
  });
});

describe("select markup", () => {
  const render = (props: Partial<Parameters<typeof UiSelect>[0]> = {}) => renderToStaticMarkup(<UiSelect id="sort" name="sort" form="filters" labelledBy="sort-label" describedBy="sort-hint" value="oldest" options={options} onChange={() => {}} {...props} />);
  it("is a labelled, collapsed select-only combobox that never submits a form itself", () => {
    const html = render();
    expect(html).toContain('<button id="sort" type="button" class="ui-select-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-labelledby="sort-label" aria-describedby="sort-hint">');
    expect(html).toContain('<span class="ui-select-value">Oldest first</span>');
    expect(html).not.toContain("aria-activedescendant");
    expect(html).not.toContain("aria-controls");
    expect(html).not.toContain('role="listbox"');
  });
  it("submits its value through a hidden field tied to the named form", () => {
    expect(render()).toContain('<input type="hidden" form="filters" name="sort" value="oldest"/>');
    expect(render({ name: undefined })).not.toContain("<input");
  });
  it("disables both the trigger and the submitted value", () => {
    const html = render({ disabled: true });
    expect(html).toContain('<input type="hidden" form="filters" disabled="" name="sort" value="oldest"/>');
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
  it("keeps the language of each label", () => {
    const html = renderToStaticMarkup(<UiSelect value="ko" options={[{ value: "en", label: "English", lang: "en" }, { value: "ko", label: "한국어", lang: "ko" }]} onChange={() => {}} />);
    expect(html).toContain('<span class="ui-select-value" lang="ko">한국어</span>');
  });
});

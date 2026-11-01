import { describe, expect, it } from "vitest";
import { EMPTY_EXPLORER_FILTERS, EXPLORER_INCOMPLETE_MESSAGE, buildExplorerOptionsPath, buildExplorerSettingOptionsPath, explorerOptionsRequestError, explorerReducer, explorerStateFromSearch, invalidExplorerDraft } from "@/components/benchmark-explorer-state";
import { canonicalSettingCondition, type SettingCondition } from "@/lib/benchmark-discovery";

const descriptor = { target: "launch", scope: [], name: "batch", unit: "count", role: null } as const;
const condition = (value: number): Extract<SettingCondition, { op: "eq" }> => ({ ...descriptor, scope: [], op: "eq", value });

describe("condition editing and suggestions", () => {
  it("excludes only the editing row, keeping same-descriptor contradictions as constraints", () => {
    const filters = { ...EMPTY_EXPLORER_FILTERS, runtime: "sglang", setting: [condition(2), condition(64), { ...condition(0), name: "threads", value: 8 }].map(canonicalSettingCondition) };
    const path = buildExplorerSettingOptionsPath("setting_value", filters, 0, { ...descriptor, scope: [] });
    const query = new URL(path, "https://example.test").searchParams;
    expect(query.get("runtime")).toBe("sglang");
    expect(query.getAll("setting").map(value => JSON.parse(value).value)).toEqual([64, 8]);
    expect(JSON.parse(query.get("option_setting")!)).toEqual(descriptor);
  });
  it("pauses suggestions with incomplete remaining conditions instead of sending invalid draft JSON", () => {
    const filters = { ...EMPTY_EXPLORER_FILTERS, setting: ["", canonicalSettingCondition(condition(64))] };
    expect(explorerOptionsRequestError(buildExplorerOptionsPath("runtime", "", filters))).toBe(EXPLORER_INCOMPLETE_MESSAGE);
    expect(explorerOptionsRequestError(buildExplorerSettingOptionsPath("setting", filters, 1))).toBe(EXPLORER_INCOMPLETE_MESSAGE);
    expect(explorerOptionsRequestError(buildExplorerSettingOptionsPath("setting", filters, 0))).toBeUndefined();
  });
  it("blocks incomplete typed drafts and leaves applied data and paging unchanged", () => {
    const state = explorerStateFromSearch("runtime=sglang&cursor=page2", [""]);
    const draft = explorerReducer(state, { type: "settings", value: ['{"_draft":{"name":"batch","valueType":"number","text":"-"}}'] });
    expect(invalidExplorerDraft(draft.draft)).toBe(true);
    expect(explorerReducer(draft, { type: "apply" })).toBe(draft);
    expect(draft.cursor).toBe("page2");
    expect(draft.applied.setting).toEqual([]);
  });
  it("does not drop conditions when changing engines and clears only one applied condition chip", () => {
    let state = explorerStateFromSearch("");
    state = explorerReducer(state, { type: "settings", value: [condition(2), condition(64)].map(canonicalSettingCondition) });
    state = explorerReducer(state, { type: "draft", key: "runtime", value: "unlisted-engine" });
    state = explorerReducer(state, { type: "apply" });
    expect(state.applied.setting).toHaveLength(2);
    const next = explorerReducer(state, { type: "removeSetting", index: 0 });
    expect(next.applied.runtime).toBe("unlisted-engine");
    expect(next.applied.setting).toHaveLength(1);
    expect(JSON.parse(next.applied.setting[0]!).value).toBe(64);
  });
  it("returns a rejected cursor view to page one without discarding conditions or pending edits", () => {
    let state = explorerStateFromSearch("runtime=sglang&cursor=obsolete", [""]);
    state = explorerReducer(state, { type: "draft", key: "q", value: "pending" });
    const first = explorerReducer(state, { type: "firstPage" });
    expect(first.cursor).toBeNull();
    expect(first.history).toEqual([]);
    expect(first.applied.runtime).toBe("sglang");
    expect(first.draft.q).toBe("pending");
  });
});

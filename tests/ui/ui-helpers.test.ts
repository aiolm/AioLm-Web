import common from "@/i18n/messages/common/en";
import management from "@/i18n/messages/management/en";
import { createTranslator } from "@/i18n/translate";
import { describe, expect, it } from "vitest";
import {
  BROWSER_HISTORY_LIMIT,
  normalizeBrowserFilters,
  popBrowserHistory,
  pushBrowserHistory,
  sameBrowserFilters,
} from "@/components/benchmark-browser";
import { getRowsPageCount, getRowsSliceIndices, ROWS_VISIBLE_PAGE_SIZE } from "@/components/benchmark-detail";
import { displayText } from "@/components/benchmark-detail-format";
import { shouldAdoptServerDescription } from "@/components/management-panel";
import { friendlyReportError } from "@/components/report-form";
import { friendlyVerifyError } from "@/components/verify-panel";
import { truncateToCodePoints } from "@/components/ui";

describe("browser draft/applied filters", () => {
  it("trims filter text before applying", () => {
    expect(normalizeBrowserFilters({ model: "  llama  ", hardware: "", method: " x ", workload: "" })).toEqual({
      model: "llama",
      hardware: "",
      method: "x",
      workload: "",
    });
  });

  it("detects identical applied filters so paging state can be preserved", () => {
    expect(sameBrowserFilters({ model: "a", hardware: "", method: "", workload: "" }, { model: "a", hardware: "", method: "", workload: "" })).toBe(true);
    expect(sameBrowserFilters({ model: "a", hardware: "", method: "", workload: "" }, { model: "b", hardware: "", method: "", workload: "" })).toBe(false);
  });
});

describe("bounded browser history", () => {
  it("keeps previous pages bounded", () => {
    let history: string[] = [];
    for (let i = 0; i < BROWSER_HISTORY_LIMIT + 5; i += 1) history = pushBrowserHistory(history, `c${i}`);
    expect(history.length).toBe(BROWSER_HISTORY_LIMIT);
    expect(history[history.length - 1]).toBe(`c${BROWSER_HISTORY_LIMIT + 4}`);
  });

  it("restores the first page cursor as null", () => {
    const history = pushBrowserHistory([], null);
    const { previous, rest } = popBrowserHistory(history);
    expect(previous).toBeNull();
    expect(rest).toEqual([]);
  });

  it("pops the most recent cursor", () => {
    const { previous, rest } = popBrowserHistory(["", "abc"]);
    expect(previous).toBe("abc");
    expect(rest).toEqual([""]);
  });
});

describe("bounded measurement paging", () => {
  it("keeps the visible DOM page small", () => {
    expect(ROWS_VISIBLE_PAGE_SIZE).toBeLessThanOrEqual(100);
  });

  it("counts visible pages for every loaded row", () => {
    expect(getRowsPageCount(0)).toBe(0);
    expect(getRowsPageCount(50)).toBe(1);
    expect(getRowsPageCount(65)).toBe(2);
    expect(getRowsPageCount(10000, 50)).toBe(200);
  });

  it("slices later loaded rows into view without rendering everything", () => {
    expect(getRowsSliceIndices(0, 50, 65)).toEqual({ start: 0, end: 50 });
    expect(getRowsSliceIndices(1, 50, 65)).toEqual({ start: 50, end: 65 });
    expect(getRowsSliceIndices(5, 50, 65)).toEqual({ start: 65, end: 65 });
  });
});

describe("explicit display values", () => {
  it("marks missing values as unknown", () => {
    expect(displayText(null)).toBe("Unknown");
    expect(displayText(undefined)).toBe("Unknown");
    expect(displayText("")).toBe("Unknown");
    expect(displayText("   ")).toBe("Unknown");
    expect(displayText("synthetic-os")).toBe("synthetic-os");
    expect(displayText(0)).toBe("0");
  });
});

describe("management draft adoption", () => {
  it("preserves an intentionally empty unsaved draft", () => {
    expect(shouldAdoptServerDescription(true, "b1", "b1")).toBe(false);
  });

  it("adopts the server text when nothing is dirty", () => {
    expect(shouldAdoptServerDescription(false, "b1", "b1")).toBe(true);
  });

  it("resets the draft when a different record opens", () => {
    expect(shouldAdoptServerDescription(true, "b1", "b2")).toBe(true);
    expect(shouldAdoptServerDescription(false, null, "b2")).toBe(true);
  });
});

describe("friendly form errors", () => {
  const t = createTranslator({ ...common, ...management });
  it("explains report failures without technical codes", () => {
    expect(friendlyReportError(404, "not_found", t)).toMatch(/no longer available/i);
    expect(friendlyReportError(403, "verification_required", t)).toMatch(/verification/i);
    expect(friendlyReportError(null, null, t)).toMatch(/connection/i);
    expect(friendlyReportError(429, "rate_limited", t)).toMatch(/too many/i);
  });

  it("explains verification failures including expiry", () => {
    expect(friendlyVerifyError(410, "verification_expired", t)).toMatch(/expired/i);
    expect(friendlyVerifyError(404, "not_found", t)).toMatch(/not found/i);
    expect(friendlyVerifyError(null, null, t)).toMatch(/try again/i);
  });
});

describe("markdown length guard", () => {
  it("truncates by Unicode codepoints, preserving emoji", () => {
    const text = `a${"🧪".repeat(10)}b`;
    expect(Array.from(text).length).toBe(12);
    expect(truncateToCodePoints(text, 5)).toBe(`a${"🧪".repeat(4)}`);
    expect(truncateToCodePoints("hello", 4000)).toBe("hello");
    expect(Array.from(truncateToCodePoints(`x`.repeat(5000), 4000)).length).toBe(4000);
  });
});

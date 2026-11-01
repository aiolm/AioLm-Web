import { describe, expect, it } from "vitest";
import { getRowsPageCount, getRowsSliceIndices } from "@/components/benchmark-detail";
import { shouldAdoptServerDescription } from "@/components/management-panel";
import { truncateToCodePoints } from "@/components/ui";


describe("bounded measurement paging", () => {

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


describe("markdown length guard", () => {
  it("truncates by Unicode codepoints, preserving emoji", () => {
    const text = `a${"🧪".repeat(10)}b`;
    expect(Array.from(text).length).toBe(12);
    expect(truncateToCodePoints(text, 5)).toBe(`a${"🧪".repeat(4)}`);
    expect(truncateToCodePoints("hello", 4000)).toBe("hello");
    expect(Array.from(truncateToCodePoints(`x`.repeat(5000), 4000)).length).toBe(4000);
  });
});

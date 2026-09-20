import { describe, expect, it } from "vitest";
import {
  canApplyRowsResult,
  isStaleRowsGeneration,
} from "@/components/benchmark-detail";
import {
  canEditManagement,
  isStaleSessionRestore,
} from "@/components/management-panel";
import { isAbortError } from "@/components/ui";

describe("rows request generations", () => {
  it("marks responses from a previous publicId as stale", () => {
    expect(isStaleRowsGeneration(1, 2)).toBe(true);
    expect(isStaleRowsGeneration(2, 2)).toBe(false);
  });

  it("applies rows only for the current generation while mounted and not aborted", () => {
    expect(
      canApplyRowsResult({ mounted: true, requestGeneration: 3, currentGeneration: 3, aborted: false }),
    ).toBe(true);
  });

  it("discards stale generations so an old response cannot overwrite the new result", () => {
    expect(
      canApplyRowsResult({ mounted: true, requestGeneration: 3, currentGeneration: 4, aborted: false }),
    ).toBe(false);
  });

  it("discards rows continuations after unmount or abort", () => {
    expect(
      canApplyRowsResult({ mounted: false, requestGeneration: 4, currentGeneration: 4, aborted: false }),
    ).toBe(false);
    expect(
      canApplyRowsResult({ mounted: true, requestGeneration: 4, currentGeneration: 4, aborted: true }),
    ).toBe(false);
  });

  it("recognizes abort errors so aborted fetches stay silent", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("restored management session stays read-only and stale-safe", () => {
  it("blocks edits until a fresh recovery code provides permission", () => {
    expect(canEditManagement(false, null)).toBe(false);
    expect(canEditManagement(true, null)).toBe(false);
    expect(canEditManagement(true, "csrf-token")).toBe(true);
    expect(canEditManagement(false, "csrf-token")).toBe(false);
  });

  it("discards a slow restore once explicit session work begins", () => {
    expect(isStaleSessionRestore(0, 0)).toBe(false);
    expect(isStaleSessionRestore(0, 1)).toBe(true);
  });
});

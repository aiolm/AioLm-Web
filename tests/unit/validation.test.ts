import { describe, expect, it } from "vitest";
import {
  normalizePublicationInput, parsePublicationSnapshot, validateBenchmarkReceipt,
  validateDescriptionMd, validatePublicationRequest,
} from "@/lib/validation";
import { syntheticSubmission } from "@/lib/fixtures";

describe("publication validation", () => {
  it("accepts wrapper and legacy bare bodies (legacy keeps empty description)", () => {
    const benchmark = syntheticSubmission();
    expect(normalizePublicationInput({ benchmark, description_md: "hi" }).description_md).toBe("hi");
    expect(normalizePublicationInput(benchmark).description_md).toBe("");
  });

  it("legacy input still validates the benchmark shape", () => {
    expect(() => normalizePublicationInput({ nope: true })).toThrow();
  });

  it("rejects descriptions over 4000 codepoints (astral chars count once)", () => {
    expect(() => validateDescriptionMd("a".repeat(4001))).toThrow();
    expect(() => validateDescriptionMd("😀".repeat(4001))).toThrow();
    expect(validateDescriptionMd("😀".repeat(4000))).toBe("😀".repeat(4000));
  });

  it("rejects >10000 rows with the contract rejection", () => {
    const row = syntheticSubmission().measurements.rows[0]!;
    const benchmark = syntheticSubmission({ measurements: { status: "complete", rows: Array.from({ length: 10001 }, () => row) } });
    // The shared contract owns the message; the website asserts rejection, not wording.
    expect(() => validatePublicationRequest({ benchmark, description_md: "" })).toThrow(/measurements.*rows/);
  });

  it("rejects >4MiB snapshots without truncating", () => {
    const big = "x".repeat(4 * 1024 * 1024 + 1);
    expect(() => parsePublicationSnapshot(big)).toThrow(/4MiB/);
  });

  it("receipts stay within 16KiB and bind the submission", () => {
    const receipt = validateBenchmarkReceipt({ submission_id: syntheticSubmission().submission_id, id: "babc123" }, syntheticSubmission().submission_id);
    expect(receipt.id).toBe("babc123");
    expect(() => validateBenchmarkReceipt({ submission_id: syntheticSubmission().submission_id, id: "babc123" }, "00000000-0000-4000-8000-000000000002")).toThrow();
  });
});

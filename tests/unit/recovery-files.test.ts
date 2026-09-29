import { describe, expect, it, vi } from "vitest";
import { encodeRecoveryCode, RECOVERY_FIXTURE, RECOVERY_MAX_FILE_BYTES } from "@/lib/recovery";
import { readRecoveryFiles, type RecoveryFileLike } from "@/lib/recovery-files";

const ORIGIN = RECOVERY_FIXTURE.origin;
const OTHER_SUBMISSION = "00000000-0000-4000-8000-000000000002";

function file(name: string, content: string, size = new TextEncoder().encode(content).length): RecoveryFileLike & { text: ReturnType<typeof vi.fn> } {
  return { name, size, lastModified: Date.UTC(2026, 8, 1), text: vi.fn(async () => content) };
}
const code = (overrides: Partial<typeof RECOVERY_FIXTURE> = {}): string => encodeRecoveryCode({ ...RECOVERY_FIXTURE, ...overrides });

describe("picked recovery files", () => {
  it("accepts valid files for this service, trimming surrounding whitespace", async () => {
    const entries = await readRecoveryFiles([file("aiolm-recovery-1.txt", `\n${code()}\r\n`)], `${ORIGIN}/`);
    expect(entries).toEqual([{
      key: "0:aiolm-recovery-1.txt", name: "aiolm-recovery-1.txt", savedAt: Date.UTC(2026, 8, 1),
      status: "ready", submissionId: RECOVERY_FIXTURE.submission_id, code: code(), publicId: null,
    }]);
  });

  it("classifies malformed, oversized, foreign and duplicate files without exposing their codes", async () => {
    const oversized = file("big.txt", code(), RECOVERY_MAX_FILE_BYTES + 1);
    const entries = await readRecoveryFiles([
      file("a.txt", code()),
      file("notes.txt", "not a recovery code"),
      oversized,
      file("other.txt", code({ origin: "https://elsewhere.example.test" })),
      file("copy.txt", code()),
      file("b.txt", code({ submission_id: OTHER_SUBMISSION })),
    ], ORIGIN);
    expect(entries.map((e) => [e.name, e.status])).toEqual([
      ["a.txt", "ready"], ["notes.txt", "invalid"], ["big.txt", "too_large"],
      ["other.txt", "wrong_service"], ["copy.txt", "duplicate"], ["b.txt", "ready"],
    ]);
    expect(oversized.text).not.toHaveBeenCalled();
    for (const entry of entries.filter((e) => e.status !== "ready")) expect(entry.code).toBeNull();
  });

  it("appends to an existing list and dedupes against it", async () => {
    const first = await readRecoveryFiles([file("a.txt", code())], ORIGIN);
    const next = await readRecoveryFiles([file("a-again.txt", code()), file("b.txt", code({ submission_id: OTHER_SUBMISSION }))], ORIGIN, first);
    expect(next.map((e) => [e.key, e.status])).toEqual([["0:a.txt", "ready"], ["1:a-again.txt", "duplicate"], ["2:b.txt", "ready"]]);
  });

  it("allows a file again once its earlier entry was refused by the service", async () => {
    const [refused] = await readRecoveryFiles([file("a.txt", code())], ORIGIN);
    const next = await readRecoveryFiles([file("a.txt", code())], ORIGIN, [{ ...refused!, status: "rejected", code: null }]);
    expect(next[1]!.status).toBe("ready");
  });

  it("treats a file that cannot be read as invalid", async () => {
    const broken: RecoveryFileLike = { name: "x.txt", size: 10, lastModified: 0, text: async () => { throw new Error("unreadable"); } };
    expect((await readRecoveryFiles([broken], ORIGIN))[0]!.status).toBe("invalid");
  });
});

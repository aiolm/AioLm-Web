import { beforeEach, describe, expect, it } from "vitest";
import { quotaKeyForIp } from "@/lib/ip";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { freshStore, setupTestEnv } from "./helpers";

setupTestEnv();

describe("quotas", () => {
  let store: InMemoryBenchmarkStore;
  beforeEach(() => { store = freshStore(); });

  it("grants under the limit and blocks at it, atomically", async () => {
    for (let i = 0; i < 5; i += 1) {
      const gate = await store.quotaGateAtomic("k:test", 60_000, 5);
      expect(gate.allowed).toBe(true);
    }
    const blocked = await store.quotaGateAtomic("k:test", 60_000, 5);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    // Rejected attempts do not consume further budget.
    const again = await store.quotaGateAtomic("k:test", 60_000, 5);
    expect(again.allowed).toBe(false);
  });

  it("resets when the window expires", async () => {
    const first = await store.quotaGateAtomic("k:window", 60_000, 1, 1_000);
    expect(first.allowed).toBe(true);
    const blocked = await store.quotaGateAtomic("k:window", 60_000, 1, 2_000);
    expect(blocked.allowed).toBe(false);
    const reset = await store.quotaGateAtomic("k:window", 60_000, 1, 61_001);
    expect(reset.allowed).toBe(true);
  });

  it("prunes expired buckets immediately (24h retention honored, not extended)", async () => {
    await store.quotaGateAtomic("k:prune", 60_000, 10, 1_000);
    expect(await store.quotaPrune(2_000)).toBe(0);
    expect(await store.quotaPrune(61_001)).toBe(1);
  });

  it("clears reporter IP HMACs older than 24h", async () => {
    const now = Date.now();
    const id = "00000000-0000-4000-8000-0000000000aa";
    (store.reports as unknown as Map<string, { createdMs: number; reporter_ip_hmac: string | null } & Record<string, unknown>>).set(id, {
      id, target_submission_id: "00000000-0000-4000-8000-000000000001",
      reason: "old", reporter_ip_hmac: "hmac", created_at: new Date(now - 25 * 3600_000).toISOString(), createdMs: now - 25 * 3600_000,
    });
    expect(await store.clearExpiredReportIpHmacs(now)).toBe(1);
    expect(store.reports.get(id)?.reporter_ip_hmac).toBeNull();
  });

  it("derives HMAC keys without persisting raw IPs", async () => {
    const key = quotaKeyForIp("s", "192.0.2.1", "new-upload", "h:x");
    expect(key).not.toContain("192.0.2.1");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});

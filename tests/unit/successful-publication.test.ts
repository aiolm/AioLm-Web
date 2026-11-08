import { beforeEach, describe, expect, it } from "vitest";
import { POST, GET } from "@/app/v1/benchmark-runs/route";
import { syntheticFixedOutputSubmission, syntheticSubmission } from "@/lib/fixtures";
import { randomBase64Url32 } from "@/lib/crypto";
import { freshStore, setupTestEnv, testHeaders } from "./helpers";

describe("successful measurement publication", () => {
  beforeEach(() => { setupTestEnv(); freshStore(); });
  it.each(["partial", "failed", "cancelled", "empty", "failed-row"])("rejects %s before storing any public data", async kind => {
    const benchmark = syntheticSubmission();
    if (kind === "empty") benchmark.measurements.rows = [];
    else if (kind === "failed-row") benchmark.measurements.rows[0].failed = true;
    else benchmark.measurements.status = kind as "partial" | "failed" | "cancelled";
    const response = await POST(new Request("http://localhost:3000/v1/benchmark-runs", {
      method: "POST", headers: testHeaders({ authorization: "Bearer " + randomBase64Url32(), "content-type": "application/json" }),
      body: JSON.stringify(benchmark),
    }));
    expect(response.status).toBe(400);
    const list = await GET(new Request("http://localhost:3000/v1/benchmark-runs", { headers: testHeaders() }));
    expect((await list.json()).items).toEqual([]);
  });
  it.each(["missing", "early", "unequal", "non-preset"])("rejects fixed output with %s per-request evidence before storing any public data", async kind => {
    const benchmark = syntheticFixedOutputSubmission(kind === "non-preset" ? 1000 : 1024);
    const row = benchmark.measurements.rows[0]!;
    if (kind === "missing") delete row.reported_completion_tokens_by_request;
    else if (kind === "early") { row.reported_completion_tokens_by_request = [1023, 1024]; row.reported_completion_tokens = 2047; }
    else if (kind === "unequal") row.reported_completion_tokens_by_request = [1023, 1025];
    const response = await POST(new Request("http://localhost:3000/v1/benchmark-runs", {
      method: "POST", headers: testHeaders({ authorization: "Bearer " + randomBase64Url32(), "content-type": "application/json" }),
      body: JSON.stringify(benchmark),
    }));
    expect(response.status).toBe(400);
    for (const measurement of ["openai-chat-serving@2", "openai-chat-serving@1"]) {
      const list = await GET(new Request(`http://localhost:3000/v1/benchmark-runs?measurement=${measurement}`, { headers: testHeaders() }));
      expect((await list.json()).items).toEqual([]);
    }
  });
});

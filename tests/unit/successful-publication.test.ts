import { beforeEach, describe, expect, it } from "vitest";
import { POST, GET } from "@/app/v1/benchmark-runs/route";
import { syntheticSubmission } from "@/lib/fixtures";
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
    expect((await response.json()).error.message).toContain("successful measurements");
    const list = await GET(new Request("http://localhost:3000/v1/benchmark-runs", { headers: testHeaders() }));
    expect((await list.json()).items).toEqual([]);
  });
});

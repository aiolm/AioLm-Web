import { beforeEach, describe, expect, it } from "vitest";
import { POST, GET } from "@/app/v1/benchmark-runs/route";
import { syntheticSubmission } from "@/lib/fixtures";
import { randomBase64Url32 } from "@/lib/crypto";
import { freshStore, setupTestEnv, testHeaders } from "./helpers";

async function publishRejected(benchmark: unknown): Promise<void> {
  const response = await POST(new Request("http://localhost:3000/v1/benchmark-runs", {
    method: "POST", headers: testHeaders({ authorization: "Bearer " + randomBase64Url32(), "content-type": "application/json" }),
    body: JSON.stringify({ benchmark, description_md: "" }),
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  const list = await GET(new Request("http://localhost:3000/v1/benchmark-runs", { headers: testHeaders() }));
  expect((await list.json()).items).toEqual([]);
}

describe("successful measurement publication", () => {
  beforeEach(() => { setupTestEnv(); freshStore(); });
  it.each(["partial", "failed", "cancelled", "empty", "failed-row"])("rejects %s before storing any public data", async kind => {
    const benchmark = syntheticSubmission();
    if (kind === "empty") benchmark.measurements.rows = [];
    else if (kind === "failed-row") benchmark.measurements.rows[0]!.failed = true;
    else (benchmark.measurements as { status: string }).status = kind;
    await publishRejected(benchmark);
  });
  it.each(["usage-without-descriptor", "descriptor-without-usage", "force", "retired-row-field", "missing-descriptor", "incomplete-grid", "over-cap", "unbacked-rate"])("rejects %s before writing any public record", async kind => {
    const benchmark = syntheticSubmission();
    const row = benchmark.measurements.rows[0]! as unknown as Record<string, unknown>;
    if (kind === "usage-without-descriptor") benchmark.workload.request_usage = true;
    else if (kind === "descriptor-without-usage") benchmark.execution.settings.splice(2, 0, { target: "request", scope: [], name: "stream_options.include_usage", value: true, unit: null, role: null });
    else if (kind === "force") benchmark.execution.settings.unshift({ target: "request", scope: [], name: "ignore_eos", value: true, unit: null, role: null });
    else if (kind === "retired-row-field") row.content_bytes = 12;
    else if (kind === "missing-descriptor") benchmark.execution.settings.shift();
    else if (kind === "over-cap") {
      benchmark.workload.max_output_tokens = 129;
      benchmark.execution.settings[0]!.value = 129;
      row.max_output_tokens = 129;
    } else if (kind === "unbacked-rate") row.prefill_tokens_per_second = 100;
    else benchmark.workload.concurrencies.push(2);
    await publishRejected(benchmark);
  });
  it.each(["warmup", "missing-nonce", "missing-hashes", "mismatched-hash"])("rejects %s input evidence before consuming publication authorization", async kind => {
    const benchmark = syntheticSubmission();
    if (kind === "warmup") (benchmark.workload as { warmup: boolean }).warmup = true;
    else if (kind === "missing-nonce") delete (benchmark.workload as { prompt_nonce?: string }).prompt_nonce;
    else if (kind === "missing-hashes") delete (benchmark.measurements.rows[0] as { input_sha256_by_request?: string[] }).input_sha256_by_request;
    else benchmark.measurements.rows[0]!.input_sha256_by_request = ["b".repeat(64)];
    await publishRejected(benchmark);
  });
});

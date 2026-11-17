import { describe, expect, it } from "vitest";
import {
  normalizePublicationInput, parsePublicationSnapshot, validateBenchmarkReceipt,
  validateDescriptionMd, validatePublicationRequest,
} from "@/lib/validation";
import { syntheticSubmission } from "@/lib/fixtures";
import { pythonBenchmark } from "../inference-benchmarks";

function withUsage() {
  const benchmark = syntheticSubmission();
  benchmark.workload.request_usage = true;
  benchmark.execution.settings.splice(2, 0, { target: "request", scope: [], name: "stream_options.include_usage", value: true, unit: null, role: null });
  return benchmark;
}

describe("publication validation", () => {
  it.each([1, 128])("round-trips publication at cap %s without inventing usage", cap => {
    const benchmark = syntheticSubmission();
    benchmark.workload.max_output_tokens = cap;
    benchmark.execution.settings[0]!.value = cap;
    benchmark.measurements.rows[0]!.max_output_tokens = cap;
    const body = JSON.stringify({ benchmark, description_md: "Serving." });
    const snapshot = parsePublicationSnapshot(body);
    expect(snapshot.benchmark).toEqual(benchmark);
    expect(snapshot.benchmark.method).toEqual({ id: "openai-chat-serving", version: 5 });
    expect(snapshot.benchmark.schema_version).toBe(4);
    expect(snapshot.benchmark.workload.warmup).toBe(false);
  });
  it("rejects warmup, retired corpus/cache semantics, retired methods and schemas", () => {
    const benchmark = syntheticSubmission();
    for (const candidate of [
      { ...benchmark, workload: { ...benchmark.workload, warmup: true } },
      { ...benchmark, workload: { ...benchmark.workload, corpus_version: 1 } },
      { ...benchmark, workload: { ...benchmark.workload, cache_policy: "as_configured" } },
      ...[1, 2, 3, 4].map(version => ({ ...benchmark, method: { id: "openai-chat-serving", version } })),
      ...[1, 2, 3].map(schema_version => ({ ...benchmark, schema_version })),
    ]) expect(() => normalizePublicationInput({ benchmark: candidate, description_md: "" })).toThrow();
  });
  it("preserves every dispatched input hash and rejects missing, repeated or mismatched evidence", () => {
    const benchmark = syntheticSubmission();
    benchmark.workload.concurrencies = [1, 2];
    benchmark.measurements.rows.push({ ...benchmark.measurements.rows[0]!, concurrency: 2, input_sha256_by_request: ["b".repeat(64), "c".repeat(64)], finish_reasons: ["stop", "stop"] });
    expect(parsePublicationSnapshot(JSON.stringify({ benchmark, description_md: "" })).benchmark).toEqual(benchmark);
    const invalid = [
      ...[undefined, "", "A".repeat(32), "a".repeat(31)].map(prompt_nonce => ({ ...benchmark, workload: { ...benchmark.workload, prompt_nonce } })),
      { ...benchmark, measurements: { ...benchmark.measurements, rows: benchmark.measurements.rows.map(row => ({ ...row, input_sha256_by_request: undefined })) } },
      ...[["b".repeat(64)], ["b".repeat(64), "b".repeat(64)], ["a".repeat(64), "c".repeat(64)], ["B".repeat(64), "c".repeat(64)]].map(hashes => ({
        ...benchmark, measurements: { ...benchmark.measurements, rows: [benchmark.measurements.rows[0]!, { ...benchmark.measurements.rows[1]!, input_sha256_by_request: hashes }] },
      })),
      { ...benchmark, workload: { ...benchmark.workload, inputs: [{ bytes: 4096, sha256: "d".repeat(64) }] } },
    ];
    for (const candidate of invalid) expect(() => normalizePublicationInput({ benchmark: candidate, description_md: "" })).toThrow();
  });
  it("preserves negotiated usage descriptors with missing or reported counters and derived rates", () => {
    const benchmark = withUsage();
    expect(normalizePublicationInput({ benchmark, description_md: "" }).benchmark).toEqual(benchmark);
    Object.assign(benchmark.measurements.rows[0]!, { reported_prompt_tokens: 55, reported_completion_tokens: 3, usage_status: "complete", prefill_tokens_per_second: 2750, decode_tokens_per_second: 50, tpot_ms: 20 });
    const body = JSON.stringify({ benchmark, description_md: "Negotiated usage." });
    expect(parsePublicationSnapshot(body).benchmark).toEqual(benchmark);
    const mismatches = [
      { ...benchmark, workload: { ...benchmark.workload, request_usage: false } },
      ...[
        { value: false }, { unit: "tokens" }, { scope: ["response"] }, { role: "context_length" },
      ].map(change => ({
        ...benchmark, execution: { ...benchmark.execution, settings: benchmark.execution.settings.map(setting => setting.name === "stream_options.include_usage" ? { ...setting, ...change } : setting) },
      })),
    ];
    for (const candidate of mismatches) expect(() => normalizePublicationInput({ benchmark: candidate, description_md: "" })).toThrow();
  });
  it("rejects derived rates that are not backed by usage evidence", () => {
    const row = withUsage().measurements.rows[0]!;
    const rows = [
      { ...row, prefill_tokens_per_second: 100 },
      { ...row, reported_prompt_tokens: 55, usage_status: "partial", decode_tokens_per_second: 50 },
      { ...row, reported_prompt_tokens: 55, usage_status: "partial", tpot_ms: 20 },
      { ...row, reported_prompt_tokens: 55, reported_completion_tokens: 3, usage_status: "complete", tpot_ms: 0, decode_tokens_per_second: 50 },
      { ...row, first_output_ms: null, reported_prompt_tokens: 55, reported_completion_tokens: 3, usage_status: "complete", prefill_tokens_per_second: 2750 },
      { ...row, reported_prompt_tokens: 55, reported_completion_tokens: null, usage_status: "complete" },
      { ...row, reported_prompt_tokens: 55, reported_completion_tokens: 3, usage_status: "missing" },
      { ...row, content_bytes: 6 },
      { ...row, reported_cached_tokens: 0 },
    ];
    for (const candidate of rows) expect(() => normalizePublicationInput({ benchmark: { ...withUsage(), measurements: { status: "complete", rows: [candidate] } }, description_md: "" })).toThrow();
  });
  it("rejects nonstandard descriptors and out-of-bounds caps without stripping them", () => {
    const standard = syntheticSubmission();
    const invalid = [
      ...[0, 129].map(cap => ({
        ...standard,
        workload: { ...standard.workload, max_output_tokens: cap },
        execution: { ...standard.execution, settings: standard.execution.settings.map(setting => setting.name === "max_tokens" ? { ...setting, value: cap } : setting) },
        measurements: { ...standard.measurements, rows: standard.measurements.rows.map(row => ({ ...row, max_output_tokens: cap })) },
      })),
      { ...standard, workload: { ...standard.workload, request_usage: true } },
      { ...standard, execution: { ...standard.execution, settings: standard.execution.settings.slice(1) } },
      ...["ignore_eos", "min_tokens", "stream_options.include_usage"].map(name => ({ ...standard, execution: { ...standard.execution, settings: [{ target: "request", scope: [], name, value: true, unit: null, role: null }, ...standard.execution.settings].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0) } })),
    ];
    for (const benchmark of invalid) expect(() => normalizePublicationInput({ benchmark, description_md: "" })).toThrow();
  });

  it("rejects incomplete Metal plugin identity", () => {
    const benchmark = pythonBenchmark("vllm-metal");
    expect(normalizePublicationInput({ benchmark, description_md: "" }).benchmark.runtime).toMatchObject({ variant: "vllm-metal", plugin_version: "0.30.0" });
    const { plugin_version, ...runtime } = benchmark.runtime;
    void plugin_version;
    expect(() => normalizePublicationInput({ benchmark: { ...benchmark, runtime }, description_md: "" })).toThrow();
  });
  it("accepts only the wrapper; a bare submission is not a publication request", () => {
    const benchmark = syntheticSubmission();
    expect(normalizePublicationInput({ benchmark, description_md: "hi" }).description_md).toBe("hi");
    expect(() => normalizePublicationInput(benchmark)).toThrow();
    expect(() => parsePublicationSnapshot(JSON.stringify(benchmark))).toThrow();
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
    expect(() => validatePublicationRequest({ benchmark, description_md: "" })).toThrow();
  });

  it("rejects >4MiB snapshots without truncating", () => {
    const big = "x".repeat(4 * 1024 * 1024 + 1);
    expect(() => parsePublicationSnapshot(big)).toThrow();
  });

  it("receipts stay within 16KiB and bind the submission", () => {
    const receipt = validateBenchmarkReceipt({ submission_id: syntheticSubmission().submission_id, id: "babc123" }, syntheticSubmission().submission_id);
    expect(receipt.id).toBe("babc123");
    expect(() => validateBenchmarkReceipt({ submission_id: syntheticSubmission().submission_id, id: "babc123" }, "00000000-0000-4000-8000-000000000002")).toThrow();
  });
});

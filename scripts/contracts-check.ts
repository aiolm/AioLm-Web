import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DESCRIPTION_MAX_CODEPOINTS,
  MAX_SERVING_OUTPUT_TOKENS,
  PUBLICATION_MAX_ROWS,
  PUBLICATION_MAX_UTF8_BYTES,
  RECOVERY_FIXTURE,
  RECOVERY_PREFIX,
  SERVING_METRIC_KEYS,
  decodeRecoveryCode,
  encodeRecoveryCode,
  formatRuntimeVersionLabel,
  isRecoverableServiceCode,
  isTerminalServiceCode,
  normalizePublicationInput,
  normalizeServiceOrigin,
  parsePublicationSnapshot,
  serializePublicationRequest,
  validateDescriptionMd,
  validatePublicBenchmark,
} from "@aiolm/benchmark-contracts";
import { syntheticSubmission } from "../src/lib/fixtures";

/**
 * Offline verification that this repository really consumes the versioned
 * @aiolm/benchmark-contracts artifact it claims to:
 *
 * 1. package.json points at the vendored archive, and the archive's sha512
 *    matches the `integrity` recorded in package-lock.json — so a swapped or
 *    edited tarball is caught without any network access.
 * 2. The installed package version matches the vendored archive's version.
 * 3. The exports the website re-exports are present and behave: publication
 *    bounds, `validatePublicBenchmark`, the publication snapshot round-trip,
 *    the recovery round-trip against `RECOVERY_FIXTURE`, origin normalization,
 *    and the recoverable/terminal service-error classification.
 * 4. The single benchmark method (openai-chat-serving@5, schema_version 4),
 *    its eight metrics and the 1..128 output bound are the package's, and every
 *    retired method or schema version is rejected.
 * 5. The shared JSON Schema and OpenAPI documents resolve and parse.
 *
 * Runs unconditionally in CI (`npm run contracts:check`). Set
 * CONTRACTS_TARBALL_PATH to additionally compare a candidate archive against
 * the vendored one before adopting a new version.
 */

const require = createRequire(import.meta.url);

const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`FAIL ${name}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha512Base64(path: string): string {
  return `sha512-${createHash("sha512").update(readFileSync(path)).digest("base64")}`;
}

interface Manifest {
  dependencies: Record<string, string>;
}
interface Lockfile {
  packages: Record<string, { version?: string; resolved?: string; integrity?: string }>;
}

const manifest = JSON.parse(readFileSync("package.json", "utf8")) as Manifest;
const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8")) as Lockfile;
const spec = manifest.dependencies["@aiolm/benchmark-contracts"] ?? "";
const vendorPath = spec.startsWith("file:") ? spec.slice("file:".length) : "";

check("package.json installs the contracts package from a vendored archive", () => {
  assert(vendorPath.endsWith(".tgz"), `expected a file: tarball specifier, got "${spec}"`);
  assert(vendorPath.startsWith("vendor/"), `expected the archive under vendor/, got "${vendorPath}"`);
});

check("package-lock.json integrity matches the vendored archive bytes", () => {
  const entry = lockfile.packages["node_modules/@aiolm/benchmark-contracts"];
  assert(entry, "no lockfile entry for @aiolm/benchmark-contracts");
  assert(entry.integrity, "lockfile entry has no integrity hash");
  assert(entry.resolved === spec, `lockfile resolves "${entry.resolved}", package.json asks for "${spec}"`);
  const actual = sha512Base64(vendorPath);
  assert(entry.integrity === actual, `vendored archive hash ${actual} does not match locked ${entry.integrity}`);
});

check("installed package version matches the lockfile and the archive filename", () => {
  const installed = require("@aiolm/benchmark-contracts/package.json") as { version: string };
  const locked = lockfile.packages["node_modules/@aiolm/benchmark-contracts"]?.version;
  assert(installed.version === locked, `installed ${installed.version}, locked ${String(locked)}`);
  assert(
    vendorPath.includes(installed.version),
    `archive ${vendorPath} does not carry the installed version ${installed.version}`,
  );
});

check("publication bounds come from the package", () => {
  assert(DESCRIPTION_MAX_CODEPOINTS === 4000, `description bound is ${DESCRIPTION_MAX_CODEPOINTS}`);
  assert(PUBLICATION_MAX_ROWS === 10000, `row bound is ${PUBLICATION_MAX_ROWS}`);
  assert(PUBLICATION_MAX_UTF8_BYTES === 4 * 1024 * 1024, `byte bound is ${PUBLICATION_MAX_UTF8_BYTES}`);
  validateDescriptionMd("x".repeat(DESCRIPTION_MAX_CODEPOINTS));
  let rejected = false;
  try {
    validateDescriptionMd("x".repeat(DESCRIPTION_MAX_CODEPOINTS + 1));
  } catch {
    rejected = true;
  }
  assert(rejected, "an over-long description was accepted");
});

function rejects(candidate: unknown, message: string): void {
  let rejected = false;
  try { validatePublicBenchmark(JSON.parse(JSON.stringify(candidate))); } catch { rejected = true; }
  assert(rejected, message);
}

check("benchmark validation accepts a valid submission and rejects a broken one", () => {
  const benchmark = syntheticSubmission();
  validatePublicBenchmark(benchmark);
  rejects({ ...benchmark, schema_version: 99 }, "an unknown schema_version was accepted");
});

check("only openai-chat-serving@5 with schema_version 4 is accepted", () => {
  const benchmark = syntheticSubmission();
  assert(benchmark.schema_version === 4 && benchmark.method.id === "openai-chat-serving" && benchmark.method.version === 5, "fixture is not the single method");
  assert(MAX_SERVING_OUTPUT_TOKENS === 128, `serving output bound is ${MAX_SERVING_OUTPUT_TOKENS}`);
  assert(JSON.stringify(SERVING_METRIC_KEYS) === JSON.stringify(["first_output_ms", "prefill_tokens_per_second", "decode_tokens_per_second", "tpot_ms", "reported_tokens_per_second", "output_bytes_per_second", "e2e_ms", "peak_memory_bytes"]), `metric keys are ${JSON.stringify(SERVING_METRIC_KEYS)}`);
  for (const version of [1, 2, 3, 4]) rejects({ ...benchmark, method: { ...benchmark.method, version } }, `method version ${version} was accepted`);
  for (const schema of [1, 2, 3]) rejects({ ...benchmark, schema_version: schema }, `schema_version ${schema} was accepted`);
  rejects({ ...benchmark, method: { id: "cold-prompt-serving", version: 1 } }, "a retired method id was accepted");
});

check("output bound, usage evidence and derived rates follow the package", () => {
  const cap = (tokens: number) => {
    const benchmark = syntheticSubmission();
    benchmark.workload.max_output_tokens = tokens;
    benchmark.execution.settings = benchmark.execution.settings.map(setting => setting.name === "max_tokens" ? { ...setting, value: tokens } : setting);
    benchmark.measurements.rows = benchmark.measurements.rows.map(row => ({ ...row, max_output_tokens: tokens }));
    return benchmark;
  };
  for (const tokens of [1, 128]) validatePublicBenchmark(cap(tokens));
  rejects(cap(0), "max_output_tokens 0 was accepted");
  rejects(cap(129), "max_output_tokens 129 was accepted");
  const usage = syntheticSubmission();
  usage.workload.request_usage = true;
  usage.execution.settings.splice(2, 0, { target: "request", scope: [], name: "stream_options.include_usage", value: true, unit: null, role: null });
  validatePublicBenchmark(usage); // Requesting usage does not guarantee a report.
  const reported = structuredClone(usage);
  Object.assign(reported.measurements.rows[0]!, { reported_prompt_tokens: 55, reported_completion_tokens: 3, prefill_tokens_per_second: 2750, decode_tokens_per_second: 50, tpot_ms: 20, usage_status: "complete" });
  validatePublicBenchmark(reported);
  const row = syntheticSubmission().measurements.rows[0]!;
  const withRow = (change: Record<string, unknown>) => ({ ...syntheticSubmission(), measurements: { status: "complete", rows: [{ ...row, ...change }] } });
  for (const [name, candidate] of [
    ["a retired content_bytes row field", withRow({ content_bytes: 6 })],
    ["a retired reported_cached_tokens row field", withRow({ reported_cached_tokens: null })],
    ["prefill without reported prompt tokens", withRow({ prefill_tokens_per_second: 100 })],
    ["tpot without reported completion tokens", withRow({ reported_prompt_tokens: 55, usage_status: "partial", tpot_ms: 10 })],
    ["a missing input hash list", withRow({ input_sha256_by_request: undefined })],
    ["a rewritten slot-0 hash", withRow({ input_sha256_by_request: ["b".repeat(64)] })],
    ["warmup", { ...syntheticSubmission(), workload: { ...syntheticSubmission().workload, warmup: true } }],
    ["a missing nonce", { ...syntheticSubmission(), workload: { ...syntheticSubmission().workload, prompt_nonce: undefined } }],
    ["an as-configured cache policy", { ...syntheticSubmission(), workload: { ...syntheticSubmission().workload, cache_policy: "as_configured" } }],
    ["usage requested without its request setting", { ...syntheticSubmission(), workload: { ...syntheticSubmission().workload, request_usage: true } }],
    ["a fixed-output request control", { ...syntheticSubmission(), execution: { ...syntheticSubmission().execution, settings: [{ target: "request", scope: [], name: "ignore_eos", value: true, unit: null, role: null }, ...syntheticSubmission().execution.settings] } }],
  ] as Array<[string, unknown]>) rejects(candidate, `a submission with ${name} was accepted`);
});

check("publication accepts only the wrapper", () => {
  const benchmark = syntheticSubmission();
  let rejected = false;
  try { parsePublicationSnapshot(JSON.stringify(benchmark)); } catch { rejected = true; }
  assert(rejected, "a bare submission was accepted as a publication request");
  rejected = false;
  try { normalizePublicationInput(benchmark); } catch { rejected = true; }
  assert(rejected, "a bare submission was normalized into a publication request");
});

check("publication snapshot round-trips through the package", () => {
  const benchmark = syntheticSubmission();
  const normalized = normalizePublicationInput({ benchmark, description_md: "Round trip." });
  const serialized = serializePublicationRequest(normalized);
  const snapshot = parsePublicationSnapshot(serialized);
  assert(snapshot.description_md === "Round trip.", "description did not survive the round-trip");
  assert(
    snapshot.benchmark.submission_id === benchmark.submission_id,
    "submission_id did not survive the round-trip",
  );
});

check("recovery codes round-trip against the packaged fixture", () => {
  const code = encodeRecoveryCode(RECOVERY_FIXTURE);
  assert(code.startsWith(RECOVERY_PREFIX), `code does not start with ${RECOVERY_PREFIX}`);
  const decoded = decodeRecoveryCode(code, RECOVERY_FIXTURE.origin);
  assert(decoded.submission_id === RECOVERY_FIXTURE.submission_id, "submission_id mismatch");
  assert(decoded.secret === RECOVERY_FIXTURE.secret, "secret mismatch");
  let rejected = false;
  try {
    decodeRecoveryCode(code, "https://other.example");
  } catch {
    rejected = true;
  }
  assert(rejected, "a code bound to another origin was accepted");
});

check("service origin normalization rejects non-root origins", () => {
  assert(normalizeServiceOrigin("https://Benchmarks.Example.com/") === "https://benchmarks.example.com", "canonical form changed");
  for (const bad of ["https://a.example/path", "https://a.example/?q=1", "https://user@a.example", "http://a.example"]) {
    let rejected = false;
    try {
      normalizeServiceOrigin(bad);
    } catch {
      rejected = true;
    }
    assert(rejected, `accepted "${bad}"`);
  }
});

check("service error classification is the shared one", () => {
  assert(isRecoverableServiceCode("verification_required"), "verification_required is not recoverable");
  assert(isRecoverableServiceCode("ownership_missing"), "ownership_missing is not recoverable");
  assert(isTerminalServiceCode("submission_deleted"), "submission_deleted is not terminal");
  assert(!isTerminalServiceCode("verification_required"), "verification_required is terminal");
});

check("runtime labels come from the package as version(build)", () => {
  assert(formatRuntimeVersionLabel({ name: "llama.cpp", version: "version: 0.3.0-dev (build 10638, commit abc)", build: "b10600" }) === "0.3.0-dev(10638)", "llama.cpp banner build is not preferred");
  assert(formatRuntimeVersionLabel({ name: "llama.cpp", version: null, build: "b10638" }) === "b10638", "llama.cpp build-only label differs from the desktop contract");
  assert(formatRuntimeVersionLabel({ name: "vllm", version: "0.6.2", build: null }) === "0.6.2", "other engines are not preserved");
  assert(formatRuntimeVersionLabel({ name: "llama.cpp", version: null, build: null }) === null, "an unknown runtime is not null");
  assert(formatRuntimeVersionLabel({ name: "vllm", version: "0.30.0", variant: "vllm-metal", plugin_version: "0.30.0" }) === "vllm-metal 0.30.0 · vLLM 0.30.0", "Metal plugin and core identity were not preserved");
});

check("shared schema and OpenAPI documents resolve and parse", () => {
  for (const entry of ["@aiolm/benchmark-contracts/schema", "@aiolm/benchmark-contracts/openapi"]) {
    const path = require.resolve(entry);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    assert(Object.keys(parsed).length > 0, `${entry} is empty`);
  }
});

const candidate = process.env["CONTRACTS_TARBALL_PATH"];
if (candidate) {
  check("candidate archive matches the vendored archive", () => {
    const candidateHash = sha512Base64(candidate);
    const vendoredHash = sha512Base64(vendorPath);
    assert(
      candidateHash === vendoredHash,
      `candidate ${candidate} (${candidateHash}) differs from vendored ${vendorPath} (${vendoredHash}); ` +
        "install it and re-run the suite to adopt the new version",
    );
  });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contracts check(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nAll contracts checks passed against @aiolm/benchmark-contracts from ${vendorPath}.`);

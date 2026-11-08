import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DESCRIPTION_MAX_CODEPOINTS,
  FIXED_OUTPUT_TOKENS,
  MAX_SERVING_OUTPUT_TOKENS,
  PUBLICATION_MAX_ROWS,
  PUBLICATION_MAX_UTF8_BYTES,
  RECOVERY_FIXTURE,
  RECOVERY_PREFIX,
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
import { syntheticFixedOutputSubmission, syntheticServingSubmission, syntheticSubmission } from "../src/lib/fixtures";

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
 * 4. Fixed-output policy (the eight output presets, the serving upper bound and
 *    exact per-request evidence) is the package's, while historical output-cap
 *    submissions remain valid in their own method version.
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

check("benchmark validation accepts a valid submission and rejects a broken one", () => {
  const benchmark = syntheticSubmission();
  validatePublicBenchmark(benchmark);
  let rejected = false;
  try {
    validatePublicBenchmark({ ...benchmark, schema_version: 99 });
  } catch {
    rejected = true;
  }
  assert(rejected, "an unknown schema_version was accepted");
});

check("fixed-output policy comes from the package and historical caps stay valid", () => {
  assert(JSON.stringify(FIXED_OUTPUT_TOKENS) === JSON.stringify([1024, 4096, 8192, 16384, 32768, 65536, 131072, 204800]), `fixed presets are ${JSON.stringify(FIXED_OUTPUT_TOKENS)}`);
  assert(MAX_SERVING_OUTPUT_TOKENS === 204800, `serving output bound is ${MAX_SERVING_OUTPUT_TOKENS}`);
  for (const target of FIXED_OUTPUT_TOKENS) validatePublicBenchmark(syntheticFixedOutputSubmission(target));
  const historicalCap = (tokens: number) => {
    const cap = syntheticServingSubmission();
    cap.workload.max_output_tokens = tokens;
    cap.execution.settings = cap.execution.settings.map(setting => setting.name === "max_tokens" ? { ...setting, value: tokens } : setting);
    cap.measurements.rows = cap.measurements.rows.map(row => ({ ...row, max_output_tokens: tokens }));
    return cap;
  };
  validatePublicBenchmark(historicalCap(65536));
  const fixed = syntheticFixedOutputSubmission(204800);
  const row = fixed.measurements.rows[0]!;
  const invalid: Array<[string, unknown]> = [
    ["missing per-request evidence", { ...fixed, measurements: { ...fixed.measurements, rows: [{ ...row, reported_completion_tokens_by_request: undefined }] } }],
    ["an early stop", { ...fixed, measurements: { ...fixed.measurements, rows: [{ ...row, reported_completion_tokens_by_request: [204799, 204800], reported_completion_tokens: 409599 }] } }],
    ["unequal counts with a matching sum", { ...fixed, measurements: { ...fixed.measurements, rows: [{ ...row, reported_completion_tokens_by_request: [204799, 204801] }] } }],
    ["a non-preset target", syntheticFixedOutputSubmission(1000)],
    ["a historical cap above 65536", historicalCap(65537)],
    ["historical cap rows carrying fixed-output evidence", { ...syntheticServingSubmission(), measurements: { status: "complete", rows: syntheticServingSubmission().measurements.rows.map(r => ({ ...r, reported_completion_tokens_by_request: [128] })) } }],
  ];
  for (const [name, candidate] of invalid) {
    let rejected = false;
    try {
      validatePublicBenchmark(JSON.parse(JSON.stringify(candidate)));
    } catch {
      rejected = true;
    }
    assert(rejected, `a submission with ${name} was accepted`);
  }
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

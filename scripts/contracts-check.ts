import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DESCRIPTION_MAX_CODEPOINTS,
  PUBLICATION_MAX_ROWS,
  PUBLICATION_MAX_UTF8_BYTES,
  RECOVERY_FIXTURE,
  RECOVERY_PREFIX,
  decodeRecoveryCode,
  encodeRecoveryCode,
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
 * 4. The shared JSON Schema and OpenAPI documents resolve and parse.
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

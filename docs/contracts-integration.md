# Contracts integration

`@aiolm/benchmark-contracts` 0.11.0 owns the shared data contract: DTOs,
validation, JSON Schema/OpenAPI, publication bounds, recovery encoding, receipt
shape. The website consumes that package directly — it does not carry its own
copy of the rules and never imports app sources at runtime.

## How the package is consumed

The versioned tarball is committed to this repository and installed from there:

```json
"@aiolm/benchmark-contracts": "file:vendor/aiolm-benchmark-contracts-0.11.0.tgz"
```

`package-lock.json` pins its `integrity` (`sha512-…`), so `npm ci` fails if the
archive contents ever change without the lockfile changing with them.

The website modules that used to restate the rules are now thin re-exports of
the installed package:

| Module | Re-exports |
| --- | --- |
| `src/lib/validation.ts` | publication bounds, `validatePublicBenchmark`, `normalizePublicationInput`, `parsePublicationSnapshot`, `serializePublicationRequest` |
| `src/lib/recovery.ts` | `RECOVERY_PREFIX`, `RECOVERY_FIXTURE`, `encodeRecoveryCode`, `decodeRecoveryCode`, `normalizeServiceOrigin` |
| `src/lib/origin.ts` | `normalizeServiceOrigin`, `normalizeBaseUrl` |

Runtime labels on every page come from `formatRuntimeVersionLabel`, called
through `runtimeVersionLabel` in `src/components/benchmark-explorer-format.ts`
with the runtime name, version, build and optional plugin identity. llama.cpp
keeps its `version(build)` label; vllm-metal shows both plugin and core versions.

Website-side policy that the shared contract deliberately leaves open stays in
this repository — for example `getServiceOrigin()` in `src/lib/env.ts` layers a
production HTTPS requirement on top of `normalizeServiceOrigin`, whose
one-argument API allows the HTTP debug loopback.

## Schema and API surface

Contract 0.11.0 accepts unchanged legacy schema1/2 snapshots, historical schema3
`openai-chat-serving@1` output-cap snapshots and new `openai-chat-serving@2`
fixed-output snapshots through the same `/v1/**` routes. Results use exact UTF-8
input byte sizes/hashes, client-observed content/reasoning timing and output
bytes. @1 keeps nullable engine-reported token/cache counters, its original
cap bound of 65536 and no per-request evidence; it never becomes fixed output.
@2 requires request usage, one of the package's `FIXED_OUTPUT_TOKENS`
targets (upper bound `MAX_SERVING_OUTPUT_TOKENS` = 204800), the declared
force-control request descriptor, and `reported_completion_tokens_by_request`
with every launch slot equal to the target. The website imports those constants
and validation from the package rather than restating them. Unknown engine
identity, model format or launch settings does not disqualify a complete
serving workload.

Validation selects the declared schema before checking its fields. An invalid
schema3 input therefore reports that input's constraint, not an unrelated
legacy `schema_version` failure. Accepted wire shapes and publication bounds
are unchanged.

Public runtime identity has six required nullable fields and no fixed engine
enum. Model format is engine-independent; declared GGUF metadata is permitted
only for GGUF. Optional HF repository/revision is provenance, not a weight
digest or proof of unmodified weights. Local provider IDs and reference-file
hashes/sizes are not substituted for missing public identity.

Schema3 execution records typed, bounded public settings and explicit compute
topology/memory scope. Environment scope is `aiolm_host`, not an upstream or
container allocation. Historical optional usage requests and as-configured
caches are measurement conditions, not token-count/cold-cache guarantees;
fixed-output token counts are exact by admission. Repeated rows
use the package's per-metric median/min/max/sample count. Unobserved metrics and
non-finite derived rates stay null, never zero or Infinity.

The archive is produced by the desktop workspace's build/pack scripts and
includes LICENSE. Its exact bytes are pinned by the web lockfile; no source
checkout is imported. Migration `015_engine_neutral_benchmarks.sql` is required
before the new web deployment is ready. Existing accepted snapshots, request
bytes, hashes and receipts are not rewritten or backfilled.

The current desktop explorer's profile importer reads the existing public
`GET /v1/benchmark-runs/<id>` projection: `id`, the actual `benchmark.schema_version`, `benchmark.runtime` and
`benchmark.execution`. The app validates that projection and creates local
profiles; the website neither imports desktop code nor accepts local profile
settings. The app supplies its own toolbar in its unprivileged website window;
ordinary browser pages gain no native bridge. Existing owner/recovery and
management-handoff flows remain separate.

The installed package ships the authoritative machine-readable surface; read it
from `node_modules`, not from a transcribed copy:

```sh
node -e "console.log(require.resolve('@aiolm/benchmark-contracts/openapi'))"
# node_modules/@aiolm/benchmark-contracts/schema/openapi.json
# node_modules/@aiolm/benchmark-contracts/schema/public-benchmark.schema.json
```

The OpenAPI document is the wire contract for every `/v1` route this app serves.

## Upgrading

1. Drop the new tarball into `vendor/`.
2. `npm install ./vendor/aiolm-benchmark-contracts-<version>.tgz` — this updates
   `package.json` and records the new `integrity` hash in `package-lock.json`.
3. Delete the superseded tarball and keep the package's `LICENSE` notices.
4. Run `npm run contracts:check`, then `npm run typecheck && npm run lint && npm test && npm run test:integration`.

Never point the website at a source checkout of the contracts package; the
vendored, integrity-pinned archive is the only supported input.

## Verifying the artifact

`npm run contracts:check` runs offline and is a required CI step. It fails the
build when any of these does not hold:

- `package.json` installs the package from a `vendor/*.tgz` archive;
- the archive's sha512 matches the `integrity` recorded in `package-lock.json`,
  and that entry resolves to the same specifier (a swapped or edited tarball is
  caught with no network access);
- the installed version matches the lockfile and the archive filename;
- the exports the website re-exports behave: publication bounds,
  `validatePublicBenchmark`, the publication snapshot round-trip,
  the recovery round-trip against `RECOVERY_FIXTURE`, origin normalization, and
  the recoverable/terminal service-error classification, and the
  `formatRuntimeVersionLabel` version(build) labels;
- fixed-output policy is the package's: the eight `FIXED_OUTPUT_TOKENS`, the
  204800 serving bound, an accepted 200k @2 submission, rejection of missing,
  early or unequal per-request counts and non-preset targets, continued
  acceptance of a historical @1 cap up to 65536, and rejection of a larger @1
  cap or @1 rows carrying per-request evidence;
- the shared JSON Schema and OpenAPI documents resolve and parse.

Set `CONTRACTS_TARBALL_PATH` to additionally compare a candidate archive
against the vendored one before adopting a new version:

```sh
CONTRACTS_TARBALL_PATH=./vendor/aiolm-benchmark-contracts-0.11.0.tgz npm run contracts:check
```

# Contracts integration

`@aiolm/benchmark-contracts` 0.8.0 owns the shared data contract: DTOs,
validation, JSON Schema/OpenAPI, publication bounds, recovery encoding, receipt
shape. The website consumes that package directly — it does not carry its own
copy of the rules and never imports app sources at runtime.

## How the package is consumed

The versioned tarball is committed to this repository and installed from there:

```json
"@aiolm/benchmark-contracts": "file:vendor/aiolm-benchmark-contracts-0.8.0.tgz"
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

The website's `weight_bits` discovery filter derives a nominal family from
existing declared GGUF metadata. It adds no field to a publication and does not
guess AWQ/GPTQ precision. Contract 0.8.0 accepts legacy schema-1 llama.cpp runs
and schema-2 llama.cpp, vLLM and MLX runs. Standard vLLM uses HF safetensors;
MLX uses HF/MLX snapshots; the explicit vllm-metal variant also permits the
model formats declared by that contract, including GGUF. Python records retain
null llama.cpp settings, method version 2 and their per-sequence context
allocation. The website shows the recorded model format without fabricating
GGUF metadata or weight bits. Plugin/core identity survives storage and display.

The archive is built from desktop v0.3.2, commit
`e439b52038142439c8c85b112d2949687fa273f2`, using the package's build and pack
scripts, including its LICENSE. The lockfile pins the exact packed bytes.
Existing accepted snapshots and receipts are not rewritten. No database
migration is required: benchmark and summary JSON carry the additional fields.

External `custom.*` engines remain outside this publication schema. Never
rename them to a built-in engine to bypass validation, and never extend the
website validator independently of the shared package. Weight bits remain
separate from activation/KV precision and unknown when not declared.

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
- the shared JSON Schema and OpenAPI documents resolve and parse.

Set `CONTRACTS_TARBALL_PATH` to additionally compare a candidate archive
against the vendored one before adopting a new version:

```sh
CONTRACTS_TARBALL_PATH=./aiolm-benchmark-contracts-0.8.0.tgz npm run contracts:check
```

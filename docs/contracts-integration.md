# Contracts integration

`@aiolm/benchmark-contracts` 0.5.0 owns the shared data contract: DTOs,
validation, JSON Schema/OpenAPI, publication bounds, recovery encoding, receipt
shape. The website consumes that package directly — it does not carry its own
copy of the rules and never imports app sources at runtime.

## How the package is consumed

The versioned tarball is committed to this repository and installed from there:

```json
"@aiolm/benchmark-contracts": "file:vendor/aiolm-benchmark-contracts-0.5.0.tgz"
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

Website-side policy that the shared contract deliberately leaves open stays in
this repository — for example `getServiceOrigin()` in `src/lib/env.ts` layers a
production HTTPS requirement on top of `normalizeServiceOrigin`, whose
one-argument API allows the HTTP debug loopback.

## Schema and API surface

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
  the recoverable/terminal service-error classification;
- the shared JSON Schema and OpenAPI documents resolve and parse.

Set `CONTRACTS_TARBALL_PATH` to additionally compare a candidate archive
against the vendored one before adopting a new version:

```sh
CONTRACTS_TARBALL_PATH=./aiolm-benchmark-contracts-0.5.0.tgz npm run contracts:check
```

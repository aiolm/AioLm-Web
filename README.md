# AioLM Website

Product introduction and anonymous public benchmark explorer. Next.js App Router + PostgreSQL
(Supabase-compatible) + Cloudflare Turnstile. No accounts in v1.

- Production site: [aiolm.vercel.app](https://aiolm.vercel.app).
- Desktop app repository: [aiolm/AioLM](https://github.com/aiolm/AioLM).
- Website repository: [aiolm/AioLm-Web](https://github.com/aiolm/AioLm-Web).

- Public: browse/filter benchmark results, detail with environment/summary/safe
  Markdown descriptions, paged measurement rows, Turnstile-gated verification
  and reporting.
- Owners: manage via recovery code (`/manage`): result-scoped 30-minute session,
  description edits with `expected_revision`, deletion (tombstone).
- API: the wire contract is the OpenAPI document shipped by
  `@aiolm/benchmark-contracts` 0.3.0
  (`node_modules/@aiolm/benchmark-contracts/schema/openapi.json`). Routes:
  `POST /v1/upload-sessions`, `POST .../verify`, `GET ...`, `POST /v1/benchmark-runs`,
  `GET /v1/benchmark-runs`, `GET /v1/benchmark-runs/<id>`, `GET .../measurements`,
  `POST /v1/management-sessions` + `GET`/`DELETE`, `PATCH .../description`,
  `DELETE ...`, `POST .../reports`. `GET /v1/readiness` is the deployment
  probe and is not part of the shared contract. Website-specific discovery
  query extensions and `GET /v1/benchmark-runs/options` are documented in
  [benchmark discovery](docs/benchmark-discovery.md).

Runs on **Node 22** (`engines.node`, `.nvmrc`, CI, and the Vercel project all
pin the same major).

## Public pages

All page routes below use a language prefix: `/en`, `/ko`, `/ja`, or `/zh`
(Simplified Chinese), for example `/ko/benchmarks`. Legacy unprefixed URLs
redirect using the saved language or browser preference, with English fallback.
The header language selector preserves the current page, query and fragment.
APIs remain at `/v1/**`. See [language routing and catalogs](docs/internationalization.md).

- `/`: product introduction to the AioLM desktop workspace, with links to the
  GitHub repository, documentation, and benchmark explorer.
- `/benchmarks`: top search with editable suggestions, grouped hardware, OS,
  runtime, and execution filters, numeric ranges, and selectable sort order.
  Filters and sorting remain in the URL. Select up to three results for a
  summary comparison; differing methods or workloads carry a comparability notice.
  Sorting self-reported measurements does not make different setups comparable.
- `/benchmarks/[id]`: grouped model, runtime, hardware, workload, execution, and
  measurement context. Measurement rows load on demand and paginate separately.
- `/manage`: recovery-code management for an owner's published result.
- `/verify/[sessionId]`: verification of an upload session from the desktop app.

The product introduction is static. Loading and interacting with public benchmark
results requires JavaScript. The shared theme follows the system light/dark
preference and uses the desktop app's semantic colors and official brand assets.

## Quick start (synthetic local)

```sh
cp .env.example .env.local
# Point DATABASE_URL at an isolated database, then:
npm install
npm run db:migrate
npm run dev
npm test
```

Publishing stays disabled until `DATABASE_URL`, `PERMIT_HMAC_SECRET`,
`MANAGEMENT_HMAC_SECRET`, `QUOTA_HMAC_SECRET`, `TURNSTILE_SECRET_KEY`, and
`SERVICE_ORIGIN` are set, and in production also `PROVISIONED_BYTES` /
`PROVISIONED_ROWS`.

```sh
npm run config:check   # validate a deployment environment; prints no secret values
```

Production uses this public configuration pair:

```dotenv
SERVICE_ORIGIN=https://aiolm.vercel.app
TURNSTILE_EXPECTED_HOSTNAME=aiolm.vercel.app
```

The homepage canonical URL and site metadata base use the configured
`SERVICE_ORIGIN`. Set it before building; production requires an explicit HTTPS
origin. Authorize `aiolm.vercel.app` in the production Turnstile widget.

See `docs/deployment.md` and `docs/operations.md`.

## Contracts

Validation, recovery encoding, and the schema/OpenAPI surface come from
`@aiolm/benchmark-contracts` 0.3.0, installed from the vendored archive
`vendor/aiolm-benchmark-contracts-0.3.0.tgz` and integrity-pinned in
`package-lock.json`. The website re-exports that package rather than keeping a
second copy of the rules, and never imports app sources at runtime. Details and
the upgrade procedure in `docs/contracts-integration.md`.

## Moderation

```sh
npx tsx scripts/moderate.ts reports --limit 50
npx tsx scripts/moderate.ts hide <submission-id> --reason "..."
npx tsx scripts/moderate.ts delete <submission-id> --reason "..."
```

All mutations require `--reason` and are audit-logged. Details in `docs/operations.md`.

## Retention

Scheduled hourly inside the database with pg_cron
(`sql/operations/retention-pg_cron.sql`), with `npm run prune` as the manual
path. Both run the same policy; `docs/operations.md` has what each removes, what
it never touches, and the real upper bound of the 24h cutoffs.

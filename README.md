# AioLM Website

Website for AioLM — All-in-One LM — the desktop workspace for local language
models. Product introduction and anonymous public benchmark explorer. Next.js
App Router + PostgreSQL (Supabase-compatible) + Cloudflare Turnstile. No
accounts in v1.

- Production site: [aiolm.vercel.app](https://aiolm.vercel.app).
- Desktop app repository: [aiolm/AioLM](https://github.com/aiolm/AioLM).
- Website repository: [aiolm/AioLm-Web](https://github.com/aiolm/AioLm-Web).

- Public: browse/filter benchmark results, detail with environment/summary/safe
  Markdown descriptions, paged measurement rows, Turnstile-gated verification
  and reporting.
- Owners: manage via recovery code (`/manage`): result-scoped 30-minute session,
  description edits with `expected_revision`, deletion (tombstone). Saved
  recovery files can be picked (several at once) and opened from a list, or the
  desktop app can open the page with a single-use handoff
  ([management handoff](docs/management-handoff.md)).
- API: the wire contract is the OpenAPI document shipped by
  `@aiolm/benchmark-contracts` 0.6.1
  (`node_modules/@aiolm/benchmark-contracts/schema/openapi.json`). Routes:
  `POST /v1/upload-sessions`, `POST .../verify`, `GET ...`, `POST /v1/benchmark-runs`,
  `GET /v1/benchmark-runs`, `GET /v1/benchmark-runs/<id>`, `GET .../measurements`,
  `POST /v1/management-sessions` + `GET`/`DELETE`, `PATCH .../description`,
  `DELETE ...`, `POST .../reports`. `GET /v1/readiness` is the deployment
  probe and is not part of the shared contract. `POST /v1/management-handoffs`
  and `POST /v1/management-handoffs/<id>/redeem` are a website extension
  documented in [management handoff](docs/management-handoff.md). Website-specific discovery
  query extensions and `GET /v1/benchmark-runs/options` are documented in
  [benchmark discovery](docs/benchmark-discovery.md).

Runs on **Node 22** (`engines.node`, `.nvmrc`, CI, and the Vercel project all
pin the same major).

## Desktop installation

The homepage has Windows and Linux installation tabs in English, Korean,
Japanese and Chinese. Linux targets Ubuntu 24.04+ x86_64 with DEB/AppImage;
its tab includes the DEB command, release downloads and a localized
[installation guide](https://github.com/aiolm/AioLM/blob/main/docs/guides/install.md#linux).
Linux release assets are available starting with desktop v0.3.0; the guide
also covers pre-release validation builds. macOS remains planned. Keep these tabs, the OS FAQ and SoftwareApplication
metadata consistent when the supported platforms change.

## Public pages

All page routes below use a language prefix: `/en`, `/ko`, `/ja`, or `/zh`
(Simplified Chinese), for example `/ko/benchmarks`. Legacy unprefixed URLs
redirect using the saved language or browser preference, with English fallback.
The header language selector preserves the current page, query and fragment.
APIs remain at `/v1/**`. See [language routing and catalogs](docs/internationalization.md).

- `/`: product introduction to the AioLM desktop workspace, with links to the
  GitHub repository, documentation, and benchmark explorer.
- `/benchmarks`: a left filter sidebar with model, hardware, execution environment,
  and measurement groups; results alongside it. Common conditions
  stay visible and secondary conditions expand with editable suggestions and
  numeric ranges. Find a model matches only the model name, repository, file,
  and hash (`model_query`); links carrying the older all-fields `q` or label-only
  `model` keep their meaning. Narrow screens use a collapsible filter panel.
  Apply filters submits the draft; basis point and sorting apply immediately.
  Filters, basis point and sorting remain in the URL.
  Every speed is read at one operating point - one input length at one
  concurrency - so a column compares like for like; the two speed orders rank at
  the basis point and require one. Select up to three results for a
  summary comparison; differing methods or workloads carry a comparability notice.
  Sorting self-reported measurements does not make different setups comparable.
- `/benchmarks/[id]`: the operating points the result measured, with one chosen
  for the headline metrics, plus grouped model, runtime, hardware, workload,
  execution, and measurement context. Measurement rows load on demand and
  paginate separately.
- `/manage`: recovery-file, recovery-code, or app-handoff management for an
  owner's published result.
- `/verify/[sessionId]`: verification of an upload session from the desktop app.

The product introduction is static. Public benchmark details include server-rendered
initial content; filtering, comparisons and measurement pagination require JavaScript.
See [search and answer discovery](docs/search-discovery.md) for metadata and sitemaps.
The shared Orchid Periwinkle theme follows the system light/dark preference and
uses the desktop app's colors, gradients and brand mark. There is no palette
selector. Approved colors live in `src/theme/palette-data.json`; run
`npm run theme:generate` after changing them to regenerate the shared CSS tokens
and calibrated text/focus colors. Notice colors live in
`src/theme/status-tones.json`, with distinct icons and readable foregrounds on
soft gradients. Page components use these semantic tokens.

## Quick start (synthetic local)

```sh
cp .env.example .env.local
# Point DATABASE_URL at an isolated database, then:
npm install
npm run db:migrate
npm run dev
npm test
```

Development output lives in `.next-dev/`; production builds and `npm run start`
use `.next/`, so a build cannot overwrite a running development server's chunks.
The development command binds to `localhost:3000` and refuses a second instance
on that address. Run only one development server per checkout.

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
`@aiolm/benchmark-contracts` 0.6.1, installed from the vendored archive
`vendor/aiolm-benchmark-contracts-0.6.1.tgz` and integrity-pinned in
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

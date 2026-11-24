# AioLM Website

Website for AioLM — All-in-One LM — the desktop workspace for local language
inference engines. The desktop app is an engine-neutral GUI adapter for
llama.cpp, vLLM, MLX and compatible external inference engines. Product introduction and anonymous public benchmark explorer. Next.js
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
  `@aiolm/benchmark-contracts` 0.15.0
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

The homepage has Windows, macOS and Linux installation tabs in English, Korean,
Japanese and Chinese. macOS targets 13.3+ on Apple silicon and Intel with
DMGs (desktop v0.3.0+); its tab shows the `install.sh` command, which verifies
the DMG's SHA-256 and installs into Applications, plus release downloads and a
[macOS guide](https://aiolm.vercel.app/en/guides/install#macos).
Linux targets Ubuntu 24.04+ x86_64 with DEB/AppImage (desktop v0.2.1+); its tab
includes the DEB command, release downloads and a localized
[Linux guide](https://aiolm.vercel.app/en/guides/install#linux).
Keep these tabs, the OS FAQ and SoftwareApplication metadata consistent when the
supported platforms change.

The homepage, FAQ and search descriptions describe the adapter architecture in
all four languages. The shared social card names the built-in engines and
adapters for external inference engines. Built-in vLLM targets supported Linux or
Apple silicon macOS 15+ through vllm-metal; MLX targets Apple silicon. Automatic
external connections require a local OpenAI-compatible v1 server or an installed
engine with a clear launch method, model and platform; advanced manual adapter
registration remains available. Connecting does not enable unsupported
modalities or portable bundles. Benchmarks use one streaming text-chat method,
`openai-chat-serving@5`, for every connected engine. Runtime probes do
not certify inference quality; CPU-reference numerical verification is not
offered in the current desktop app or public CLI.

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
  concurrency - so a column compares like for like; the three point-ranked
  orders require the complete operating point. Select up to three results for a
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
uses the desktop app's colors, brand mark and control geometry. There is no
palette selector. Canvas, panels, fields, secondary actions and notices are
flat; primary actions and navigation keep the app's brand gradients. Approved
colors live in `src/theme/palette-data.json`, `status-tones.json` and
`control-tones.json`. Run `npm run theme:generate` after changing those inputs
to validate contrast and regenerate the shared CSS tokens.

Typography shares the app's interface hierarchy across every page and locale,
while long web prose keeps a 16px reading size. See the [design
system](docs/design-system.md) for shared roles, responsive/zoom policy and
lint/build enforcement.

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
`@aiolm/benchmark-contracts` 0.15.0, installed from the vendored archive
`vendor/aiolm-benchmark-contracts-0.15.0.tgz` and integrity-pinned in
`package-lock.json`. The website re-exports that package rather than keeping a
second copy of the rules, and never imports app sources at runtime. Details and
the upgrade procedure in `docs/contracts-integration.md`.

Contract 0.15.0 defines one public method: `openai-chat-serving@5` with
`schema_version: 4`. Every accepted result is a Cold Prompt run: no workload
warmup, `corpus_version: 2`, `cache_policy: "cold_prompt"`, a fresh 32-hex
`prompt_nonce` and a unique `input_sha256_by_request` entry for each dispatched
request. The desktop requests at most 128 output tokens; the public bound is
1–128. Required request descriptors are `max_tokens`, `stream` and
`temperature`; `stream_options.include_usage` appears exactly when
`request_usage` is true. Early completion and missing usage are valid, so
reported token metrics stay null without evidence. Forced generation, workload
warmup and every retired method/schema version are rejected.

The eight metrics are `first_output_ms`, `prefill_tokens_per_second`,
`decode_tokens_per_second`, `tpot_ms`, `reported_tokens_per_second`,
`output_bytes_per_second`, `e2e_ms` and `peak_memory_bytes`. Token metrics
depend on engine-reported usage; byte and time observations remain available
when token metrics are null. The method records input isolation without claiming
a cold start or verified-empty engine caches. Public identity never derives from
local connection IDs or paths. Apply migrations through 016 with the dedicated
migration owner before deploying; migration016 deletes retired benchmark
records, their measurement chunks, pending upload sessions and reports rather
than keeping unreadable history. Quota buckets and the audit log are preserved,
and discovery then has a single list, basis point and comparison signature.

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

## Product guides

`/<locale>/guides` provides installation, first conversation, engine selection and external inference engine setup in all four site languages. Instructions use the visible button names, direct platform download choices and one action per illustrated step. Technical details and validation limits remain in expandable sections. User-facing help stays on the site; GitHub hosts release downloads, source and license.

The current screenshots were captured from the native macOS app built from
desktop v0.3.4 source (`SCREENSHOT_SOURCE_VERSION` in
`src/lib/desktop-release.ts`), not browser-only rendering. They remain historical
illustrations of model, chat, installation and connection flows, not evidence of
the v0.4.3 layout. The homepage caption and all localized guide notices disclose
both versions. Keep the capture version unchanged unless native images are
actually recaptured, and update their manifest hashes together with the assets.

Keep `DESKTOP_RELEASE_VERSION` in the same file tied to the latest published
installer assets (v0.4.3 for this release update). Advance that version only after the desktop
release's exact-source CI, all four platform package builds and public-download
verification pass. Installer links, checksum examples, the homepage source
notice and the four localized guide notices share this value.

The localized homepage and guides follow desktop v0.4.3 and the current
unreleased desktop updates. They cover engine-neutral All formats/Trending
search with repository-read retry, an optional OS-stored Hugging Face access
token for gated repositories, repository file filtering, GGUF and per-weight
HF/MLX bundles, pause/resume with retained data and end-to-end digest checks, and isolated background download jobs that keep Discover search, repository inspection, provider discovery, runtime installs, and update checks responsive during concurrent transfers. A mutually exclusive header Downloads popover (alongside Model loading and Activity & notices, without header spinners or duplicate failure popovers) consolidates model, runtime (release and PR), and application update downloads with live transfer speed, active/paused/completed/failed sections, pause/resume/discard, and one-click Configure, paired with inline paused-transfer controls in Discover. The desktop window opens maximized on every platform. Library Saved sessions, local model sorting (default, running first, name, size) with engine filtering, header/Chat default-session controls,
supporting-file search reveal, model updates with file reuse, shared profiles,
automatic first-available runtime selection and Choose runtime → Choose profile →
Adjust options remain the execution flow. Save profile & start closes the editor
automatically and tracks background launch in the header Model loading popover with Cancel and failure recovery; wide
workspaces, meaning-first option titles paired with primary CLI/JSON keys and
grouped controls use the available window. Resource guidance distinguishes
physical/shared memory pools, allocation, capacity overflow, stored files and
binary byte units instead of equating file size, reclaimable cache and permanent
RAM.

External discovery uses executable headers rather than favored names, excludes
non-launchable support files and requires explicit checking of installation
candidates, including a sole preselected folder item. Only a sole running server
may be checked automatically. Resolved command/address labels, readable library
display names (without file extensions or split-GGUF shard counters) for managed
connections, help-derived grouped controls, literal-token launch arguments and
protected/duplicate flag safeguards, Command and help tools, Recheck options and
launch-time unchanged-help re-confirmation are described without claiming every
engine/device is compatible. Previously verified models avoid a redundant
temporary load/unload; readiness still checks the actual serving process and
model identity, and Windows DLL load failures are surfaced explicitly.
Standard managed Python runtime installs (non-Metal vLLM and mlx-vlm) require
binary wheels only without falling back to source builds. Windows llama.cpp ROCm packaging auto-discovers standard AMD ROCm/HIP SDK directories (in addition to HIP_PATH/ROCM_PATH/hipcc), supports split bin/ DLL and lib/ kernel layouts, and surfaces context-specific packaging guidance across release, PR, repair, and bundle flows.

Internal chat is independent of the explicitly started API server. The server
keeps its rotatable API key in a private `api-key` file inside the AioLM data
folder across app and server restarts, serves OpenAI-compatible (`/v1/models`,
`chat/completions`, `completions`, `embeddings`, `responses` with stream cancel,
`audio/transcriptions`, `audio/translations`) and Anthropic Messages
(`/v1/messages`) routes, translates Anthropic Messages and OpenAI Responses
function tools when supported by the engine and enforces loopback Host and
connection limits. Chat offers sidebar conversation search, user-turn editing
and resending, assistant regeneration, code-block copy headers and clipboard or
drag-and-drop image attachments with a lightbox preview. It scopes pending turns,
tool approvals and errors to the owning conversation, and MCP
server first launches, desktop help execution, project document bindings and
unpicked manifest paths require native OS approval. Personal AGENTS.md
instructions retain their precedence and read-only role. Explicit skills work
across engines; engines without declared tool calling omit the automatic
catalog and read tool, and long catalog descriptions are shortened without
losing the full entry point. The guides also explain verification-first
installs (with one-liners as convenience alternatives), close-to-tray with live
tray-menu status of loaded models and the API server,
configurable login startup, CLI `runtime discover`/`connect` and log compaction,
and 60-second clipboard clearing for copied recovery codes. New Cold Prompt
`openai-chat-serving@5` benchmarks isolate measured inputs with a fresh run nonce
and per-point/request prefixes, without force declarations or per-point model reloads.
Startup update notices do not install an update automatically; manual update downloads report progress and speed in the header Downloads popover before verifying SHA-256.
The desktop's public-benchmark explorer is an unprivileged, private-browsing
window loading the existing website directly, not an iframe or a second explorer
implementation. Its app-owned toolbar offers profile creation on a public
result; an ordinary browser does not have that control. The native app fetches
the public detail API and validates the recorded settings. It preserves existing
profiles, assignments and running models, reuses an existing import, and reports
unsupported options. Importing neither downloads model files nor installs a
runtime. No native IPC or owner credentials are added to the website.

Guide copy lives in `src/content/guides`. Published app screenshots must be captured from a running native desktop app with its real Rust backend. Use an isolated profile and public model files; never substitute IPC responses, installed-runtime status, discovery results or model answers. Temporary capture builds, old screenshots and one-off validation materials are not maintained repository artifacts.

`public/screenshots/current/manifest.json` contains only the locale, image ID,
path, dimensions and SHA-256 used to render and cache the 84 published images:
19 guide screens and two homepage themes per language. Capture logs, process
records, DOM snapshots and per-image validation JSON are not shipped or kept.

Homepage images follow the selected language and system light/dark preference.
Hash-versioned URLs invalidate image caches when files change. Tests check
locale/theme coverage, PNG dimensions and file hashes. Guide images enlarge in
an accessible native dialog, with horizontal viewing on small screens.

Screenshots do not establish model quality, every engine/device combination,
F09 resolution, full Linux acceptance or historical update-installation results.

The external-engine guide leads with the automatic flow available in v0.3.3 and later: find a local server or choose an installation folder, select a model, then connect. It does not ask users for engine IDs, JSON, executables or probe commands. The current implementation targets loopback OpenAI-compatible v1; it does not infer or translate arbitrary wire protocols. A running local server must return an actual model list before it is offered, and actual text/chat and SSE checks must pass before a connection is saved. An existing server remains outside AioLM's process ownership; disconnecting stops AioLM's proxy, not the original server. An installed program is considered for managed launch only when its launch method and model identity are clear. Ambiguous commands or models, different protocols and required credentials remain unconfirmed. An already running container server can use the same local protocol, but automatic container/daemon creation and management are not implemented. Availability of this flow does not establish all-engine validation.

Manual registration remains under expandable advanced guidance, illustrated with the current native app. That section distinguishes provider-authored `*.setup.json` input recipes with companion programs, provider/developer-prepared completed registration JSON for advanced import (`*.engine.json` is only a filename example), and the engine's own configuration files such as `deployment.json`. Manual registration does not require either import file: the form constructs the registration and successful registration saves it internally as `adapters/<engine-id>/<runtime-id>/registration.json`. It does not export a separate `.engine.json` or infer unknown model/port/probe settings.

Public guides describe the common connection contract and file roles rather than publishing an external-engine catalog. The former `/<locale>/guides/external-engines` URL permanently redirects to `/<locale>/guides/adapters#files`.


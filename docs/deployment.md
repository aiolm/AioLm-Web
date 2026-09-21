# Deployment

Target: managed Vercel + Supabase PostgreSQL + Cloudflare Turnstile. No Redis/message queue.

Canonical production site: [https://aiolm.vercel.app](https://aiolm.vercel.app).
Connect the Vercel project to the website repository
[aiolm/AioLm-Web](https://github.com/aiolm/AioLm-Web). The desktop app lives in
[aiolm/AioLM](https://github.com/aiolm/AioLM).

Set this public configuration pair in the production environment before building
and deploying:

```dotenv
SERVICE_ORIGIN=https://aiolm.vercel.app
TURNSTILE_EXPECTED_HOSTNAME=aiolm.vercel.app
```

Authorize `aiolm.vercel.app` in the production Turnstile widget. The homepage
canonical URL and site metadata base use `SERVICE_ORIGIN`; preview environments
must supply their own matching origin and hostname. These public values do not
replace the secret credentials listed below.

Runtime: **Node 22**. Pinned in `package.json` (`engines.node: "22.x"`), `.nvmrc`,
and the CI workflow, so the local shell, CI, and the Vercel build all resolve the
same major. Set the same version in the Vercel project's Node.js Version setting.

## Environment

Two environments hold different credentials, and mixing them is the thing to
avoid. Split them deliberately.

### Web runtime (Vercel project env) — never commit values

Only what an anonymous request handler needs. It gets the **least-privilege
runtime database role and nothing else**.

- `DATABASE_URL`: Supabase pooler URL for the `aiolm_web_runtime` login
  (transaction mode, port 6543). TLS is verified against every remote server
  (`rejectUnauthorized: true`; pin a private CA with `DATABASE_CA_CERT`,
  otherwise the platform trust store applies). Only a non-production loopback
  target connects without TLS, so operator commands run from a workstation get
  verified TLS too.
- `PERMIT_HMAC_SECRET`, `MANAGEMENT_HMAC_SECRET`, `QUOTA_HMAC_SECRET`: 32+ random
  bytes (base64url), unique per environment and different from each other.
- `TURNSTILE_SECRET_KEY` (server-only), `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public).
  Cloudflare's testing keys always pass or always fail and are rejected by
  `npm run config:check`.
- `TURNSTILE_EXPECTED_HOSTNAME`: must equal `SERVICE_ORIGIN`'s host.
- `TURNSTILE_VERIFY_ACTION=benchmark_publish`, `TURNSTILE_REPORT_ACTION=benchmark_report`.
  These two names are compiled into the browser widget, so a different value
  here makes every siteverify fail with `action-mismatch`. Leave them unset to
  take the matching defaults.
- `SERVICE_ORIGIN`: public root origin (`https://aiolm.vercel.app` in production).
  Used for site metadata, the homepage canonical URL, `verification_url`,
  recovery-code origin binding, and the exact
  `Origin` header match on management mutations. A path, query, fragment, or
  credentials are rejected; in production HTTPS is required (the HTTP loopback is
  accepted only in development/test).
- Quota overrides: `QUOTA_PER_IP_HOUR=20`, `QUOTA_PER_IP_DAY=100`, `QUOTA_GLOBAL_DAY=1000`,
  `QUOTA_GLOBAL_BYTES_DAY=67108864`, `QUOTA_GLOBAL_ROWS_DAY=250000`,
  `QUOTA_SESSION_CREATE_PER_MIN_IP=5`, `QUOTA_INVALID_MANAGE_PER_MIN_IP=10`,
  `QUOTA_REPORT_PER_HOUR_IP=3`. A value that is not a positive integer is
  silently ignored in favour of the default; `config:check` reports it.
- Capacity guard: `PROVISIONED_BYTES`, `PROVISIONED_ROWS` from the database plan.
  **Required.** With neither set, production fails closed and *every* new
  publish returns 503 `Publishing paused: storage capacity is not configured.`
  At 80% the API stops accepting new publishes (deletion stays available).

**Must NOT be set in the web runtime:** `DATABASE_MIGRATION_URL`,
`DATABASE_MODERATION_URL`, `SYNTHETIC_TEST_MODE`, `TEST_FIXTURE_TURNSTILE_TOKEN`.
The public web function never runs DDL and never moderates, so shipping those
URLs into it would place an owner-level and a moderation-level credential in the
process that serves anonymous traffic. `npm run config:check` fails on each of
them.

### Operator shell (a workstation or CI, never the web project)

Used by `npm run db:migrate`, `npm run moderate`, `npm run prune`, and the
pg_cron setup script. Keep these in a password manager or a CI secret store.

- `DATABASE_MIGRATION_URL`: migration-owner URL. Required in production (fail closed).
- `DATABASE_MODERATION_URL`: moderation-role URL. Required in production (fail closed).
- `DATABASE_URL`: the runtime URL, for `npm run prune` (the manual retention pass).

The backup commands in `docs/backup.md` additionally use the **direct**
(non-pooler) connection string: `pg_dump` does not work through the transaction
pooler. That is a shell variable for those commands, not application config.

## Validating configuration

`npm run config:check` reads the environment and reports every production
requirement, without connecting to anything and without printing a configured
secret value.

**A production secret cannot be read back out of Vercel.** Production and
preview variables are stored as Secrets (the type formerly called Sensitive,
and what `vercel env add` now defaults to for those environments): the value
stays available to the build container and to the running function, and it can
be replaced, but nobody can retrieve it afterwards — not in the dashboard, not
with `vercel env ls`, and not with `vercel env pull` or `vercel env run`, which
can only hand over values the platform is still allowed to decrypt. A pulled
file therefore cannot supply the real production values to `config:check`.
(`vercel env pull` is still the normal way to fetch *development* variables for
local work; that environment is not stored as Secret.)

So validation is three separate checks, and each answers something the other
two cannot.

**1. Which keys exist.** `vercel env ls production` lists every key with its
environment and type, values withheld. That is enough for the presence rules
above: every web-runtime variable present, and `DATABASE_MIGRATION_URL`,
`DATABASE_MODERATION_URL`, `SYNTHETIC_TEST_MODE`, `TEST_FIXTURE_TURNSTILE_TOKEN`
absent.

**2. Whether the values themselves are valid.** Run `config:check` in the
operator shell against the approved values from wherever they are kept (the
password manager or CI secret store that holds them), entered without echoing
and never written into the working tree:

```sh
# Paste each value at the prompt; `read -s` keeps it off the screen, and out of
# shell history in a way `export NAME=value` would not.
read -rsp 'PERMIT_HMAC_SECRET: ' PERMIT_HMAC_SECRET && export PERMIT_HMAC_SECRET
# ...and the rest of the variables for the scope being checked.

npm run config:check              # web-runtime scope: elevated URLs are failures
npm run config:check -- --operator  # operator scope: elevated URLs are expected
```

This validates the values the operator holds. That they are the values the
project actually carries is the operator's to guarantee — Vercel will not
confirm it — which is what the third check is for. Exit the shell when done; an
exported secret lives as long as the process. If a file is used instead, keep it
outside the repository and delete it afterwards: `.env` and `.env.*` are
excluded from git and from the deployment upload, but a secret on disk is still
a secret on disk.

**3. What the deployment actually holds.** `GET /v1/readiness` runs this same
`checkProductionConfig` inside the deployment, against its real environment,
before it spends a database connection. It is the only check that reads the
deployed values, and it reports one bit: ready or not (see below).

`config:check` exits non-zero when anything failed. It catches the whole class
of problems that build and boot cleanly and then fail at the first real request:
an unconfigured capacity guard, a Turnstile testing key, an action name the
widget never sends, a hostname that does not match the origin, a reused HMAC
secret, a loopback database URL, and a leftover test bypass.

## Readiness

`GET /v1/readiness` is the HTTP deployment check. It answers `200 {"status":"ready"}`
only when both hold:

1. The production configuration validates. This is settled first and answers on
   its own, so a misconfigured deployment never spends a database connection.
2. A ledger read — bounded inside PostgreSQL with a transaction-local
   `statement_timeout`, so a probe that gives up leaves no statement running —
   shows that **every** migration in `sql/migrations/` has been applied. A
   database missing even one is not ready; one carrying extra newer migrations
   still is. This also proves connectivity, the private `bench` schema, and the
   runtime role's SELECT grant from `007_readiness_grant.sql`.

Anything else is `503 service_unavailable` with `Retry-After`.

The response is deliberately shapeless: it never says which check failed. That
detail is operator information and lives in `npm run config:check` and the
platform logs. Point an uptime monitor at it; read `config:check` when it turns red.

## Database

1. Create the Supabase project in the same region as the Vercel functions
   (`vercel.json` pins `icn1`/Seoul; pair it with `ap-northeast-2`).
2. Disable the exposed Data API (the app uses only the pooler connection string).
3. Run migrations with the migration role: `npm run db:migrate`. This applies
   `sql/migrations/*.sql` in one transaction (including `002_roles.sql`, which
   creates the least-privilege `aiolm_web_runtime` / `aiolm_web_moderation` roles
   — no manual uncommenting), then switch the app URLs to those roles:
   `CREATE USER app_login PASSWORD '<from-vault>'; GRANT aiolm_web_runtime TO app_login;`
   (and a separate login for moderation inheriting `aiolm_web_moderation`).
4. Install the scheduled retention job:
   `psql "$DATABASE_MIGRATION_URL" -f sql/operations/retention-pg_cron.sql`
   (see `docs/operations.md`). Enable the pg_cron extension first.
5. Backups: see `docs/backup.md`. There is no provider-managed backup on the
   free plan — take the documented dump before every risky change.

## Vercel

- Framework preset: Next.js. Build: `npm run build`. Output: default.
- `vercel.json` pins the framework and the `icn1` region so the functions sit
  next to the database. If the plan refuses a `regions` entry, delete it from
  `vercel.json` and set the region in the project's Function Region setting.
- Node.js Version: 22.x, matching `engines.node`.
- Set the web-runtime variables above per environment (preview gets its own
  database + Turnstile keys, and its own `SERVICE_ORIGIN`).
- Client IP: the app trusts `x-vercel-forwarded-for` only. Do not put another
  proxy in front without updating `src/lib/ip.ts`.
- Cache: public pages/APIs send `no-store`; static assets cache normally.
- No cron entry is configured. Retention runs hourly inside the database with
  pg_cron, which the once-per-day granularity of a Hobby cron cannot match.
- What ships: `.vercelignore` keeps tests, CI, `docs/`, the operator scripts,
  `sql/`, local caches, and every `.env*` file out of the upload, and records
  what each exclusion was checked against. `sql/` and `scripts/` are
  operator-only: nothing enumerates `sql/migrations/` at runtime (readiness
  compares the ledger against `REQUIRED_MIGRATIONS`) and no build step runs a
   script. `package-lock.json` and `vendor/aiolm-benchmark-contracts-0.5.1.tgz`
  stay in the upload — the build installs the contracts package from that
  archive.

## Go-live checklist

- [ ] `npm run config:check` passes against the approved production values,
      supplied from the operator secret store (they cannot be pulled back out of
      Vercel — see Validating configuration).
- [ ] `vercel env ls production` shows exactly the intended keys.
- [ ] Migrations applied (through `012_operating_points.sql`); roles
       least-privilege; Data API disabled.
- [ ] `GET /v1/readiness` returns `200 {"status":"ready"}` on the deployed origin.
- [ ] `DATABASE_MIGRATION_URL` / `DATABASE_MODERATION_URL` are absent from the
      Vercel project env, and present only in the operator shell.
- [ ] All secrets unique per environment; placeholders removed.
- [ ] Turnstile hostname/actions verified end-to-end (publish + report) with a
      real key pair, not a Cloudflare testing key.
- [ ] Quota defaults reviewed; `PROVISIONED_BYTES` and `PROVISIONED_ROWS` set.
- [ ] Retention scheduled: `cron.job` has an active `aiolm-web-retention` row.
- [ ] Synthetic tests green: `npm test`; integration (with isolated DB): `npm run test:integration`.
- [ ] Moderation CLI access tested with the moderation role URL.

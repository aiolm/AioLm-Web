# Operations

## Publishing budgets (defaults match the shared spec)

- New uploads: per-IP 20/hour + 100/day; global 1000/day AND 64 MiB/day AND 250,000 rows/day. First reached limit wins (HTTP 429 + `Retry-After`).
- Session-create 5/min/IP; invalid management attempts 10/min/IP; reports 3/hour/IP.
- Invalid management attempts are enforced at entry (429 + `Retry-After`) before the owner-hash lookup, per IP. A tripped IP waits for the next minute window; other client IPs/scopes are unaffected, and valid owner operations never consume the invalid budget.
- Replays (same ID+owner+body), reads, management, and deletion are exempt from new-upload quota.
- Quota keys store `HMAC(IP)` only; raw IPs are never persisted. Buckets expire after 24h at the latest and are removed by the retention job below.
- Opening a NEW management session fails closed with `503 service_unavailable` + `Retry-After` when the invalid-attempt budget cannot be enforced at all: no trusted client IP, no `QUOTA_HMAC_SECRET`, or a quota store that errors. Owner bearer edit/delete and the `GET`/`DELETE` of an existing session do not consult that budget and stay available in the same state.

## Readiness and failure modes

`GET /v1/readiness` is the deployment probe: `200 {"status":"ready"}` only when
the production configuration validates (settled first, before any database
work) and a ledger read shows every migration in `sql/migrations/` applied,
otherwise `503` + `Retry-After`. The read is bounded by a transaction-local
`statement_timeout`, so a probe that gives up does not leave a statement
running on a pooled backend. It never says which check failed or which
migration is missing — run `npm run config:check` in the operator shell for
that, and read the platform logs.

A database outage answers `503 service_unavailable` + `Retry-After` with a
`{error:{code,message}}` body on every management path, including
`GET /v1/management-sessions` and `DELETE /v1/management-sessions`. Two distinctions
matter when reading logs or client behaviour:

- `503` is retryable. A bare `500` is not, and an outage must never surface as
  one, or the desktop app stops retrying a transient blip.
- On these two routes an outage must also never surface as `401` (GET) or
  `204` (DELETE). Those answers state something about the caller's session —
  "it is gone", "it is now revoked" — that an unreachable store cannot support.
  A `204` from DELETE means the session really is revoked.

Raw database messages are never echoed to a client in any of these paths.

## Retention

Two paths run the same policy. The scheduled one runs **inside the database**
with pg_cron; the manual one is the `npm run prune` CLI. Either is safe to run
at any time, and running both changes nothing beyond the counters.

### Scheduled (production)

`sql/operations/retention-pg_cron.sql` installs `bench.run_retention()` and
schedules it hourly under the job name `aiolm-web-retention`. It is an
operational script, not a migration: pg_cron is not available on every cluster,
and the file is re-runnable by design.

```sh
# Enable pg_cron first (Supabase: Database -> Extensions -> pg_cron), then:
psql "$DATABASE_MIGRATION_URL" -f sql/operations/retention-pg_cron.sql
```

Re-running it replaces the job rather than stacking duplicates. Without pg_cron
it still installs the function and prints a notice, so the manual path keeps
working.

The schedule call resolves the schema that owns `schedule()` through `pg_depend`,
not the schema the extension is registered in. A managed pg_cron registers
against `pg_catalog` while creating its functions and tables in `cron`, so
trusting the registration produced `pg_catalog.schedule(...)` and the install
failed with `42883 function pg_catalog.schedule(unknown, unknown, unknown) does
not exist`. If pg_cron is installed but owns no three-argument
`schedule(name, schedule, command)`, the script raises rather than leaving an
unscheduled function behind. Verify and inspect:

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'aiolm-web-retention';
select status, return_message, start_time from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'aiolm-web-retention')
 order by start_time desc limit 10;
select bench.run_retention();            -- one pass by hand
select cron.unschedule('aiolm-web-retention');  -- remove the schedule
```

The function runs with invoker rights and `EXECUTE` revoked from `PUBLIC`: pg_cron
executes it as the owner that scheduled it, and neither `aiolm_web_runtime` nor
`aiolm_web_moderation` can start a pass.

No Vercel cron entry is configured. A Hobby cron fires at most once a day, which
would push the retention bound to ~48h; pg_cron holds the hourly target.

### Manual (any scheduler, incident response, local)

```sh
npm run prune   # DATABASE_URL must be set; prints a JSON counter line
# {"prunedQuotaBuckets":12,"clearedReportIpHmacs":3,"prunedManagementSessions":8,"prunedUploadSessions":41}
```

It runs as the runtime role, which holds exactly the grants it needs
(quota-bucket delete, `reporter_ip_hmac` column update, and delete on the two
session tables — see `sql/migrations/005_retention_grants.sql`).

### What it removes

| State | Removed once | Never touched |
| --- | --- | --- |
| `bench.quota_buckets` | `expires_at` has passed | — |
| `bench.reports.reporter_ip_hmac` | 24h after the report row was created | the report row itself |
| `bench.management_sessions` | 24h after expiry, or 24h after revocation | — |
| `bench.upload_sessions` | 24h after expiry (sessions and their permits live at most 5 minutes) | — |

Tombstones in `bench.benchmark_runs`, the moderation audit log
(`bench.audit_log`), and report rows are never deleted by this job.

### The real upper bound

The cutoffs above are the *target*. A row that becomes eligible just after a run
waits for the next one, so the actual upper bound is the cutoff plus one
scheduling interval:

| Schedule | Actual upper bound for the 24h rules |
| --- | --- |
| hourly (what pg_cron runs) | up to 25h |
| every 6h | up to 30h |
| daily | up to 48h |

Do not describe this as "deleted after exactly 24 hours"; with a daily job a
reporter IP HMAC can survive for nearly two days.

## Moderation

```sh
npx tsx scripts/moderate.ts reports --limit 50
npx tsx scripts/moderate.ts hide <submission-id> --reason "..."
npx tsx scripts/moderate.ts unhide <submission-id> --reason "..."
npx tsx scripts/moderate.ts delete <submission-id> --reason "..."
npx tsx scripts/moderate.ts dismiss-report <report-id> --reason "..."
```

(Flag-bearing commands use `npx tsx` directly because `npm run` intercepts `--flag` arguments.)

- Uses `DATABASE_MODERATION_URL` (protected role). Every mutation needs `--reason` and writes `bench.audit_log`.
- `hide` removes the record from public listing/detail (owners can still see it via proof). Description edits never unhide.
- `delete` removes payload/chunks/description/summary and revokes sessions; a minimal tombstone (submission/body-hash/owner-hash/public id) remains so retries return 410 `submission_deleted`.
- Report reasons are bounded to 2000 chars and Turnstile-checked (`benchmark_report`).

## Capacity guard

Measured scope: the whole private `bench` schema — every table with its indexes and TOAST (runs, 1000-row chunks, upload/management sessions, reports, quota buckets, audit log) — plus the non-deleted payload row total. Size `PROVISIONED_BYTES`/`PROVISIONED_ROWS` against this same scope from the database provider dashboard. At 70% operators should be alerted (dashboard); at 80% NEW publishing stops with 503 while replay/read/management/deletion stay available. If the guard itself errors, new publishing fails closed.

## Logging

Structured JSON lines: route, status, code, latency ms, byte counts. No bodies, tokens, or recovery keys are logged. Tail via the hosting provider.

## Incidents

- Spam wave: tighten quotas via env, hide offending submissions, rotate Turnstile keys if bypassed.
- Compromised secret: rotate the affected `*_HMAC_SECRET`; permits/sessions/cookies invalidate automatically (HMAC-bound).
- Bad deploy: roll back Vercel; migrations are additive — never edit applied migrations, add a new one.

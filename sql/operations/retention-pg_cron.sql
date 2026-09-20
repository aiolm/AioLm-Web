-- Hourly retention inside the database, scheduled with pg_cron.
--
-- This is an OPERATIONAL script, not a migration. It deliberately lives outside
-- sql/migrations/ for two reasons: pg_cron is not available on every cluster
-- (the isolated synthetic test databases used by `npm run test:integration` do
-- not have it), and it is re-runnable by design, whereas the migration ledger
-- records each file once against a checksum. Running it never changes an
-- applied migration.
--
-- Run it with the MIGRATION-OWNER connection, once per environment and again
-- after any change to this file:
--
--   psql "$DATABASE_MIGRATION_URL" -f sql/operations/retention-pg_cron.sql
--
-- pg_cron must be enabled first (Supabase: Database -> Extensions -> pg_cron).
-- If it is not, this script still installs the function and tells you what is
-- missing instead of failing halfway.
--
-- WHAT IT REMOVES (identical to `npm run prune`, which stays available as the
-- manual path):
--
--   bench.quota_buckets        rows whose expires_at has passed
--   bench.reports              reporter_ip_hmac blanked 24h after the report
--                              was created; the report row itself survives
--   bench.management_sessions  rows expired, or revoked, more than 24h ago
--   bench.upload_sessions      rows expired more than 24h ago (a session and
--                              its permit live at most 5 minutes)
--
-- It never deletes a benchmark tombstone, an audit_log entry, or a report row:
-- those are the deletion and moderation ledgers.
--
-- SCHEDULE AND THE REAL BOUND. The 24h figures are the target cutoff. A row
-- that becomes eligible just after a run waits for the next one, so the actual
-- upper bound is the cutoff plus one interval: hourly gives up to 25h. Do not
-- describe this as "deleted after exactly 24 hours".

begin;

-- Retention pass. Returns one jsonb counter object with the same field names
-- that `npm run prune` prints, so either path is readable the same way.
--
-- SECURITY INVOKER (the default) on purpose: pg_cron executes the job as the
-- role that scheduled it, which already owns these tables. A definer-rights
-- function would hand its owner's delete privileges to every role that can call
-- it, which is exactly what the least-privilege split in 002/003/005 avoids.
-- The search_path is pinned so the pinned schema qualifications cannot be
-- shadowed by a caller-controlled path.
create or replace function bench.run_retention()
returns jsonb
language plpgsql
set search_path = pg_catalog, bench
as $fn$
declare
  session_grace constant interval := interval '24 hours';
  report_grace  constant interval := interval '24 hours';
  pruned_quota_buckets       bigint;
  cleared_report_ip_hmacs    bigint;
  pruned_management_sessions bigint;
  pruned_upload_sessions     bigint;
begin
  delete from bench.quota_buckets where expires_at <= now();
  get diagnostics pruned_quota_buckets = row_count;

  update bench.reports set reporter_ip_hmac = null
   where created_at < now() - report_grace
     and reporter_ip_hmac is not null;
  get diagnostics cleared_report_ip_hmacs = row_count;

  delete from bench.management_sessions
   where expires_at <= now() - session_grace
      or (revoked_at is not null and revoked_at <= now() - session_grace);
  get diagnostics pruned_management_sessions = row_count;

  delete from bench.upload_sessions where expires_at <= now() - session_grace;
  get diagnostics pruned_upload_sessions = row_count;

  return jsonb_build_object(
    'prunedQuotaBuckets', pruned_quota_buckets,
    'clearedReportIpHmacs', cleared_report_ip_hmacs,
    'prunedManagementSessions', pruned_management_sessions,
    'prunedUploadSessions', pruned_upload_sessions
  );
end;
$fn$;

-- Only the owner (and the scheduler running as the owner) may run a pass.
-- PUBLIC gets EXECUTE on new functions by default, which would let the runtime
-- and moderation roles trigger retention.
revoke all on function bench.run_retention() from public;

commit;

-- Schedule hourly, at the top of the hour, under the stable job name
-- 'aiolm-web-retention'. cron.schedule(name, schedule, command) replaces an
-- existing job with the same name, so re-running this file re-points the job
-- rather than creating a duplicate. Dynamic SQL because the cron schema does
-- not exist on clusters without the extension.
--
-- The schema to call is the one that HOLDS schedule(), which is not the schema
-- the extension is registered in. A managed pg_cron (Supabase) registers the
-- extension against pg_catalog while creating its functions and tables in the
-- cron schema, so deriving the name from pg_extension.extnamespace built a call
-- to pg_catalog.schedule(...) and the install failed with 42883 "function
-- pg_catalog.schedule(unknown, unknown, unknown) does not exist". pg_depend
-- carries the association that actually answers which schedule() belongs to
-- pg_cron, and pg_proc.pronamespace is where that function can be called.
do $sched$
declare
  cron_schema text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice
      'pg_cron is not installed: bench.run_retention() is ready but NOT scheduled. Enable pg_cron, then re-run this file. Until then run `npm run prune` on a schedule.';
    return;
  end if;

  select n.nspname
    into cron_schema
    from pg_depend d
    join pg_proc p on p.oid = d.objid
    join pg_namespace n on n.oid = p.pronamespace
    join pg_extension e on e.oid = d.refobjid
   where d.classid = 'pg_proc'::regclass
     and d.refclassid = 'pg_extension'::regclass
     and d.deptype = 'e'
     and e.extname = 'pg_cron'
     and p.proname = 'schedule'
     and p.pronargs = 3
   limit 1;

  if cron_schema is null then
    raise exception
      'pg_cron is installed but owns no three-argument schedule(name, schedule, command): bench.run_retention() is ready but NOT scheduled. Check the pg_cron version, then re-run this file.';
  end if;

  execute format(
    'select %I.schedule(%L, %L, %L)',
    cron_schema,
    'aiolm-web-retention',
    '0 * * * *',
    'select bench.run_retention()'
  );
  raise notice 'scheduled aiolm-web-retention hourly (0 * * * *) through %.schedule().', cron_schema;
end;
$sched$;

-- Verify and inspect (run as the migration owner):
--
--   select jobid, jobname, schedule, command, active
--     from cron.job where jobname = 'aiolm-web-retention';
--
--   select status, return_message, start_time, end_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'aiolm-web-retention')
--    order by start_time desc limit 10;
--
-- One pass by hand, without waiting for the hour:
--
--   select bench.run_retention();
--
-- Remove the schedule (the function stays, and `npm run prune` still works):
--
--   select cron.unschedule('aiolm-web-retention');

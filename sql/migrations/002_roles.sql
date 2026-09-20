-- Least-privilege roles for the benchmark website.
-- Applied by the migration owner (DATABASE_MIGRATION_URL) via `npm run db:migrate`.
-- No passwords are stored here: these are NOLOGIN privilege roles. Operators
-- create per-environment LOGIN roles that inherit them (see docs/deployment.md),
-- e.g. CREATE USER app_login PASSWORD '<from-vault>'; GRANT aiolm_web_runtime TO app_login;
--
-- Runtime: serves the public API and owner flows (including owner deletion,
-- which updates the run row and removes its chunks). It cannot moderate
-- (hide/delete-as-operator, dismiss reports), read the audit log, or run DDL.
-- Moderation: triages reports and hides/deletes with audit reasons. It cannot
-- create runs, sessions, or quota state.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'aiolm_web_runtime') then
    create role aiolm_web_runtime with nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'aiolm_web_moderation') then
    create role aiolm_web_moderation with nologin;
  end if;
end $$;

-- Nobody except the migration owner gets implicit access to the private schema.
revoke all on schema bench from public;
grant usage on schema bench to aiolm_web_runtime, aiolm_web_moderation;

-- Runtime grants (least privilege for the API + owner flows + prune job).
-- Column-scoped UPDATE: the runtime API updates description/revision on edit
-- and tombstone columns on owner delete, but must NOT moderate (hidden).
grant select, insert on bench.benchmark_runs to aiolm_web_runtime;
grant update (benchmark, description_md, revision, deleted, summary, updated_at)
  on bench.benchmark_runs to aiolm_web_runtime;
grant select, insert, update, delete on bench.benchmark_chunks to aiolm_web_runtime;
grant select, insert, update on bench.upload_sessions to aiolm_web_runtime;
grant select, insert, update on bench.management_sessions to aiolm_web_runtime;
grant select, insert on bench.reports to aiolm_web_runtime;
-- Prune job clears reporter IP HMACs after 24h; column-scoped, nothing else.
grant update (reporter_ip_hmac) on bench.reports to aiolm_web_runtime;
grant select, insert, update, delete on bench.quota_buckets to aiolm_web_runtime;
grant insert on bench.audit_log to aiolm_web_runtime;
-- INSERT into the audit log consumes the owned sequence; both writers need it.
grant usage, select on sequence bench.audit_log_id_seq to aiolm_web_runtime, aiolm_web_moderation;

-- Moderation grants (triage only; no run/session/quota creation).
grant select, update on bench.benchmark_runs to aiolm_web_moderation;
grant delete on bench.benchmark_chunks to aiolm_web_moderation;
grant select, update on bench.upload_sessions to aiolm_web_moderation;
grant select, update on bench.management_sessions to aiolm_web_moderation;
grant select, delete on bench.reports to aiolm_web_moderation;
grant select, insert on bench.audit_log to aiolm_web_moderation;

-- Future tables in this schema stay private by default.
alter default privileges for role current_user in schema bench revoke all on tables from public;

-- Supabase-style hosted roles must not reach the private schema when present.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema bench from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema bench from authenticated;
  end if;
end $$;

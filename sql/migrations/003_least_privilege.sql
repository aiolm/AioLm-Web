-- Harden grants for databases migrated with the original 002_roles.sql:
-- runtime UPDATE on benchmark_runs becomes column-scoped (no hidden writes),
-- and both writers gain sequence usage for audit inserts. Idempotent: safe on
-- fresh installs (002 already grants the tightened form) and on migrated ones.

-- Column grants are additive, so revoke the broad table UPDATE first.
revoke update on bench.benchmark_runs from aiolm_web_runtime;
grant select, insert on bench.benchmark_runs to aiolm_web_runtime;
grant update (benchmark, description_md, revision, deleted, summary, updated_at)
  on bench.benchmark_runs to aiolm_web_runtime;

grant usage, select on sequence bench.audit_log_id_seq to aiolm_web_runtime, aiolm_web_moderation;

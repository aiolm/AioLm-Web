-- Retention grants. The prune job runs as the runtime role and now also
-- removes session rows that are already unusable (expired or revoked), not
-- just quota buckets and reporter IP HMACs. DELETE on the two session tables
-- is the only privilege that adds; nothing here widens read or write access,
-- and no grant is added on benchmark_runs (tombstones), audit_log (the
-- moderation ledger), or reports (rows survive; only the IP HMAC is cleared).
-- Additive and idempotent: safe on fresh installs and on migrated databases.

grant delete on bench.upload_sessions to aiolm_web_runtime;
grant delete on bench.management_sessions to aiolm_web_runtime;

-- Filter/pagination index support for the public list query.
-- The list filters model/hardware/method/workload with substring ILIKE on
-- summary JSON expressions, which needs trigram GIN indexes. pg_trgm is a
-- trusted extension on managed Postgres; where it is unavailable the
-- migration still applies and the bounded list falls back to scans.
-- Keyset pagination (created_at desc, public_id desc) is already covered by
-- benchmark_runs_created_idx from 001_init.sql.

do $$
begin
  create extension if not exists pg_trgm;
exception when insufficient_privilege then
  raise notice 'pg_trgm unavailable; skipping trigram filter indexes';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    create index if not exists benchmark_runs_model_trgm
      on bench.benchmark_runs using gin ((summary ->> 'model_label') gin_trgm_ops);
    create index if not exists benchmark_runs_hardware_trgm
      on bench.benchmark_runs using gin ((summary ->> 'hardware_label') gin_trgm_ops);
    create index if not exists benchmark_runs_method_trgm
      on bench.benchmark_runs using gin ((summary ->> 'method_label') gin_trgm_ops);
    create index if not exists benchmark_runs_workload_trgm
      on bench.benchmark_runs using gin ((summary ->> 'workload_label') gin_trgm_ops);
  end if;
end $$;

-- Trigram filter indexes with an explicitly schema-qualified operator class.
--
-- 004_filter_indexes.sql spells `gin_trgm_ops` unqualified, which only resolves
-- while pg_trgm's schema is on the search_path. Managed Postgres frequently
-- installs pg_trgm into a dedicated `extensions` schema, and CREATE EXTENSION
-- IF NOT EXISTS leaves an existing extension where it already is. 004 stays
-- byte-identical so applied checksums survive; this migration resolves
-- pg_extension.extnamespace from the catalog and builds each statement with
-- format()'s %I identifier quoting, so the indexes are created (or confirmed
-- already present) regardless of where the extension lives. Databases that
-- applied 004 while pg_trgm was unavailable also pick the indexes up here
-- rather than silently going without them.

do $$
begin
  create extension if not exists pg_trgm;
exception when insufficient_privilege then
  raise notice 'pg_trgm unavailable; skipping trigram filter indexes';
end $$;

do $$
declare
  ext_schema text;
  target record;
begin
  select n.nspname into ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if ext_schema is null then
    raise notice 'pg_trgm unavailable; skipping trigram filter indexes';
    return;
  end if;
  for target in
    select * from (values
      ('benchmark_runs_model_trgm', 'model_label'),
      ('benchmark_runs_hardware_trgm', 'hardware_label'),
      ('benchmark_runs_method_trgm', 'method_label'),
      ('benchmark_runs_workload_trgm', 'workload_label')
    ) as t(index_name, summary_key)
  loop
    execute format(
      'create index if not exists %I on bench.benchmark_runs using gin ((summary ->> %L) %I.gin_trgm_ops)',
      target.index_name, target.summary_key, ext_schema);
  end loop;
end $$;

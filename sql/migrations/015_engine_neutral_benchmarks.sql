-- Canonical payload identity is independent of display labels and engine enums.
-- These stored generated columns also become null when deletion tombstones the
-- benchmark. No payloads/summaries are rewritten and no writer grants change.
alter table bench.benchmark_runs
  add column engine_name text generated always as (benchmark #>> '{runtime,name}') stored,
  add column engine_version text generated always as (benchmark #>> '{runtime,version}') stored,
  add column engine_variant text generated always as (benchmark #>> '{runtime,variant}') stored,
  add column engine_build text generated always as (benchmark #>> '{runtime,build}') stored,
  add column engine_plugin_version text generated always as (benchmark #>> '{runtime,plugin_version}') stored,
  add column model_format text generated always as (
    case when benchmark ->> 'schema_version' = '1' then 'gguf'
      else benchmark #>> '{model,format}' end
  ) stored,
  add column model_sha256 text generated always as (benchmark #>> '{model,sha256}') stored,
  add column model_size_bytes bigint generated always as ((benchmark #>> '{model,size_bytes}')::bigint) stored,
  add column model_repository text generated always as (
    coalesce(benchmark #>> '{model,source,repository}', benchmark #>> '{model,metadata,repository}')
  ) stored,
  add column model_revision text generated always as (benchmark #>> '{model,source,revision}') stored,
  add column app_version text generated always as (benchmark ->> 'app_version') stored,
  add column method_id text generated always as (benchmark #>> '{method,id}') stored,
  add column method_version integer generated always as ((benchmark #>> '{method,version}')::integer) stored;

create index benchmark_runs_serving_method_visible
  on bench.benchmark_runs (method_id, method_version, created_at desc, public_id desc)
  where deleted = false and hidden = false;
create index benchmark_runs_model_size_visible
  on bench.benchmark_runs (model_size_bytes)
  where deleted = false and hidden = false;
-- Only the bounded recorded-settings subtree is indexed, not arbitrary payload JSON.
-- Numeric ranges and all possible point sorts are not claimed to be index-backed.
create index benchmark_runs_recorded_settings_visible
  on bench.benchmark_runs using gin ((summary #> '{setup,settings}') jsonb_path_ops)
  where deleted = false and hidden = false;

do $$
begin
  create extension if not exists pg_trgm;
exception when insufficient_privilege then
  raise notice 'pg_trgm unavailable; skipping canonical identity trigram indexes';
end $$;

do $$
declare
  ext_schema text;
  column_name text;
begin
  select n.nspname into ext_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm';
  if ext_schema is null then
    raise notice 'pg_trgm unavailable; skipping canonical identity trigram indexes';
    return;
  end if;
  foreach column_name in array array[
    'engine_version', 'engine_build', 'engine_plugin_version', 'app_version',
    'model_sha256', 'model_repository', 'model_revision'
  ] loop
    execute format(
      'create index %I on bench.benchmark_runs using gin (%I %I.gin_trgm_ops) where deleted = false and hidden = false',
      'benchmark_runs_' || column_name || '_visible_trgm', column_name, ext_schema
    );
  end loop;
end $$;

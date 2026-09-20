-- Enrich retained summaries without loading measurement chunks or touching tombstones.
update bench.benchmark_runs r set summary = summary || jsonb_build_object(
  'hardware_label', coalesce((select string_agg(coalesce(g->>'name', g->>'vendor', 'gpu'), ' + ' order by n)
    from jsonb_array_elements(case when benchmark#>>'{environment,execution,mode}' = 'cpu' then '[]'::jsonb else coalesce(benchmark#>'{environment,execution,selected_gpus}', '[]'::jsonb) end) with ordinality a(g,n)), benchmark#>>'{environment,execution,mode}', 'unknown'),
  'setup', jsonb_build_object(
    'os', benchmark#>'{environment,os}', 'arch', benchmark#>'{environment,arch}',
    'cpu', benchmark#>'{environment,cpu,name}', 'cores', benchmark#>'{environment,cpu,logical_cores}',
    'vendors', coalesce((select jsonb_agg(value order by first_n) from (select g->>'vendor' value, min(n) first_n from jsonb_array_elements(case when benchmark#>>'{environment,execution,mode}' = 'cpu' then '[]'::jsonb else coalesce(benchmark#>'{environment,execution,selected_gpus}', '[]'::jsonb) end) with ordinality a(g,n) where coalesce(g->>'vendor','') <> '' group by g->>'vendor') d), '[]'::jsonb),
    'gpus', coalesce((select jsonb_agg(value order by first_n) from (select g->>'name' value, min(n) first_n from jsonb_array_elements(case when benchmark#>>'{environment,execution,mode}' = 'cpu' then '[]'::jsonb else coalesce(benchmark#>'{environment,execution,selected_gpus}', '[]'::jsonb) end) with ordinality a(g,n) where coalesce(g->>'name','') <> '' group by g->>'name') d), '[]'::jsonb),
    'vram_mb', (select case when count(*) > 0 and bool_and(g->>'vram_mb' is not null) and benchmark#>>'{environment,execution,selection_complete}' = 'true' then sum((g->>'vram_mb')::double precision) else null end from jsonb_array_elements(case when benchmark#>>'{environment,execution,mode}' = 'cpu' then '[]'::jsonb else coalesce(benchmark#>'{environment,execution,selected_gpus}', '[]'::jsonb) end) a(g)),
    'runtime', benchmark#>'{runtime,name}', 'runtime_version', benchmark#>'{runtime,version}', 'backend', benchmark#>'{runtime,backend}',
    'mode', benchmark#>'{environment,execution,mode}', 'context_size', benchmark#>'{execution,context_size}', 'parallel', benchmark#>'{execution,parallel}',
    'threads', benchmark#>'{execution,settings,threads}', 'gpu_layers', benchmark#>'{execution,settings,gpu_layers}',
    'flash_attention', benchmark#>'{execution,settings,flash_attention}', 'cache_type_k', benchmark#>'{execution,settings,cache_type_k}',
    'cache_type_v', benchmark#>'{execution,settings,cache_type_v}', 'split_mode', benchmark#>'{execution,settings,split_mode}'
  )) where deleted = false;

-- Plain array values retain literal quotes/backslashes for substring prefilters.
create function bench.discovery_array_text(values_json jsonb) returns text
language sql immutable strict parallel safe
as $$ select string_agg(value, E'\n') from jsonb_array_elements_text(values_json) a(value) $$;
revoke all on function bench.discovery_array_text(jsonb) from public;
grant execute on function bench.discovery_array_text(jsonb) to aiolm_web_runtime, aiolm_web_moderation;

create index benchmark_discovery_newest on bench.benchmark_runs (created_at desc, public_id desc) where deleted = false and hidden = false;

do $$
declare
  target record;
  direction text;
  ext_schema text;
  key text;
  expression text;
begin
  for target in select * from (values
    ('context', '(summary->''setup''->>''context_size'')::double precision'),
    ('vram', '(summary->''setup''->>''vram_mb'')::double precision'),
    ('throughput', '(summary->>''mean_tg_tps'')::double precision'),
    ('duration', '(summary->>''mean_e2e_ms'')::double precision'),
    ('cores', '(summary->''setup''->>''cores'')::double precision'),
    ('parallel', '(summary->''setup''->>''parallel'')::double precision'),
    ('threads', '(summary->''setup''->>''threads'')::double precision'),
    ('gpu_layers', '(summary->''setup''->>''gpu_layers'')::double precision')
  ) t(name, expr) loop
    foreach direction in array array['asc', 'desc'] loop
      if (target.name = 'throughput' and direction = 'asc') or (target.name = 'duration' and direction = 'desc') or (target.name in ('cores','parallel','threads','gpu_layers') and direction = 'desc') then continue; end if;
      execute format('create index %I on bench.benchmark_runs ((%s) %s nulls last, created_at desc, public_id desc) where deleted = false and hidden = false', 'benchmark_discovery_' || target.name || '_' || direction, target.expr, direction);
    end loop;
  end loop;
  select n.nspname into ext_schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
  if ext_schema is null then raise notice 'pg_trgm unavailable; discovery substring queries have no trigram acceleration'; return; end if;
  foreach key in array array['os','arch','cpu','runtime','runtime_version','backend','mode','flash_attention','cache_type_k','cache_type_v','split_mode','vendors','gpus'] loop
    expression := case when key in ('vendors','gpus') then format('bench.discovery_array_text(summary->''setup''->%L)', key) else format('summary->''setup''->>%L', key) end;
    execute format('create index %I on bench.benchmark_runs using gin ((%s) %I.gin_trgm_ops) where deleted = false and hidden = false', 'benchmark_discovery_' || key || '_trgm', expression, ext_schema);
  end loop;
end $$;

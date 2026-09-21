-- Capacity is an optional measurement-time fact; old records remain unreported.
update bench.benchmark_runs
set summary = jsonb_set(summary, '{setup,ram_bytes}', coalesce(benchmark #> '{environment,system_memory_bytes}', 'null'::jsonb), true)
where not deleted and jsonb_typeof(summary->'setup') = 'object';

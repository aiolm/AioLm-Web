-- Configured input context and prefill average.
--
-- Discovery's context range and sort answer "how long were the inputs this run
-- was configured to send", so they read the workload's recorded input lengths.
-- execution.context_size is a different quantity: the raw runtime allocation, a
-- server-side total sized for parallel sequences and generation headroom. It
-- stays in summary.setup.context_size exactly as submitted and is never used as
-- a stand-in for an input length, nor rounded to a familiar preset.
--
-- Added to every retained summary:
--   summary.prompt_lengths        ascending, deduplicated, positive whole input lengths
--   summary.setup.prompt_length   the largest of those, or null when none is recorded
--   summary.mean_pp_tps           prefill mean over the retained measurement chunks
--
-- prompt_lengths is configuration, not evidence: a partial or cancelled run may
-- never have reached its longest input. Only mean_pp_tps is computed from rows
-- that actually ran. Workload metadata that is absent or unusable stays [] and
-- null - unknown, not derived from the allocation. Entries are kept only when
-- they are whole numbers a reader can represent exactly, matching the
-- application helper, and the contract already requires integers of at least 1.
--
-- The prefill mean skips rows marked failed and rows whose pp_tps is missing or
-- is not a JSON number; JSON carries no NaN or infinity, so a stored number is
-- always a usable one.
--
-- Everything else is left alone. The statements merge exactly the three keys
-- above onto rows that still carry a summary, so curated model labels and the
-- rest of the summary survive, and raw benchmark metadata, measurement chunks,
-- owner/body hashes, capacity counters and deleted tombstones are untouched.

update bench.benchmark_runs r set summary = r.summary || jsonb_build_object(
  'prompt_lengths', coalesce((
    select jsonb_agg(configured.length order by configured.length)
      from (
        select distinct (entry#>>'{}')::numeric as length
          from jsonb_array_elements(case when jsonb_typeof(r.benchmark#>'{workload,prompt_lengths}') = 'array'
            then r.benchmark#>'{workload,prompt_lengths}' else '[]'::jsonb end) a(entry)
         where jsonb_typeof(entry) = 'number'
           and (entry#>>'{}')::numeric > 0
           and (entry#>>'{}')::numeric <= 9007199254740991
           and (entry#>>'{}')::numeric = trunc((entry#>>'{}')::numeric)
      ) configured), '[]'::jsonb),
  -- Summed in chunk and row order so the stored mean matches the one the
  -- application computes at acceptance for the same rows.
  'mean_pp_tps', (
    select avg((measured.value->>'pp_tps')::double precision order by c.chunk_index, measured.ord)
      from bench.benchmark_chunks c
      cross join lateral jsonb_array_elements(case when jsonb_typeof(c.rows) = 'array' then c.rows else '[]'::jsonb end)
        with ordinality as measured(value, ord)
     where c.submission_id = r.submission_id
       and coalesce(measured.value->'failed', 'false'::jsonb) <> 'true'::jsonb
       and jsonb_typeof(measured.value->'pp_tps') = 'number')
) where r.deleted = false and r.summary is not null;

-- The list is ascending, so its last entry is the largest configured input
-- length. Reading it back keeps the two fields from ever disagreeing.
update bench.benchmark_runs r set summary = r.summary || jsonb_build_object('setup',
  (case when jsonb_typeof(r.summary->'setup') = 'object' then r.summary->'setup' else '{}'::jsonb end)
    || jsonb_build_object('prompt_length', r.summary->'prompt_lengths'->-1))
where r.deleted = false and r.summary is not null;

-- Ordering and range support for the repointed context condition. The indexed
-- expression is spelled exactly as the list query spells it.
create index if not exists benchmark_discovery_prompt_length_asc
  on bench.benchmark_runs (((summary->'setup'->>'prompt_length')::double precision) asc nulls last, created_at desc, public_id desc)
  where deleted = false and hidden = false;
create index if not exists benchmark_discovery_prompt_length_desc
  on bench.benchmark_runs (((summary->'setup'->>'prompt_length')::double precision) desc nulls last, created_at desc, public_id desc)
  where deleted = false and hidden = false;

-- 008 indexed the raw allocation for the context sort it then served. No query
-- orders or filters on that expression any more, so the two indexes are removed
-- rather than left to cost every write. The stored context_size is unaffected.
drop index if exists bench.benchmark_discovery_context_asc;
drop index if exists bench.benchmark_discovery_context_desc;

-- Operating points: the unit at which two measurements are comparable.
--
-- A run's rows are a grid of the configured input lengths against the
-- configured batch sizes, repeated at one generation length. The three mean_*
-- fields average that whole grid at once, which describes no configuration that
-- ran: a duration averaged over a 512-token and a 16K-token prompt belongs to
-- neither, and a generation rate averaged over concurrency 1 and 16 is not a
-- rate either of them reported. Ranking on such a mean also rewards whoever
-- configured the narrowest grid.
--
-- Added to every retained summary:
--   summary.points             one entry per (prompt_tokens, concurrency, generation_length)
--   summary.points_truncated   true when the grid had more entries than the stored cap
--
-- Each entry carries samples (the repetitions that ran) and, for pp_tps,
-- tg_tps, ttft_ms and e2e_ms, {median, min, max} over the rows of that point
-- that reported the metric. A metric no row reported is JSON null - unknown,
-- never zero - and a point keeps the metrics its rows did report.
--
-- The median is percentile_cont(0.5), whose interpolation between the two
-- middle values of an even count is `low + (high - low) * 0.5`. The application
-- helper spells the same arithmetic, so the value stored at acceptance and the
-- value backfilled here from the same rows are the same double.
--
-- Skipped, exactly as the application helper skips them: rows marked failed,
-- and rows whose input length, concurrency or generation length is not a whole
-- positive count a reader can represent exactly. Such a row belongs to no point
-- anyone could name; it is not filed under an invented one, and the run's
-- row_count still counts it.
--
-- The three mean_* fields are left in place. They are no longer displayed or
-- sorted on, but they are stored data and this migration does not destroy it.
-- Raw benchmark metadata, measurement chunks, owner/body hashes, capacity
-- counters and deleted tombstones are untouched.

-- Every retained summary gains both keys first, so a result whose rows named no
-- point reads as "measured no point" rather than as "stored before 012".
update bench.benchmark_runs r
   set summary = r.summary || jsonb_build_object('points', '[]'::jsonb, 'points_truncated', false)
 where r.deleted = false and r.summary is not null;

with measured as (
  select r.submission_id,
         (sample.value->>'prompt_tokens')::numeric as prompt_tokens,
         (sample.value->>'concurrency')::numeric as concurrency,
         (sample.value->>'generation_length')::numeric as generation_length,
         -- A metric is read only where the row really carries a JSON number, so
         -- a missing or non-numeric one contributes nothing instead of a zero.
         case when jsonb_typeof(sample.value->'pp_tps') = 'number' then (sample.value->>'pp_tps')::double precision end as pp_tps,
         case when jsonb_typeof(sample.value->'tg_tps') = 'number' then (sample.value->>'tg_tps')::double precision end as tg_tps,
         case when jsonb_typeof(sample.value->'ttft_ms') = 'number' then (sample.value->>'ttft_ms')::double precision end as ttft_ms,
         case when jsonb_typeof(sample.value->'e2e_ms') = 'number' then (sample.value->>'e2e_ms')::double precision end as e2e_ms
    from bench.benchmark_runs r
    join bench.benchmark_chunks c on c.submission_id = r.submission_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(c.rows) = 'array' then c.rows else '[]'::jsonb end) as sample(value)
   where r.deleted = false and r.summary is not null
     and coalesce(sample.value->'failed', 'false'::jsonb) <> 'true'::jsonb
     and jsonb_typeof(sample.value->'prompt_tokens') = 'number'
     and jsonb_typeof(sample.value->'concurrency') = 'number'
     and jsonb_typeof(sample.value->'generation_length') = 'number'
     and (sample.value->>'prompt_tokens')::numeric between 1 and 9007199254740991
     and (sample.value->>'concurrency')::numeric between 1 and 9007199254740991
     and (sample.value->>'generation_length')::numeric between 1 and 9007199254740991
     and (sample.value->>'prompt_tokens')::numeric = trunc((sample.value->>'prompt_tokens')::numeric)
     and (sample.value->>'concurrency')::numeric = trunc((sample.value->>'concurrency')::numeric)
     and (sample.value->>'generation_length')::numeric = trunc((sample.value->>'generation_length')::numeric)
), grouped as (
  select submission_id, prompt_tokens, concurrency, generation_length, count(*) as samples,
         case when count(pp_tps) = 0 then 'null'::jsonb else jsonb_build_object(
           'median', percentile_cont(0.5) within group (order by pp_tps) filter (where pp_tps is not null),
           'min', min(pp_tps), 'max', max(pp_tps)) end as pp_tps,
         case when count(tg_tps) = 0 then 'null'::jsonb else jsonb_build_object(
           'median', percentile_cont(0.5) within group (order by tg_tps) filter (where tg_tps is not null),
           'min', min(tg_tps), 'max', max(tg_tps)) end as tg_tps,
         case when count(ttft_ms) = 0 then 'null'::jsonb else jsonb_build_object(
           'median', percentile_cont(0.5) within group (order by ttft_ms) filter (where ttft_ms is not null),
           'min', min(ttft_ms), 'max', max(ttft_ms)) end as ttft_ms,
         case when count(e2e_ms) = 0 then 'null'::jsonb else jsonb_build_object(
           'median', percentile_cont(0.5) within group (order by e2e_ms) filter (where e2e_ms is not null),
           'min', min(e2e_ms), 'max', max(e2e_ms)) end as e2e_ms
    from measured
   group by submission_id, prompt_tokens, concurrency, generation_length
), ranked as (
  -- Points are stored ascending, so the cap drops the longest inputs rather
  -- than an arbitrary slice, and the result says that it was cut.
  select grouped.*,
         row_number() over (partition by submission_id order by prompt_tokens, concurrency, generation_length) as ordinal,
         count(*) over (partition by submission_id) as total
    from grouped
), collected as (
  select submission_id, bool_or(total > 64) as truncated,
         jsonb_agg(jsonb_build_object(
           'prompt_tokens', prompt_tokens, 'concurrency', concurrency, 'generation_length', generation_length,
           'samples', samples, 'pp_tps', pp_tps, 'tg_tps', tg_tps, 'ttft_ms', ttft_ms, 'e2e_ms', e2e_ms)
           order by prompt_tokens, concurrency, generation_length) as points
    from ranked where ordinal <= 64
   group by submission_id
)
update bench.benchmark_runs r
   set summary = r.summary || jsonb_build_object('points', collected.points, 'points_truncated', collected.truncated)
  from collected
 where collected.submission_id = r.submission_id and r.deleted = false and r.summary is not null;

-- No index is added for the point sorts. They read one entry out of a small
-- JSON array per row, which no expression index can cover without pinning the
-- selected point into the index definition. Ordering by a point is a scan of
-- the visible rows; when that stops being fast enough, the points belong in
-- their own table with (prompt_tokens, concurrency) indexed, and the list query
-- joins it laterally instead. docs/benchmark-discovery.md records this.

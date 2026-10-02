-- Search and hardware suggestions read the stored hardware_label. Count repeated
-- selected GPUs just as the acceptance helper does, including non-adjacent ones.
-- Only update labels with duplicates; keep raw benchmark data and other summary
-- fields intact. CPU runs, erased tombstones and already-correct labels stay put.
with labels as (
  select r.public_id, grouped.hardware_label
  from bench.benchmark_runs r
  cross join lateral (
    select string_agg(
      name || case when copies > 1 then ' x ' || copies::text else '' end,
      ' + ' order by first_n
    ) as hardware_label, bool_or(copies > 1) as has_duplicates
    from (
      select coalesce(g->>'name', g->>'vendor', 'gpu') collate "C" as name,
        count(*) as copies, min(n) as first_n
      from jsonb_array_elements(
        case when r.benchmark#>>'{environment,execution,mode}' = 'cpu'
          then '[]'::jsonb
          else coalesce(r.benchmark#>'{environment,execution,selected_gpus}', '[]'::jsonb)
        end
      ) with ordinality a(g, n)
      group by coalesce(g->>'name', g->>'vendor', 'gpu') collate "C"
    ) devices
  ) grouped
  where not r.deleted and jsonb_typeof(r.summary) = 'object' and grouped.has_duplicates
)
update bench.benchmark_runs r
set summary = jsonb_set(r.summary, '{hardware_label}', to_jsonb(labels.hardware_label))
from labels
where r.public_id = labels.public_id
  and r.summary->>'hardware_label' is distinct from labels.hardware_label;

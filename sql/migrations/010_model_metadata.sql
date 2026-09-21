-- Public model metadata on retained summaries.
--
-- Contract 0.3.0 keeps schema_version 1 and adds an OPTIONAL model.metadata
-- block. Runs published before it carry none, and this migration invents none
-- for them: a summary is enriched only when its stored payload actually holds a
-- metadata object, and every field that fails validation is stored as JSON null
-- (unknown) rather than as a guess. Nothing is parsed out of a filename, a
-- curated label, or the model hash.
--
-- Added to those summaries, as summary.model_info:
--   format/name/architecture/size_label/quantization/file_type/quantized_by
--   repository/base_models/artifact/source   metadata exactly as submitted
--   (artifact only with a usable repository and a registry source: a bare
--   filename or a GGUF-only source proves no download origin, so it is unknown)
--   publisher                                the repository NAMESPACE only
--   sha256/identity_status                   the recorded artifact identity
--
-- publisher is derived from the repository namespace and from nothing else.
-- GGUF general.quantized_by names whoever produced the quantized weights, which
-- is routinely a different party from the model's publisher, so it is published
-- under its own name and never promoted to one. Format and quantization
-- describe the weights: they say nothing about the KV cache and are not a
-- quality claim.
--
-- Everything else is left alone. The statement merges exactly one key onto rows
-- that still carry a summary, so operator-curated model labels, the hardware and
-- setup keys 008 backfilled and the input-context keys 009 added all survive,
-- and raw benchmark metadata, measurement chunks, owner/body hashes, capacity
-- counters and deleted tombstones are untouched. Rows whose payload has no
-- metadata object are not written at all, so they keep exactly the summary they
-- had and read as "not recorded".
--
-- The validators below mirror src/lib/model-info.ts field for field. They exist
-- only for this backfill and are dropped at the end of the migration; discovery
-- queries read the stored JSON directly.

-- Display label: bounded, single-line, free of identifier punctuation. The
-- length bound is an explicit check: PostgreSQL rejects interval quantifiers
-- above its repetition limit, so {1,256} cannot be spelled in the pattern.
create function bench.model_info_label(value jsonb) returns text
language sql immutable parallel safe as $$
  select case when jsonb_typeof(value) = 'string'
    and value #>> '{}' ~ '^[^/\\:@[:cntrl:]]+$'
    and length(value #>> '{}') between 1 and 256
    then value #>> '{}' end
$$;

-- Hugging Face namespace/repo: ASCII safe, each component starting alphanumeric
-- and at most 128 characters, with no consecutive dots.
create function bench.model_info_repository(value jsonb) returns text
language sql immutable parallel safe as $$
  select case when jsonb_typeof(value) = 'string'
    and value #>> '{}' ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
    and value #>> '{}' not like '%..%'
    then value #>> '{}' end
$$;

-- Repo-relative .gguf path, spelled as the contract schema spells it: every
-- segment starts alphanumeric, so traversal, backslashes, drive letters,
-- user@host, control characters and absolute paths are all excluded by shape.
create function bench.model_info_artifact(value jsonb) returns text
language sql immutable parallel safe as $$
  select case when jsonb_typeof(value) = 'string'
    and length(value #>> '{}') <= 512
    and value #>> '{}' ~ '^(?:[A-Za-z0-9][A-Za-z0-9._ -]{0,127}/)*[A-Za-z0-9][A-Za-z0-9._ -]*\.[gG][gG][uU][fF]$'
    then value #>> '{}' end
$$;

-- Returns NULL for a payload carrying no metadata object, and for one whose
-- format is not the GGUF this block describes: an unattributable payload
-- publishes none of its fields.
create function bench.model_info_from_model(model jsonb) returns jsonb
language sql immutable parallel safe as $$
  select jsonb_build_object(
    'format', 'GGUF',
    'name', bench.model_info_label(meta->'name'),
    'architecture', bench.model_info_label(meta->'architecture'),
    'size_label', bench.model_info_label(meta->'size_label'),
    'quantization', bench.model_info_label(meta->'quantization'),
    'file_type', case when jsonb_typeof(meta->'file_type') = 'number'
      and (meta->>'file_type')::numeric between 0 and 65535
      and (meta->>'file_type')::numeric = trunc((meta->>'file_type')::numeric)
      then (meta->>'file_type')::numeric::int end,
    'quantized_by', bench.model_info_label(meta->'quantized_by'),
    'repository', repository,
    -- First occurrence wins, duplicates collapse, and the contract cap of 8 holds here too.
    'base_models', coalesce((select jsonb_agg(value order by first_seen) from (
        select value, first_seen from (
          select bench.model_info_repository(entry) as value, min(ord) as first_seen
            from jsonb_array_elements(case when jsonb_typeof(meta->'base_models') = 'array'
              then meta->'base_models' else '[]'::jsonb end) with ordinality a(entry, ord)
           where bench.model_info_repository(entry) is not null
           group by 1
        ) distinct_models order by first_seen limit 8
      ) capped), '[]'::jsonb),
    'artifact', case when repository is not null
      and meta->>'source' in ('huggingface', 'gguf+huggingface')
      then bench.model_info_artifact(meta->'artifact') end,
    'source', case when meta->>'source' in ('gguf', 'huggingface', 'gguf+huggingface') then meta->>'source' end,
    -- The ONLY publisher evidence a submission carries.
    'publisher', split_part(repository, '/', 1),
    -- Identity is not metadata: both were constrained by the contract schema at
    -- acceptance and are echoed exactly as recorded.
    'sha256', model->'sha256',
    'identity_status', model->'status')
    from (select model->'metadata' as meta) payload,
      lateral (select bench.model_info_repository(payload.meta->'repository') as repository) resolved
   where jsonb_typeof(payload.meta) = 'object' and payload.meta->>'format' = 'GGUF'
$$;

update bench.benchmark_runs r
   set summary = r.summary || jsonb_build_object('model_info', bench.model_info_from_model(r.benchmark->'model'))
 where r.deleted = false and r.summary is not null
   and bench.model_info_from_model(r.benchmark->'model') is not null;

drop function bench.model_info_from_model(jsonb);
drop function bench.model_info_artifact(jsonb);
drop function bench.model_info_repository(jsonb);
drop function bench.model_info_label(jsonb);

-- Substring support for the three new model filters and their suggestion lists.
-- Spelled exactly as src/server/benchmark-discovery-sql.ts spells them, and
-- partial on the same visibility predicate as the other discovery indexes.
do $$
declare
  ext_schema text;
  target record;
begin
  select n.nspname into ext_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  if ext_schema is null then
    raise notice 'pg_trgm unavailable; model metadata filters have no trigram acceleration';
    return;
  end if;
  for target in select * from (values
    ('benchmark_discovery_publisher_trgm', 'summary->''model_info''->>''publisher'''),
    ('benchmark_discovery_quantization_trgm', 'summary->''model_info''->>''quantization'''),
    ('benchmark_discovery_base_models_trgm', 'bench.discovery_array_text(summary->''model_info''->''base_models'')')
  ) as t(index_name, expression) loop
    execute format('create index if not exists %I on bench.benchmark_runs using gin ((%s) %I.gin_trgm_ops) where deleted = false and hidden = false',
      target.index_name, target.expression, ext_schema);
  end loop;
end $$;

-- Confirmed nominal weight-bit families from GGUF metadata. No filenames,
-- method defaults or guessed file types. general.file_type uses llama_ftype.
-- Source: https://github.com/ggml-org/llama.cpp/blob/master/include/llama.h
-- The immutable expression also handles retained summaries and old app writers;
-- raw submissions and summaries do not need rewriting.
create function bench.model_weight_bits(info jsonb) returns integer
language sql immutable strict parallel safe
set search_path = pg_catalog
as $$
  with encodings(file_type, bits, labels) as (values
    (0, 32, array['F32', 'FP32']),
    (1, 16, array['F16', 'FP16']),
    (2, 4, array['Q4_0']),
    (3, 4, array['Q4_1']),
    (7, 8, array['Q8_0', 'Q8']),
    (8, 5, array['Q5_0']),
    (9, 5, array['Q5_1']),
    (10, 2, array['Q2_K']),
    (11, 3, array['Q3_K_S', 'Q3_K - SMALL']),
    (12, 3, array['Q3_K_M', 'Q3_K - MEDIUM']),
    (13, 3, array['Q3_K_L', 'Q3_K - LARGE']),
    (14, 4, array['Q4_K_S', 'Q4_K - SMALL']),
    (15, 4, array['Q4_K_M', 'Q4_K - MEDIUM']),
    (16, 5, array['Q5_K_S', 'Q5_K - SMALL']),
    (17, 5, array['Q5_K_M', 'Q5_K - MEDIUM']),
    (18, 6, array['Q6_K']),
    (19, 2, array['IQ2_XXS']),
    (20, 2, array['IQ2_XS']),
    (21, 2, array['Q2_K_S', 'Q2_K - SMALL']),
    (22, 3, array['IQ3_XS']),
    (23, 3, array['IQ3_XXS']),
    (25, 4, array['IQ4_NL']),
    (26, 3, array['IQ3_S']),
    (27, 3, array['IQ3_M']),
    (28, 2, array['IQ2_S']),
    (29, 2, array['IQ2_M']),
    (30, 4, array['IQ4_XS']),
    (32, 16, array['BF16']),
    (38, 4, array['MXFP4', 'MXFP4_MOE']),
    (39, 4, array['NVFP4']),
    (40, 1, array['Q1_0']),
    (41, 2, array['Q2_0'])
  ), evidence as (
    select
      (select bits from encodings where jsonb_typeof(info->'quantization') = 'string'
        and upper(btrim(info->>'quantization')) = any(labels) limit 1) as label_bits,
      (select bits from encodings where file_type =
        case when jsonb_typeof(info->'file_type') = 'number' then (info->>'file_type')::numeric end) as file_bits
  )
  select case
    when info->>'format' is distinct from 'GGUF' then null
    when upper(btrim(info->>'quantization')) = any(array['IQ1_S', 'IQ1_M', 'TQ1_0', 'TQ2_0']) then null
    when case when jsonb_typeof(info->'file_type') = 'number' then (info->>'file_type')::numeric = any(array[24, 31, 36, 37]) else false end then null
    when case when jsonb_typeof(info->'file_type') = 'number' then (info->>'file_type')::numeric >= 1024 else false end then null
    when label_bits is not null and file_bits is not null and label_bits <> file_bits then null
    else coalesce(file_bits, label_bits)
  end from evidence
$$;
revoke all on function bench.model_weight_bits(jsonb) from public;
grant execute on function bench.model_weight_bits(jsonb) to aiolm_web_runtime, aiolm_web_moderation;
create index benchmark_discovery_weight_bits
  on bench.benchmark_runs ((bench.model_weight_bits(summary->'model_info')::text))
  where deleted = false and hidden = false;

-- Single benchmark method: openai-chat-serving@5, public schema_version 4.
--
-- Every earlier record format (schema 1/2 token rows and serving @1-@4) is
-- retired. Their stored bodies no longer validate, so they are deleted rather
-- than kept unreadable. Measurement chunks and management sessions cascade from
-- benchmark_runs; quota buckets and the audit log are not benchmark records and
-- stay. Pending upload sessions and reports only name retired submissions.
delete from bench.reports;
delete from bench.upload_sessions;
delete from bench.benchmark_runs;

-- Indexes over summary fields that no current summary carries any more:
-- legacy throughput/duration means, llama.cpp launch settings and the
-- configured token input length (008_benchmark_discovery.sql,
-- 009_input_context.sql). The context_* pair was already dropped by 009.
drop index if exists bench.benchmark_discovery_throughput_desc;
drop index if exists bench.benchmark_discovery_duration_asc;
drop index if exists bench.benchmark_discovery_parallel_asc;
drop index if exists bench.benchmark_discovery_threads_asc;
drop index if exists bench.benchmark_discovery_gpu_layers_asc;
drop index if exists bench.benchmark_discovery_prompt_length_asc;
drop index if exists bench.benchmark_discovery_prompt_length_desc;
drop index if exists bench.benchmark_discovery_flash_attention_trgm;
drop index if exists bench.benchmark_discovery_cache_type_k_trgm;
drop index if exists bench.benchmark_discovery_cache_type_v_trgm;
drop index if exists bench.benchmark_discovery_split_mode_trgm;

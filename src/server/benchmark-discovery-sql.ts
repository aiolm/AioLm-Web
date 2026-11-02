import { GLOBAL_SEARCH_FILTER_KEYS, MODEL_INFO_SEARCH_KEYS, MODEL_QUERY_INFO_KEYS, POINT_OPTION_FIELD, RANGE_FILTER_KEYS, TEXT_FILTER_KEYS, TEXT_FILTER_MAX_LENGTH, type BenchmarkFilters, type OptionField, type TextFilterKey, type SettingDescriptor } from "../lib/benchmark-discovery";
import { POINT_METRIC_KEYS, type PointMetric } from "../lib/benchmark-points";
import type { ListCursor } from "../lib/pagination";

type SingleTextField = Exclude<TextFilterKey, "q" | "model_query">;
export const ARRAY_TEXT_PATHS: Partial<Record<SingleTextField, string>> = { vendor: "summary->'setup'->'vendors'", gpu: "summary->'setup'->'gpus'", base_model: "summary->'model_info'->'base_models'" };
export const RUNTIME_BUILD_EXPRESSION = "engine_build";
export const LIST_RUNTIME_BUILD_COLUMN = "engine_build";
const IDENTITY_COLUMNS: Record<string, string> = { runtime: "engine_name", runtime_version: "engine_version", runtime_variant: "engine_variant", runtime_build: "engine_build", runtime_plugin_version: "engine_plugin_version", app_version: "app_version", model_format: "model_format", model_sha256: "model_sha256", model_repository: "model_repository", model_revision: "model_revision" };
const CANONICAL_IDENTITY_COLUMNS = ["engine_name", "engine_version", "engine_variant", "engine_build", "engine_plugin_version", "model_format", "model_sha256", "model_size_bytes", "model_repository", "model_revision", "app_version", "method_id", "method_version"] as const;
const HARDWARE_LABEL = "case when summary->>'hardware_label' = 'unknown' and coalesce(benchmark#>>'{environment,cpu,name}', '') <> '' then 'Host CPU: ' || (benchmark#>>'{environment,cpu,name}') else summary->>'hardware_label' end";
const LIST_SUMMARY = `summary || jsonb_build_object('identity', jsonb_build_object(${CANONICAL_IDENTITY_COLUMNS.map(column => `'${column}', ${column}`).join(", ")}), 'schema_version', (benchmark->>'schema_version')::integer)`;
export function textExpression(field: SingleTextField): string {
  if (IDENTITY_COLUMNS[field]) return IDENTITY_COLUMNS[field];
  if (field === "weight_bits") return "bench.model_weight_bits(summary->'model_info')::text";
  if (field === "hardware") return HARDWARE_LABEL;
  if (["model", "hardware", "method", "workload"].includes(field)) return `summary->>'${field}_label'`;
  if (ARRAY_TEXT_PATHS[field]) return `bench.discovery_array_text(${ARRAY_TEXT_PATHS[field]})`;
  if (field === "publisher" || field === "quantization") return `summary->'model_info'->>'${field}'`;
  if (!TEXT_FILTER_KEYS.includes(field)) throw new Error("Unknown text field.");
  return `summary->'setup'->>'${field}'`;
}
export const MODEL_QUERY_EXPRESSIONS = ["summary->>'model_label'", ...MODEL_QUERY_INFO_KEYS.map(k => `summary->'model_info'->>'${k}'`), "model_sha256", "model_repository", "model_revision"];
export function numericExpression(field: string): string {
  if (field === "model_size") return "model_size_bytes";
  if (field === "repetitions") return "(benchmark#>>'{workload,repetitions}')::bigint";
  const paths: Record<string, string> = { context: "prompt_length", vram: "vram_mb", input_bytes: "max_input_bytes", max_output_tokens: "max_output_tokens", max_concurrency: "max_concurrency", ram: "ram_bytes", physical_cores: "physical_cores", cores: "cores", parallel: "parallel", threads: "threads", gpu_layers: "gpu_layers" };
  const key = paths[field];
  if (!key) throw new Error("Unknown numeric field.");
  return `(summary->'setup'->>'${key}')::double precision`;
}
const legacy = (filters: BenchmarkFilters) => filters.measurement === "legacy";
const pointRows = (old: boolean) => `jsonb_array_elements(case when jsonb_typeof(summary->'${old ? "points" : "serving_points"}') = 'array' then summary->'${old ? "points" : "serving_points"}' else '[]'::jsonb end) as measured(point)`;
function pointMatch(input: string, concurrency: string, cap?: string): string {
  return `jsonb_typeof(point->'${cap ? "input_bytes" : "prompt_tokens"}') = 'number' and (point->>'${cap ? "input_bytes" : "prompt_tokens"}')::double precision = ${input} and jsonb_typeof(point->'concurrency') = 'number' and (point->>'concurrency')::double precision = ${concurrency}${cap ? ` and jsonb_typeof(point->'max_output_tokens') = 'number' and (point->>'max_output_tokens')::double precision = ${cap}` : ""}`;
}
export function pointMetricExpression(metric: PointMetric | "output_bytes_per_second", input: string, concurrency: string, cap?: string): string {
  if (metric !== "output_bytes_per_second" && !POINT_METRIC_KEYS.includes(metric)) throw new Error("Unknown point metric.");
  return `(select (point->'${metric}'->>'median')::double precision from ${pointRows(!cap)} where ${pointMatch(input, concurrency, cap)} and jsonb_typeof(point->'${metric}'->'median') = 'number' limit 1)`;
}
type Bind = (value: string | number | null) => string;
export function sortExpression(filters: BenchmarkFilters, bind: Bind): string | null {
  const sort = filters.sort ?? "newest";
  if (sort.startsWith("context_")) return numericExpression("context");
  if (sort.startsWith("input_bytes_")) return numericExpression("input_bytes");
  if (sort.startsWith("vram_")) return numericExpression("vram");
  const metric = sort === "throughput_desc" ? "tg_tps" : sort === "output_rate_desc" ? "output_bytes_per_second" : sort === "duration_asc" ? "e2e_ms" : null;
  const input = legacy(filters) ? filters.point_tokens : filters.point_bytes;
  if (!metric || input === undefined || filters.point_concurrency === undefined) return null;
  return pointMetricExpression(metric, bind(input), bind(filters.point_concurrency), !legacy(filters) && filters.point_max_tokens !== undefined ? bind(filters.point_max_tokens) : undefined);
}
export function literalPattern(value: string): string { return `%${value.replace(/[\\%_]/g, "\\$&")}%`; }
const SETTINGS = "jsonb_array_elements(case when jsonb_typeof(summary#>'{setup,settings}') = 'array' then summary#>'{setup,settings}' else '[]'::jsonb end) as recorded(setting)";
// Serialized JSON travels as text; a jsonb parameter makes postgres.js encode
// the string a second time, changing null, booleans, arrays and descriptors.
function descriptorMatch(descriptor: SettingDescriptor, bind: Bind): string {
  return ["target", "scope", "name", "unit", "role"].map(key => `setting->'${key}' = ${bind(JSON.stringify(descriptor[key as keyof SettingDescriptor]))}::text::jsonb`).join(" and ");
}
export function discoverySql(filters: BenchmarkFilters) {
  const values: (string | number | null)[] = [];
  const bind: Bind = value => { values.push(value); return `$${values.length}`; };
  const match = (field: SingleTextField, pattern: string) => ARRAY_TEXT_PATHS[field] ? `(${textExpression(field)} ilike ${pattern} and exists (select 1 from jsonb_array_elements_text(coalesce(${ARRAY_TEXT_PATHS[field]}, '[]'::jsonb)) as element(value) where value ilike ${pattern}))` : `${textExpression(field)} ilike ${pattern}`;
  const clauses = ["deleted = false", "hidden = false", legacy(filters) ? "(benchmark->>'schema_version')::integer in (1, 2)" : "(benchmark->>'schema_version')::integer = 3 and method_id = 'openai-chat-serving' and method_version = 1"];
  for (const key of TEXT_FILTER_KEYS) {
    if (!filters[key]) continue;
    if (key === "weight_bits") { clauses.push(`${textExpression(key)} = ${bind(filters[key]!)}`); continue; }
    const pattern = bind(literalPattern(filters[key]!));
    if (key === "model_query") clauses.push(`(${MODEL_QUERY_EXPRESSIONS.map(expr => `${expr} ilike ${pattern}`).join(" or ")})`);
    else if (key === "q") clauses.push(`(${GLOBAL_SEARCH_FILTER_KEYS.map(k => match(k, pattern)).concat(MODEL_QUERY_EXPRESSIONS.map(expr => `${expr} ilike ${pattern}`), MODEL_INFO_SEARCH_KEYS.map(k => `summary->'model_info'->>'${k}' ilike ${pattern}`), [`summary->>'status' ilike ${pattern}`, `exists (select 1 from jsonb_array_elements(coalesce(benchmark#>'{environment,installed_gpus}', '[]'::jsonb)) as host_gpu(device) where device->>'name' ilike ${pattern} or device->>'vendor' ilike ${pattern})`]).join(" or ")})`);
    else clauses.push(match(key, pattern));
  }
  for (const key of RANGE_FILTER_KEYS) for (const bound of ["min", "max"] as const) {
    const value = filters[`${key}_${bound}`];
    if (value !== undefined) clauses.push(`${numericExpression(key)} ${bound === "min" ? ">=" : "<="} ${bind(value)}`);
  }
  for (const key of ["warmup", "request_usage"] as const) if (filters[key] !== undefined) clauses.push(`benchmark#>'{workload,${key}}' = ${bind(filters[key] ? "true" : "false")}::text::jsonb`);
  for (const condition of filters.setting ?? []) {
    const descriptor = descriptorMatch(condition, bind);
    if (condition.op === "eq") {
      const { target, scope, name, unit, role, value } = condition;
      clauses.push(`summary#>'{setup,settings}' @> ${bind(JSON.stringify([{ target, scope, name, unit, role, value }]))}::text::jsonb`);
      clauses.push(`exists (select 1 from ${SETTINGS} where ${descriptor} and setting->'value' = ${bind(JSON.stringify(value))}::text::jsonb)`);
    } else {
      const bounds = [condition.min !== undefined ? `(setting->>'value')::numeric >= ${bind(condition.min)}::numeric` : "", condition.max !== undefined ? `(setting->>'value')::numeric <= ${bind(condition.max)}::numeric` : ""].filter(Boolean).join(" and ");
      clauses.push(`exists (select 1 from ${SETTINGS} where ${descriptor} and case when jsonb_typeof(setting->'value') = 'number' then ${bounds} else false end)`);
    }
  }
  const input = legacy(filters) ? filters.point_tokens : filters.point_bytes;
  if (filters.point_only && input !== undefined && filters.point_concurrency !== undefined) clauses.push(`exists (select 1 from ${pointRows(legacy(filters))} where ${pointMatch(bind(input), bind(filters.point_concurrency), !legacy(filters) && filters.point_max_tokens !== undefined ? bind(filters.point_max_tokens) : undefined)})`);
  return { values, bind, clauses };
}
export function listSql(filters: BenchmarkFilters, limit: number, cursor: ListCursor | null) {
  const { values, bind, clauses } = discoverySql(filters);
  const sort = filters.sort ?? "newest", expr = sortExpression(filters, bind), direction = sort === "oldest" ? "asc" : "desc";
  if (cursor) {
    const tie = `(created_at, public_id) ${sort === "oldest" ? ">" : "<"} (${bind(cursor.createdAt)}::timestamptz, ${bind(cursor.publicId)})`;
    if (!expr) clauses.push(tie);
    else if (cursor.value == null) clauses.push(`(${expr} is null and ${tie})`);
    else { const value = bind(cursor.value); clauses.push(`(${expr} is null or ${expr} ${sort.endsWith("desc") ? "<" : ">"} ${value} or (${expr} = ${value} and ${tie}))`); }
  }
  return { values, query: `select public_id, ${LIST_SUMMARY} as summary, benchmark as benchmark_metadata, ${LIST_RUNTIME_BUILD_COLUMN} as runtime_build, description_md, revision, created_at::text as created_at, updated_at::text as updated_at from bench.benchmark_runs where ${clauses.join(" and ")} order by ${expr ? `${expr} ${sort.endsWith("desc") ? "desc" : "asc"} nulls last, ` : ""}bench.benchmark_runs.created_at ${direction}, public_id ${direction} limit ${bind(limit + 1)}` };
}
export function optionsSql(field: OptionField, query: string, filters: BenchmarkFilters, setting?: SettingDescriptor) {
  const remaining = { ...filters };
  if (field === POINT_OPTION_FIELD) { delete remaining.point_tokens; delete remaining.point_bytes; delete remaining.point_concurrency; delete remaining.point_max_tokens; delete remaining.point_only; }
  else if (field !== "setting" && field !== "setting_value") delete remaining[field];
  const { values, bind, clauses } = discoverySql(remaining);
  const pattern = bind(literalPattern(query));
  const envelope = (candidates: string, maxLength = TEXT_FILTER_MAX_LENGTH) => ({ values, query: `select value, count(*)::int as count from (${candidates}) as candidates where value <> '' and char_length(value) <= ${maxLength} and value ilike ${pattern} group by value order by value collate "C" limit 31` });
  if (field === "setting" || field === "setting_value") {
    if (field === "setting_value") {
      if (!setting) throw new Error("A setting descriptor is required.");
      const { target, scope, name, unit, role } = setting;
      clauses.push(`facet->>'descriptor' = ${bind(JSON.stringify({ target, scope, name, unit, role }))}`);
    }
    // Acceptance freezes bounded ECMAScript-canonical strings, so PostgreSQL
    // never reformats JSON numbers, whitespace, descriptor keys or arrays.
    const value = `facet->>'${field === "setting" ? "descriptor" : "value"}'`;
    return envelope(`select distinct public_id, ${value} as value from bench.benchmark_runs cross join lateral jsonb_array_elements(case when jsonb_typeof(summary#>'{setup,setting_facets}') = 'array' then summary#>'{setup,setting_facets}' else '[]'::jsonb end) as canonical(facet) where ${clauses.join(" and ")}`, 1024);
  }
  if (field === POINT_OPTION_FIELD) {
    const old = legacy(filters), input = old ? "prompt_tokens" : "input_bytes";
    const value = old ? `(point->>'prompt_tokens') || '/' || (point->>'concurrency')` : `'b' || (point->>'input_bytes') || '/c' || (point->>'concurrency') || '/o' || (point->>'max_output_tokens')`;
    return { values, query: `select value, count(*)::int as count from (select distinct public_id, ${value} as value, (point->>'${input}')::double precision as input, (point->>'concurrency')::double precision as concurrency${old ? "" : ", (point->>'max_output_tokens')::double precision as cap"} from bench.benchmark_runs cross join lateral ${pointRows(old)} where ${clauses.join(" and ")} and jsonb_typeof(point->'${input}') = 'number' and jsonb_typeof(point->'concurrency') = 'number'${old ? "" : " and jsonb_typeof(point->'max_output_tokens') = 'number'"}) as candidates where value ilike ${pattern} group by value, input, concurrency${old ? "" : ", cap"} order by input, concurrency${old ? "" : ", cap"} limit 31` };
  }
  if (field === "model_query") return envelope(`select distinct public_id, candidate.value from bench.benchmark_runs cross join lateral (values ${MODEL_QUERY_EXPRESSIONS.map(expr => `(${expr})`).join(", ")}) as candidate(value) where ${clauses.join(" and ")}`);
  if (field === "weight_bits") return { values, query: `select bits::text as value, count(*)::int as count from (select bench.model_weight_bits(summary->'model_info') as bits from bench.benchmark_runs where ${clauses.join(" and ")}) as candidates where bits is not null and bits::text ilike ${pattern} group by bits order by bits limit 31` };
  if (query) clauses.push(`${textExpression(field)} ilike ${pattern}`);
  if (field === "gpu" && remaining.vendor) {
    clauses.push(`device->>'vendor' ilike ${bind(literalPattern(remaining.vendor))}`);
    return envelope(`select distinct public_id, device->>'name' as value from bench.benchmark_runs cross join lateral jsonb_array_elements(coalesce(benchmark#>'{environment,execution,selected_gpus}', '[]'::jsonb)) as gpu(device) where ${clauses.join(" and ")}`);
  }
  const path = ARRAY_TEXT_PATHS[field];
  return envelope(`select distinct public_id, ${path ? `jsonb_array_elements_text(coalesce(${path}, '[]'::jsonb))` : textExpression(field)} as value from bench.benchmark_runs where ${clauses.join(" and ")}`);
}

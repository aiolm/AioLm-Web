import { MODEL_INFO_SEARCH_KEYS, POINT_OPTION_FIELD, RANGE_FILTER_KEYS, TEXT_FILTER_KEYS, type BenchmarkFilters, type OptionField, type TextFilterKey } from "../lib/benchmark-discovery";
import { POINT_METRIC_KEYS, type PointMetric } from "../lib/benchmark-points";
import type { ListCursor } from "../lib/pagination";

// Identifiers and SQL expressions come exclusively from the fixed contract whitelist.
/**
 * Fields whose value is a JSON array. Their filter prefilter, their per-element
 * predicate and their option expansion all read the same path, so a filter and
 * the suggestions offered for it can never drift apart.
 */
export const ARRAY_TEXT_PATHS: Partial<Record<Exclude<TextFilterKey, "q">, string>> = {
  vendor: "summary->'setup'->'vendors'",
  gpu: "summary->'setup'->'gpus'",
  base_model: "summary->'model_info'->'base_models'",
};
export function textExpression(field: Exclude<TextFilterKey, "q">): string {
  if (["model", "hardware", "method", "workload"].includes(field)) return `summary->>'${field}_label'`;
  const arrayPath = ARRAY_TEXT_PATHS[field];
  if (arrayPath) return `bench.discovery_array_text(${arrayPath})`;
  if (field === "publisher" || field === "quantization") return `summary->'model_info'->>'${field}'`;
  return `summary->'setup'->>'${field}'`;
}
// "context" reads the largest configured input length; setup.context_size stays the raw allocation.
export function numericExpression(field: string): string {
  return `(summary->'setup'->>'${field === "context" ? "prompt_length" : field === "vram" ? "vram_mb" : field}')::double precision`;
}
/**
 * The stored operating points as rows. Every read is guarded on the JSON type,
 * so a summary written before migration 012, or one edited by hand, contributes
 * no point instead of failing the query it appears in.
 */
const POINT_ROWS = `jsonb_array_elements(case when jsonb_typeof(summary->'points') = 'array' then summary->'points' else '[]'::jsonb end) as measured(point)`;
function pointMatch(tokens: string, concurrency: string): string {
  return `jsonb_typeof(point->'prompt_tokens') = 'number' and (point->>'prompt_tokens')::double precision = ${tokens}
      and jsonb_typeof(point->'concurrency') = 'number' and (point->>'concurrency')::double precision = ${concurrency}`;
}
/** One metric's median at the selected point. The metric name comes from the contract whitelist. */
export function pointMetricExpression(metric: PointMetric, tokens: string, concurrency: string): string {
  if (!POINT_METRIC_KEYS.includes(metric)) throw new Error("Unknown point metric.");
  return `(select (point->'${metric}'->>'median')::double precision from ${POINT_ROWS}
    where ${pointMatch(tokens, concurrency)} and jsonb_typeof(point->'${metric}'->'median') = 'number' limit 1)`;
}
/**
 * Ordering expression. The two speed sorts read the selected point's median,
 * which parseFilters has already required them to name, so no query can fall
 * back to a mean taken across different inputs and concurrencies.
 */
export function sortExpression(filters: BenchmarkFilters, bind: (v: string | number | null) => string): string | null {
  const sort = filters.sort ?? "newest";
  if (sort.startsWith("context_")) return numericExpression("context");
  if (sort.startsWith("vram_")) return numericExpression("vram");
  const metric: PointMetric | null = sort === "throughput_desc" ? "tg_tps" : sort === "duration_asc" ? "e2e_ms" : null;
  if (!metric || filters.point_tokens === undefined || filters.point_concurrency === undefined) return null;
  return pointMetricExpression(metric, bind(filters.point_tokens), bind(filters.point_concurrency));
}
export function literalPattern(value: string): string { return `%${value.replace(/[\\%_]/g, "\\$&")}%`; }
export function discoverySql(filters: BenchmarkFilters) {
  const values: (string | number | null)[] = [];
  const bind = (v: string | number | null) => { values.push(v); return `$${values.length}`; };
  const match = (field: Exclude<TextFilterKey, "q">, pattern: string) => {
    const expr = textExpression(field);
    const arrayPath = ARRAY_TEXT_PATHS[field];
    // The joined text narrows using the expression index; the per-element test
    // then rejects a match that only spans two neighbouring entries.
    if (arrayPath) return `(${expr} ilike ${pattern} and exists (select 1 from jsonb_array_elements_text(coalesce(${arrayPath}, '[]'::jsonb)) as element(value) where value ilike ${pattern}))`;
    return `${expr} ilike ${pattern}`;
  };
  const clauses = ["deleted = false", "hidden = false"];
  for (const key of TEXT_FILTER_KEYS) {
    if (!filters[key]) continue;
    const pattern = bind(literalPattern(filters[key]!));
    clauses.push(key === "q" ? `(${TEXT_FILTER_KEYS.filter(k => k !== "q").map(k => match(k, pattern)).concat([`summary->'setup'->>'runtime_version' ilike ${pattern}`, `summary->>'status' ilike ${pattern}`], MODEL_INFO_SEARCH_KEYS.map(k => `summary->'model_info'->>'${k}' ilike ${pattern}`)).join(" or ")})` : match(key, pattern));
  }
  for (const key of RANGE_FILTER_KEYS) for (const bound of ["min", "max"] as const) {
    const value = filters[`${key}_${bound}`];
    if (value !== undefined) clauses.push(`${numericExpression(key)} ${bound === "min" ? ">=" : "<="} ${bind(value)}`);
  }
  // Only point_only narrows on the point: the selection alone changes which
  // numbers are shown, not which results are listed.
  if (filters.point_only && filters.point_tokens !== undefined && filters.point_concurrency !== undefined) {
    clauses.push(`exists (select 1 from ${POINT_ROWS} where ${pointMatch(bind(filters.point_tokens), bind(filters.point_concurrency))})`);
  }
  return { values, bind, clauses };
}
export function listSql(filters: BenchmarkFilters, limit: number, cursor: ListCursor | null) {
  const { values, bind, clauses } = discoverySql(filters);
  const sort = filters.sort ?? "newest", expr = sortExpression(filters, bind);
  const direction = sort === "oldest" ? "asc" : "desc";
  if (cursor) {
    const tie = `(created_at, public_id) ${sort === "oldest" ? ">" : "<"} (${bind(cursor.createdAt)}::timestamptz, ${bind(cursor.publicId)})`;
    if (!expr) clauses.push(tie);
    else if (cursor.value == null) clauses.push(`(${expr} is null and ${tie})`);
    else {
      const value = bind(cursor.value);
      clauses.push(`(${expr} is null or ${expr} ${sort.endsWith("desc") ? "<" : ">"} ${value} or (${expr} = ${value} and ${tie}))`);
    }
  }
  return { values, query: `select public_id, summary, description_md, revision, created_at::text as created_at, updated_at::text as updated_at from bench.benchmark_runs where ${clauses.join(" and ")} order by ${expr ? `${expr} ${sort.endsWith("desc") ? "desc" : "asc"} nulls last, ` : ""}bench.benchmark_runs.created_at ${direction}, public_id ${direction} limit ${bind(limit + 1)}` };
}
export function optionsSql(field: OptionField, query: string, filters: BenchmarkFilters) {
  const remaining = { ...filters };
  if (field === POINT_OPTION_FIELD) {
    delete remaining.point_tokens;
    delete remaining.point_concurrency;
    delete remaining.point_only;
  } else {
    delete remaining[field];
  }
  const { values, bind, clauses } = discoverySql(remaining);
  const optionPattern = bind(literalPattern(query));
  // Operating points are ordered by what they measure, not by how the pair
  // spells out, so 512/1 precedes 4096/1 instead of sorting between 16384 and 8192.
  if (field === POINT_OPTION_FIELD) {
    return { values, query: `select value, count(*)::int as count from (select distinct public_id,
        (point->>'prompt_tokens') || '/' || (point->>'concurrency') as value,
        (point->>'prompt_tokens')::double precision as tokens, (point->>'concurrency')::double precision as concurrency
      from bench.benchmark_runs cross join lateral ${POINT_ROWS}
      where ${clauses.join(" and ")} and jsonb_typeof(point->'prompt_tokens') = 'number' and jsonb_typeof(point->'concurrency') = 'number'
      ) as candidates where value ilike ${optionPattern} group by value, tokens, concurrency order by tokens, concurrency limit 31` };
  }
  // Narrow candidates using the expression index before expanding array options.
  // The final per-value predicate still rejects matches spanning array entries.
  if (query) clauses.push(`${textExpression(field)} ilike ${optionPattern}`);
  if (field === "gpu" && remaining.vendor) {
    clauses.push(`device->>'vendor' ilike ${bind(literalPattern(remaining.vendor))}`);
    return { values, query: `select value, count(*)::int as count from (select distinct public_id, device->>'name' as value from bench.benchmark_runs cross join lateral jsonb_array_elements(coalesce(benchmark#>'{environment,execution,selected_gpus}', '[]'::jsonb)) as gpu(device) where ${clauses.join(" and ")}) as candidates where value <> '' and value ilike ${optionPattern} group by value order by value collate "C" limit 31` };
  }
  const arrayPath = ARRAY_TEXT_PATHS[field];
  const expr = arrayPath ? `jsonb_array_elements_text(coalesce(${arrayPath}, '[]'::jsonb))` : textExpression(field);
  return { values, query: `select value, count(*)::int as count from (select distinct public_id, ${expr} as value from bench.benchmark_runs where ${clauses.join(" and ")}) as candidates where value <> '' and value ilike ${optionPattern} group by value order by value collate "C" limit 31` };
}

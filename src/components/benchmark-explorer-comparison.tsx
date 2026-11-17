"use client";
import { LocalTime } from "./local-time";
import { useI18n } from "@/i18n/client";
import { localizedPath, type Locale } from "@/i18n/config";
import type { Translator } from "@/i18n/types";
import { useSearchParams } from "next/navigation";

import Link from "next/link";
import { ColumnHeading } from "./benchmark-i18n";
import {
  EXPLORER_COMPARE_LIMIT,
  explorerDetailHref,
  type ExplorerItem,
  type ExplorerBasis,
} from "./benchmark-explorer-state";
import { formatSampleCount, formatServingPointLabel, formatComparisonCpu, formatComparisonOs, formatComparisonVram } from "./benchmark-explorer-format";
import { formatBaseModels, formatWeightPrecision, modelIdentityComparison, modelPublisher, modelValue } from "./benchmark-model-identity";
import { defaultServingPoint, findServingPoint, SERVING_METRIC_KEYS, type ServingBenchmarkPoint } from "@/lib/benchmark-points";
import { servingMetricColumns } from "./benchmark-detail-rows";
import { asRecord, displayText, formatByteSize } from "./benchmark-detail-format";
import { recordedSettingPresentation, selectedGpuRecord, servingMetricAbsence } from "./benchmark-evidence";
import { BenchmarkModelInformation } from "./benchmark-model-information";

/**
 * Side-by-side view of results the reader picked by hand. It transposes the
 * summary so each field reads across the selected columns, and it states plainly
 * when the selected runs used different workloads, or when they did not run the
 * same weights file.
 */

interface ComparisonField {
  key: string;
  label: string;
  render: (item: ExplorerItem) => React.ReactNode;
}

/**
 * The point each column is read at. A comparison whose columns report different
 * operating points is not a comparison, so the basis applies to every column and
 * a result that never measured it reports the point as missing.
 */
function shownServingPoint(item: ExplorerItem, basis: ExplorerBasis | null): ServingBenchmarkPoint | null {
  return basis ? findServingPoint(item.summary.serving_points, basis.input_bytes, basis.concurrency, basis.max_output_tokens) : defaultServingPoint(item.summary.serving_points);
}

function servingLabel(point: ServingBenchmarkPoint): string {
  return formatServingPointLabel(point.input_bytes, point.concurrency, point.max_output_tokens);
}

/**
 * Workload compatibility. The prompt nonce and per-request input hashes are
 * evidence of isolated inputs, fresh for every run, so they are never identity.
 */
export function servingComparisonSignature(item: ExplorerItem): string {
  const { setup, identity } = item.summary;
  return JSON.stringify([
    item.summary.schema_version, identity.method_id, identity.method_version,
    setup.inputs.map(input => input.bytes), setup.max_output_tokens, setup.corpus, setup.corpus_version,
    setup.warmup, setup.request_usage, setup.cache_policy, setup.concurrencies, setup.repetitions, setup.settings,
  ]);
}

function comparisonFields(t: Translator, locale: Locale, search: string, basis: ExplorerBasis | null): ComparisonField[] {
  const metricColumns = servingMetricColumns(t);
  return [
  { key: "catalog", label: t("benchmark.catalogTitle"), render: item => <BenchmarkModelInformation publicId={item.public_id} recordedName={item.summary.model_info?.name} /> },
  { key: "publisher", label: t("benchmark.Repository owner (recorded)"), render: (item) => modelValue(modelPublisher(item.summary.model_info), t) },
  { key: "quantization", label: t("benchmark.Weight quantization"), render: (item) => formatWeightPrecision(item.summary.model_info, t) },
  { key: "base-model", label: t("benchmark.Base model (recorded)"), render: (item) => formatBaseModels(item.summary.model_info, t) },
  { key: "artifact", label: t("benchmark.Artifact file (recorded)"), render: (item) => modelValue(item.summary.model_info?.artifact ?? null, t) },
  { key: "host-gpus", label: t("benchmark.Installed host GPUs"), render: item => item.summary.setup.host_gpus == null ? t("benchmark.Host GPU inventory not recorded") : item.summary.setup.host_gpus.length ? item.summary.setup.host_gpus.map(gpu => `${gpu.name ?? gpu.vendor ?? t("benchmark.Unknown device")}${gpu.integrated === true ? ` · ${t("benchmark.Integrated")}` : ""}`).join("; ") : t("benchmark.None reported") },
  { key: "selected-gpus", label: t("benchmark.Selected graphics"), render: item => selectedGpuRecord(item.summary.setup.gpus, item.summary.setup.mode, item.summary.setup.execution_selection_complete, t) },
  { key: "os", label: t("benchmark.Operating system"), render: (item) => formatComparisonOs(item.summary.setup, t) },
  { key: "cpu", label: t("benchmark.CPU"), render: (item) => formatComparisonCpu(item.summary.setup, t) },
  { key: "runtime", label: t("benchmark.Runtime and backend"), render: (item) => `${[item.summary.identity.engine_name, item.summary.identity.engine_version].filter(Boolean).join(" ") || t("benchmark.Unknown")} · ${item.summary.setup.backend ?? t("benchmark.Backend identity not recorded")}` },
  { key: "vram", label: t("benchmark.Selected GPU VRAM"), render: (item) => item.summary.setup.mode === "cpu" ? "CPU" : item.summary.setup.execution_selection_complete !== true ? t("benchmark.GPU selection not recorded") : item.summary.setup.vram_mb == null ? t("benchmark.Dedicated VRAM not reported") : formatComparisonVram(item.summary.setup, t) },
  { key: "execution", label: t("benchmark.Execution settings"), render: (item) => item.summary.setup.settings.length ? <ul>{item.summary.setup.settings.map((setting) => {
    const field = recordedSettingPresentation(setting, t);
    return <li key={field.identity} title={field.descriptor}>{field.label}: {field.value}{field.unit ? ` ${field.unit}` : ""}{field.description ? <p className="muted">{field.description}</p> : null}</li>;
  })}</ul> : t("benchmark.None reported") },
  { key: "method", label: t("benchmark.Method"), render: (item) => `${item.summary.identity.method_id ?? t("benchmark.Unknown")}@${item.summary.identity.method_version ?? t("benchmark.Unknown")}` },
  { key: "workload", label: t("benchmark.Workload"), render: (item) => item.summary.workload_label },
  { key: "input-context", label: t("benchmark.inputBytes"), render: (item) => `${item.summary.setup.max_input_bytes} B` },
  ...([
    ["engine_variant", "Runtime variant"], ["engine_build", "Runtime build"], ["engine_plugin_version", "Runtime plugin version"],
    ["model_format", "Weights format"], ["model_sha256", "Model checksum"], ["model_size_bytes", "Model size"],
    ["model_repository", "Repository (recorded)"], ["model_revision", "Source revision (recorded)"], ["app_version", "App version"],
  ] as const).map(([key, label]): ComparisonField => ({ key, label: t(`benchmark.${label}`), render: item => key === "model_size_bytes" ? formatByteSize(item.summary.identity[key], t) : item.summary.identity[key] == null ? t(key === "engine_variant" || key === "engine_plugin_version" ? "benchmark.Not recorded; applicability not declared" : "benchmark.Value not recorded") : displayText(item.summary.identity[key], t) })),
  ...(["inputs", "max_output_tokens", "corpus", "corpus_version", "warmup", "request_usage", "cache_policy"] as const).map((key): ComparisonField => ({
    key, label: t(`benchmark.${({ inputs: "Input hashes", max_output_tokens: "Maximum output token request", corpus: "Corpus", corpus_version: "Corpus version", warmup: "Warmup", request_usage: "Request usage", cache_policy: "Cache policy" })[key]}`),
    render: item => {
      const value = asRecord(item.summary.setup)?.[key];
      if (key === "cache_policy") return value === "cold_prompt" ? t("benchmark.Cold Prompt") : displayText(value, t);
      return key === "inputs" && Array.isArray(value) ? value.map(input => { const row = asRecord(input); return `${displayText(row?.bytes, t)} B · ${displayText(row?.sha256, t)}`; }).join("; ") : displayText(value, t);
    },
  })),
  {
    key: "samples",
    label: t("benchmark.Measurement count"),
    render: (item) => formatSampleCount(item.summary.row_count, 0, t),
  },
  {
    key: "measured-points",
    label: t("benchmark.Measured points"),
    render: (item) => item.summary.serving_points.map(servingLabel).join(" · ") || t("benchmark.Unknown"),
  },
  {
    key: "shown-point",
    label: t("benchmark.Reading at"),
    render: (item) => {
      const point = shownServingPoint(item, basis);
      return point ? t("benchmark.{point} · n={samples}", { point: servingLabel(point), samples: point.samples }) : t("benchmark.Not measured at this point");
    },
  },
  ...metricColumns.map((column, index): ComparisonField => ({
    key: column.key, label: column.unit ? `${column.label} (${column.unit})` : column.label, render: (item) => {
      const point = shownServingPoint(item, basis);
      if (!point) return t("benchmark.Not measured at this point");
      const key = SERVING_METRIC_KEYS[index]!;
      return point[key] ? column.format(point[key]?.median) : servingMetricAbsence(key, { requestUsage: item.summary.setup.request_usage, memoryScope: item.summary.setup.memory_scope }, t);
    },
  })),
  {
    key: "published",
    label: t("benchmark.Published"),
    render: (item) => <LocalTime value={item.created_at} />,
  },
  {
    key: "detail",
    label: t("benchmark.Detail"),
    render: (item) => (
      <Link
        className="explorer-detail-link"
        href={localizedPath(locale, `${explorerDetailHref(item.public_id)}${search ? `?${search}` : ""}`)}
        aria-label={t("benchmark.Open the full result for {model} on {hardware}", { model: item.summary.model_label, hardware: item.summary.hardware_label })}
      >{t("benchmark.Open result")}</Link>
    ),
  },
]; }

export interface BenchmarkExplorerComparisonProps {
  items: ExplorerItem[];
  onRemove: (item: ExplorerItem) => void;
  onClear: () => void;
  /** The point every column is read at, or null to let each column lead with its own. */
  basis?: ExplorerBasis | null;
}

export function BenchmarkExplorerComparison({
  items,
  onRemove,
  onClear,
  basis = null,
}: BenchmarkExplorerComparisonProps): React.JSX.Element | null {
  const { locale, t } = useI18n();
  const search = useSearchParams().toString();
  if (items.length === 0) return null;
  // Nonce and hashes are fresh per run; only the workload signature decides comparability.
  const comparable = new Set(items.map(servingComparisonSignature)).size === 1;
  // A single pick has nothing to differ from; the caveat is about the set.
  const identity = modelIdentityComparison(items.map((item) => item.summary.model_info));
  const differentArtifacts = items.length > 1 && (!identity.same || identity.unknown);
  return (
    <section className="explorer-comparison" aria-labelledby="explorer-comparison-title">
      <div className="explorer-comparison-header">
        <h3 id="explorer-comparison-title" className="explorer-comparison-title">{t("benchmark.Selected results")}</h3>
        <button type="button" className="explorer-button explorer-comparison-clear" data-action-glyph="clear" onClick={onClear}>{t("benchmark.Clear selection")}</button>
      </div>
      <p className="explorer-comparison-note">
        {t("benchmark.{count} of {limit} results selected. These are the results you picked; the site publishes self-reported measurements and does not rank them. Only summary fields appear here, so open a result to check its full environment before drawing a conclusion.", { count: items.length, limit: EXPLORER_COMPARE_LIMIT })}
      </p>
      <p className="explorer-comparison-caveat">{t("benchmark.Source repository and revision describe provenance, not the weights SHA256 or proof of unmodified weights.")}</p>
      <p className="explorer-comparison-caveat">{t("benchmark.No role means no common semantic role was assigned, not a missing setting value. No unit specified means the publication supplied no unit.")}</p>
      {differentArtifacts ? (
        <p className="explorer-comparison-caveat">
          {t("benchmark.These results do not all name the same weights file, or do not say which file they ran. A difference between their numbers can come from the file rather than from the setup. This is about which file was measured and says nothing about how good any model is.")}
        </p>
      ) : null}
      {comparable ? null : (
        <p className="explorer-comparison-caveat">
          {t("benchmark.Selected results differ in input bytes, output tokens, corpus, warmup, usage request, concurrencies, repetitions or execution settings. Read each column on its own terms.")}
        </p>
      )}
      <div
        className="explorer-comparison-scroll"
        role="region"
        aria-label={t("benchmark.Selected results comparison table")}
        tabIndex={0}
      >
        <table className="explorer-comparison-table" style={{ minWidth: `${10 + items.length * 12}rem` }}>
          <caption className="explorer-comparison-caption">{t("benchmark.Summary fields for the selected results, one column per result.")}</caption>
          <thead className="explorer-comparison-head">
            <tr className="explorer-comparison-head-row">
              <th scope="col" className="explorer-comparison-field-head">
                <ColumnHeading label={t("benchmark.Field")} />
              </th>
              {items.map((item) => (
                <th scope="col" key={item.public_id} className="explorer-comparison-item-head">
                  <span className="explorer-comparison-item-title">{item.summary.model_label}</span>
                  <button
                    type="button"
                    className="explorer-button explorer-button-quiet explorer-comparison-remove"
                    onClick={() => onRemove(item)}
                    aria-label={t("benchmark.Remove {model} on {hardware} from the comparison", { model: item.summary.model_label, hardware: item.summary.hardware_label })}
                  >{t("benchmark.Remove")}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="explorer-comparison-body">
            {comparisonFields(t, locale, search, basis).map((field) => (
              <tr key={field.key} className="explorer-comparison-row">
                <th scope="row" className="explorer-comparison-field">{field.label}</th>
                {items.map((item) => (
                  <td key={item.public_id} className={`explorer-cell explorer-comparison-cell-${field.key}`}>
                    {field.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

"use client";
import { useI18n } from "@/i18n/client";
import { localizedPath, type Locale } from "@/i18n/config";
import type { Translator } from "@/i18n/types";
import { useSearchParams } from "next/navigation";

import Link from "next/link";
import { BilingualHeader } from "./benchmark-i18n";
import {
  EXPLORER_COMPARE_LIMIT,
  comparisonCompatibility,
  explorerDetailHref,
  type ExplorerItem,
} from "./benchmark-explorer-state";
import { formatDuration, formatPromptLengths, formatPublishedDate, formatSampleCount, formatThroughput, formatComparisonCpu, formatComparisonExecution, formatComparisonOs, formatComparisonRuntime, formatComparisonVram } from "./benchmark-explorer-format";
import { formatBaseModels, formatWeightQuantization, modelIdentityComparison, modelPublisher, modelValue } from "./benchmark-model-identity";

/**
 * Side-by-side view of results the reader picked by hand. It transposes the
 * summary so each field reads across the selected columns, and it states plainly
 * when the selected runs used different methods or workloads, or when they did
 * not run the same weights file.
 */

interface ComparisonField {
  key: string;
  label: string;
  render: (item: ExplorerItem) => React.ReactNode;
}

function comparisonFields(t: Translator, locale: Locale, search: string): ComparisonField[] { return [
  { key: "publisher", label: t("benchmark.Publisher"), render: (item) => modelValue(modelPublisher(item.summary.model_info ?? null), t) },
  { key: "quantization", label: t("benchmark.Weight quantization"), render: (item) => formatWeightQuantization(item.summary.model_info ?? null, t) },
  { key: "base-model", label: t("benchmark.Base model"), render: (item) => formatBaseModels(item.summary.model_info ?? null, t) },
  { key: "artifact", label: t("benchmark.Artifact file"), render: (item) => modelValue(item.summary.model_info?.artifact ?? null, t) },
  { key: "hardware", label: t("benchmark.Hardware"), render: (item) => item.summary.hardware_label },
  { key: "os", label: t("benchmark.Operating system"), render: (item) => formatComparisonOs(item.summary.setup, t) },
  { key: "cpu", label: t("benchmark.CPU"), render: (item) => formatComparisonCpu(item.summary.setup, t) },
  { key: "runtime", label: t("benchmark.Runtime and backend"), render: (item) => formatComparisonRuntime(item.summary.setup, t) },
  { key: "vram", label: t("benchmark.VRAM"), render: (item) => formatComparisonVram(item.summary.setup, t) },
  { key: "execution", label: t("benchmark.Execution settings"), render: (item) => formatComparisonExecution(item.summary.setup, t) },
  { key: "method", label: t("benchmark.Method"), render: (item) => item.summary.method_label },
  { key: "workload", label: t("benchmark.Workload"), render: (item) => item.summary.workload_label },
  { key: "input-context", label: t("benchmark.Input context"), render: (item) => formatPromptLengths(item.summary.prompt_lengths) ?? t("benchmark.Unknown") },
  {
    key: "samples",
    label: t("benchmark.Measurement count"),
    render: (item) => formatSampleCount(item.summary.row_count, 0, t),
  },
  { key: "prompt-processing", label: t("benchmark.Prefill (tok/s)"), render: (item) => formatThroughput(item.summary.mean_pp_tps) },
  { key: "throughput", label: t("benchmark.Decode (tok/s)"), render: (item) => formatThroughput(item.summary.mean_tg_tps) },
  { key: "duration", label: t("benchmark.Duration (ms)"), render: (item) => formatDuration(item.summary.mean_e2e_ms) },
  {
    key: "published",
    label: t("benchmark.Published"),
    render: (item) => <time dateTime={item.created_at}>{formatPublishedDate(item.created_at)}</time>,
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
}

export function BenchmarkExplorerComparison({
  items,
  onRemove,
  onClear,
}: BenchmarkExplorerComparisonProps): React.JSX.Element | null {
  const { locale, t } = useI18n();
  const search = useSearchParams().toString();
  if (items.length === 0) return null;
  const compatibility = comparisonCompatibility(items);
  // A single pick has nothing to differ from; the caveat is about the set.
  const identity = modelIdentityComparison(items.map((item) => item.summary.model_info ?? null));
  const differentArtifacts = items.length > 1 && (!identity.same || identity.unknown);
  return (
    <section className="explorer-comparison" aria-labelledby="explorer-comparison-title">
      <div className="explorer-comparison-header">
        <h3 id="explorer-comparison-title" className="explorer-comparison-title">{t("benchmark.Selected results")}</h3>
        <button type="button" className="explorer-button explorer-comparison-clear" onClick={onClear}>{t("benchmark.Clear selection")}</button>
      </div>
      <p className="explorer-comparison-note">
        {t("benchmark.{count} of {limit} results selected. These are the results you picked; the site publishes self-reported measurements and does not rank them. Only summary fields appear here, so open a result to check its full environment before drawing a conclusion.", { count: items.length, limit: EXPLORER_COMPARE_LIMIT })}
      </p>
      {differentArtifacts ? (
        <p className="explorer-comparison-caveat">
          {t("benchmark.These results do not all name the same weights file, or do not say which file they ran. A difference between their numbers can come from the file rather than from the setup. This is about which file was measured and says nothing about how good any model is.")}
        </p>
      ) : null}
      {compatibility.comparable ? null : (
        <p className="explorer-comparison-caveat">
          {t("benchmark.Not directly comparable. The selected results do not share one method and workload (methods: {methods}; workloads: {workloads}), so their numbers describe different work. Read each column on its own terms.", { methods: compatibility.methods.join(', '), workloads: compatibility.workloads.join(', ') })}
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
                <BilingualHeader local={t("benchmark.Field")} en="Field" locale={locale} />
              </th>
              {items.map((item) => (
                <th scope="col" key={item.public_id} className="explorer-comparison-item-head">
                  <span className="explorer-comparison-item-title">{item.summary.model_label}</span>
                  <button
                    type="button"
                    className="explorer-comparison-remove"
                    onClick={() => onRemove(item)}
                    aria-label={t("benchmark.Remove {model} on {hardware} from the comparison", { model: item.summary.model_label, hardware: item.summary.hardware_label })}
                  >{t("benchmark.Remove")}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="explorer-comparison-body">
            {comparisonFields(t, locale, search).map((field) => (
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

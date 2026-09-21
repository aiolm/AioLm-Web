"use client";
import { LocalTime } from "./local-time";
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
import { formatDuration, formatMeasuredPoints, formatPointLabel, formatPromptLengths, formatSampleCount, formatThroughput, formatComparisonCpu, formatComparisonExecution, formatComparisonOs, formatComparisonRuntime, formatComparisonVram } from "./benchmark-explorer-format";
import { defaultPoint, findPoint, pointMedian, type BenchmarkPoint } from "@/lib/benchmark-points";
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

/**
 * The point each column is read at. A comparison whose columns report different
 * operating points is not a comparison, so the basis applies to every column and
 * a result that never measured it reports the point as missing.
 */
function shownPoint(item: ExplorerItem, basis: { prompt_tokens: number; concurrency: number } | null): BenchmarkPoint | null {
  return basis ? findPoint(item.summary.points, basis.prompt_tokens, basis.concurrency) : defaultPoint(item.summary.points);
}

function comparisonFields(t: Translator, locale: Locale, search: string, basis: { prompt_tokens: number; concurrency: number } | null): ComparisonField[] { return [
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
  {
    key: "measured-points",
    label: t("benchmark.Measured points"),
    render: (item) => formatMeasuredPoints(item.summary.points) ?? t("benchmark.Unknown"),
  },
  {
    key: "shown-point",
    label: t("benchmark.Reading at"),
    render: (item) => {
      const point = shownPoint(item, basis);
      return point
        ? t("benchmark.{point} · n={samples}", { point: formatPointLabel(point.prompt_tokens, point.concurrency), samples: String(point.samples) })
        : t("benchmark.Not measured at this point");
    },
  },
  { key: "prompt-processing", label: t("benchmark.Prefill (tok/s)"), render: (item) => formatThroughput(pointMedian(shownPoint(item, basis), "pp_tps")) },
  { key: "throughput", label: t("benchmark.Decode (tok/s)"), render: (item) => formatThroughput(pointMedian(shownPoint(item, basis), "tg_tps")) },
  { key: "ttft", label: t("benchmark.TTFT (s)"), render: (item) => formatDuration(pointMedian(shownPoint(item, basis), "ttft_ms")) },
  { key: "duration", label: t("benchmark.Duration (s)"), render: (item) => formatDuration(pointMedian(shownPoint(item, basis), "e2e_ms")) },
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
  basis?: { prompt_tokens: number; concurrency: number } | null;
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

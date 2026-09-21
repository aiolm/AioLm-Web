"use client";
import { LocalTime } from "./local-time";
import { useI18n } from "@/i18n/client";
import { localizedPath } from "@/i18n/config";
import { useSearchParams } from "next/navigation";

import Link from "next/link";
import { BilingualHeader } from "./benchmark-i18n";
import {
  EXPLORER_COMPARE_LIMIT,
  explorerDetailHref,
  isCompared,
  type ExplorerItem,
} from "./benchmark-explorer-state";
import {
  environmentFacts,
  extractGpuList,
  formatDuration,
  formatMeasuredPoints,
  formatMethodName,
  formatPointLabel,
  formatPromptLengths,
  formatSecondsSpread,
  formatThroughput,
  formatThroughputSpread,
  formatWorkloadName,
  type SummaryFact,
} from "./benchmark-explorer-format";
import { defaultPoint, findPoint, pointMedian, type BenchmarkPoint } from "@/lib/benchmark-points";
import { formatWeightQuantization, modelPublisher, modelValue } from "./benchmark-model-identity";

/**
 * Published results as one native table. Model and Environment are separated
 * so the hardware and runtime scan cleanly while publisher and weight quantization
 * stay beside the model identity.
 *
 * Every speed here is read at one operating point, never averaged across the
 * input lengths and concurrencies a result happened to measure. With a basis
 * point named, each row reports that point and the column compares like for
 * like; without one, each row reports its own leading point and says which.
 *
 * Headings are bilingual on ko/ja/zh (local + English nowrap) and English on en.
 * Results are successful-only; failed rows and status badges are omitted.
 */

/** Labeled supporting values inside a cell, packed onto as few lines as they need. */
function FactList({ className, facts }: { className: string; facts: SummaryFact[] }): React.JSX.Element | null {
  if (facts.length === 0) return null;
  return (
    <ul className={`explorer-facts ${className}`}>
      {facts.map((fact) => (
        <li className="explorer-fact" key={fact.key}>
          <span className="explorer-fact-label">{fact.label}</span>
          <span className="explorer-fact-value">{fact.value}</span>
        </li>
      ))}
    </ul>
  );
}

interface ExplorerCellProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

function ExplorerCell({ label, className, children }: ExplorerCellProps): React.JSX.Element {
  return (
    <td className={className ? `explorer-cell ${className}` : "explorer-cell"}>
      <span className="explorer-cell-label" aria-hidden="true">{label}</span>
      <div className="explorer-cell-value">{children}</div>
    </td>
  );
}

/** A measured value with the range its repetitions covered, when they covered one. */
function MetricCell({ value, spread }: { value: string; spread: string | null }): React.JSX.Element {
  return (
    <>
      <span className="explorer-metric-value">{value}</span>
      {spread === null ? null : <span className="explorer-metric-spread">{spread}</span>}
    </>
  );
}

export interface BenchmarkExplorerTableProps {
  items: ExplorerItem[];
  compare: ExplorerItem[];
  onToggleComparison: (item: ExplorerItem) => void;
  /** The point every row is read at, or null to let each row lead with its own. */
  basis?: { prompt_tokens: number; concurrency: number } | null;
}

export function BenchmarkExplorerTable({
  items,
  compare,
  onToggleComparison,
  basis = null,
}: BenchmarkExplorerTableProps): React.JSX.Element {
  const { locale, t } = useI18n();
  const search = useSearchParams().toString();
  const comparisonFull = compare.length >= EXPLORER_COMPARE_LIMIT;
  const basisLabel = basis ? formatPointLabel(basis.prompt_tokens, basis.concurrency) : null;
  return (
    <table className="explorer-table">
      <caption className="explorer-table-caption">
        {basisLabel
          ? t("benchmark.Published results in your selected order, each read at {point}. A result that never measured that point reports it as missing.", { point: basisLabel })
          : t("benchmark.Published results in your selected order. Each row reports its own leading operating point, which is named in the row.")}
      </caption>
      <thead className="explorer-table-head">
        <tr className="explorer-head-row">
          <th scope="col" className="explorer-head-cell explorer-head-compare">
            <BilingualHeader local={t("benchmark.Compare")} en="Compare" locale={locale} />
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-identity explorer-head-model">
            <BilingualHeader local={t("benchmark.Model")} en="Model" locale={locale} />
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-environment">
            <BilingualHeader local={t("benchmark.Environment")} en="Environment" locale={locale} />
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-numeric explorer-head-prefill">
            <BilingualHeader local={t("benchmark.Prefill")} en="Prefill" unit="tok/s" locale={locale} />
            {basisLabel ? <span className="explorer-head-basis">{basisLabel}</span> : null}
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-numeric explorer-head-decode">
            <BilingualHeader local={t("benchmark.Decode")} en="Decode" unit="tok/s" locale={locale} />
            {basisLabel ? <span className="explorer-head-basis">{basisLabel}</span> : null}
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-setup">
            <BilingualHeader local={t("benchmark.Context / workload")} en="Context / Workload" locale={locale} />
          </th>
        </tr>
      </thead>
      <tbody className="explorer-table-body">
        {items.map((item) => {
          const { summary } = item;
          const selected = isCompared(compare, item.public_id);
          const identity = { model: summary.model_label, hardware: summary.hardware_label };
          const info = summary.model_info ?? null;
          // Publisher and weight quantization qualify the model name itself, so
          // they stay next to it and name their gaps instead of disappearing.
          const modelFacts: SummaryFact[] = [
            { key: "publisher", label: t("benchmark.Publisher"), value: modelValue(modelPublisher(info), t) },
            { key: "quantization", label: t("benchmark.Weight quantization"), value: formatWeightQuantization(info, t) },
          ];
          const envRaw = environmentFacts(summary.setup, t).filter(fact => fact.key !== "gpu" && (summary.setup?.cpu ? fact.key !== "cores" : true));
          const gpuList = extractGpuList(summary);
          const gpuValue: React.ReactNode = gpuList.length > 1 ? (
            <span className="explorer-gpu-list">
              {gpuList.map((gpu, index) => (
                <span key={index} className="explorer-gpu-item">{gpu}</span>
              ))}
            </span>
          ) : (
            gpuList[0] ?? summary.hardware_label
          );
          const envFacts: SummaryFact[] = [
            { key: "gpu", label: t("benchmark.GPU"), value: gpuValue },
            ...envRaw,
          ];
          const contextFormatted = formatPromptLengths(summary.prompt_lengths) ?? t("benchmark.Unknown");
          // With a basis named every row answers the same question; without one
          // each row leads with a point it actually measured and says which.
          const shown: BenchmarkPoint | null = basis
            ? findPoint(summary.points, basis.prompt_tokens, basis.concurrency)
            : defaultPoint(summary.points);
          const measuredPoints = formatMeasuredPoints(summary.points);
          const duration = pointMedian(shown, "e2e_ms");
          const setupFacts: SummaryFact[] = [
            { key: "context", label: t("benchmark.Input context"), value: contextFormatted },
            { key: "workload", label: t("benchmark.Workload"), value: formatWorkloadName(summary.workload_label, t) },
            { key: "method", label: t("benchmark.Method"), value: formatMethodName(summary.method_label, t) },
            {
              key: "shown-point",
              label: t("benchmark.Reading at"),
              value: shown
                ? t("benchmark.{point} · n={samples}", { point: formatPointLabel(shown.prompt_tokens, shown.concurrency), samples: String(shown.samples) })
                : t("benchmark.Not measured at this point"),
            },
            ...(duration != null ? [{
              key: "duration",
              label: t("benchmark.Duration"),
              value: `${formatDuration(duration)} s${formatSecondsSpread(shown?.e2e_ms) ? ` (${formatSecondsSpread(shown?.e2e_ms)})` : ""}`,
            }] : []),
            ...(measuredPoints ? [{ key: "measured-points", label: t("benchmark.Measured points"), value: measuredPoints }] : []),
          ];
          return (
            <tr key={item.public_id} className="explorer-row">
              <td className="explorer-cell explorer-cell-compare">
                <span className="explorer-cell-label" aria-hidden="true">{t("benchmark.Compare")}</span>
                <input
                  className="explorer-compare-input"
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && comparisonFull}
                  onChange={() => onToggleComparison(item)}
                  aria-label={t(selected ? "benchmark.Remove {model} on {hardware} from the comparison" : "benchmark.Add {model} on {hardware} to the comparison", identity)}
                />
              </td>
              <th scope="row" className="explorer-cell explorer-cell-identity explorer-cell-model">
                <span className="explorer-cell-label" aria-hidden="true">{t("benchmark.Model")}</span>
                <div className="explorer-cell-value">
                  <Link
                    className="explorer-detail-link"
                    href={localizedPath(locale, `${explorerDetailHref(item.public_id)}${search ? `?${search}` : ""}`)}
                    aria-label={t("benchmark.Open the full result for {model} on {hardware}", identity)}
                  >
                    {summary.model_label}
                  </Link>
                  <FactList className="explorer-model-facts" facts={modelFacts} />
                </div>
              </th>
              <td className="explorer-cell explorer-cell-environment">
                <span className="explorer-cell-label" aria-hidden="true">{t("benchmark.Environment")}</span>
                <div className="explorer-cell-value">
                  <FactList className="explorer-environment-facts" facts={envFacts} />
                </div>
              </td>
              <ExplorerCell label={t("benchmark.Prefill (tok/s)")} className="explorer-cell-numeric explorer-cell-prefill">
                <MetricCell value={formatThroughput(pointMedian(shown, "pp_tps"))} spread={formatThroughputSpread(shown?.pp_tps)} />
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Decode (tok/s)")} className="explorer-cell-numeric explorer-cell-decode">
                <MetricCell value={formatThroughput(pointMedian(shown, "tg_tps"))} spread={formatThroughputSpread(shown?.tg_tps)} />
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Context / workload")} className="explorer-cell-setup">
                <FactList className="explorer-setup-facts" facts={setupFacts} />
                <div className="explorer-fact explorer-registered-date">
                  <span className="explorer-fact-label">{t("benchmark.Registered")}</span>
                  <span className="explorer-fact-value"><LocalTime value={item.created_at} /></span>
                </div>
                {/* Keep screen-reader / test compatibility for compound strings */}
                <span className="sr-only">{t("benchmark.Input context: {value}", { value: contextFormatted })}</span>
                <span className="sr-only">{t("benchmark.Measurement count: {value}", { value: String(summary.row_count) })}</span>
              </ExplorerCell>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

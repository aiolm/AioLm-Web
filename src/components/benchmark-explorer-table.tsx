"use client";
import { LocalTime } from "./local-time";
import { useI18n } from "@/i18n/client";
import type { Translator } from "@/i18n/types";
import { localizedPath } from "@/i18n/config";
import { useSearchParams } from "next/navigation";

import Link from "next/link";
import { ColumnHeading } from "./benchmark-i18n";
import {
  EXPLORER_COMPARE_LIMIT,
  explorerDetailHref,
  isCompared,
  type ExplorerItem,
  type ExplorerBasis,
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
  formatServingMetric,
} from "./benchmark-explorer-format";
import { defaultPoint, findPoint, pointMedian, defaultServingPoint, findServingPoint, type BenchmarkPoint, type ServingBenchmarkPoint } from "@/lib/benchmark-points";
import { formatWeightPrecision, modelPublisher, modelValue } from "./benchmark-model-identity";
import { selectedGpuRecord, servingMetricAbsence } from "./benchmark-evidence";
import { BenchmarkModelInformation } from "./benchmark-model-information";

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
 * Serving rows keep their exact measured point in view; the model link leads
 * to full configuration, provenance and statistics. Legacy rows retain their
 * context/workload and per-row disclosure. No conditions are assumed shared.
 *
 * Headings are in the page language only.
 * Results are successful-only; failed rows and status badges are omitted.
 */

/** Labeled supporting values inside a cell, packed onto as few lines as they need. */
function FactList({ className, facts }: { className: string; facts: SummaryFact[] }): React.JSX.Element | null {
  if (facts.length === 0) return null;
  return (
    <ul className={`explorer-facts ${className}`}>
      {facts.map((fact) => (
        <li className="explorer-fact" data-fact={fact.key} key={fact.key}>
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

function servingSpread(key: "first_output_ms" | "output_bytes_per_second", point: ServingBenchmarkPoint | null, t: Translator): string | null {
  const stat = point?.[key];
  if (!point || !stat) return null;
  if (stat.min === stat.max) return stat.samples === point.samples ? null : `n=${stat.samples}`;
  return `${formatServingMetric(key, stat.min, t)}–${formatServingMetric(key, stat.max, t)} · n=${stat.samples}`;
}

export interface BenchmarkExplorerTableProps {
  items: ExplorerItem[];
  compare: ExplorerItem[];
  onToggleComparison: (item: ExplorerItem) => void;
  /** The point every row is read at, or null to let each row lead with its own. */
  basis?: ExplorerBasis | null;
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
  const legacyBasis = basis && "prompt_tokens" in basis ? basis : null;
  const basisLabel = legacyBasis ? formatPointLabel(legacyBasis.prompt_tokens, legacyBasis.concurrency) : null;
  const servingBasis = basis && "input_bytes" in basis ? basis : null;
  if (items.every(item => item.summary.schema_version === 3)) return <table className="explorer-table">
    <caption className="explorer-table-caption">{t("benchmark.Client-observed API measurements. Sorting is not an independently verified hardware or engine ranking.")}</caption>
    <thead className="explorer-table-head">
      <tr className="explorer-head-row">
        <th scope="col" className="explorer-head-cell explorer-head-compare">
          <ColumnHeading label={t("benchmark.Compare")} />
        </th>
        <th scope="col" className="explorer-head-cell explorer-head-identity explorer-head-model">
          <ColumnHeading label={t("benchmark.Model")} />
        </th>
        <th scope="col" className="explorer-head-cell explorer-head-environment">
          <ColumnHeading label={t("benchmark.Hardware and engine")} />
        </th>
        <th scope="col" className="explorer-head-cell explorer-head-numeric explorer-head-prefill">
          <ColumnHeading label={t("benchmark.First output")} />
        </th>
        <th scope="col" className="explorer-head-cell explorer-head-numeric explorer-head-decode">
          <ColumnHeading label={t("benchmark.Observed output B/s")} />
        </th>
        <th scope="col" className="explorer-head-cell explorer-head-setup">
          <ColumnHeading label={t("benchmark.Test conditions")} />
        </th>
      </tr>
    </thead>
    <tbody className="explorer-table-body">{items.map(item => {
      const summary = item.summary;
      const shown = servingBasis ? findServingPoint(summary.serving_points, servingBasis.input_bytes, servingBasis.concurrency, servingBasis.max_output_tokens) : defaultServingPoint(summary.serving_points);
      const selected = isCompared(compare, item.public_id);
      const identity = { model: summary.model_label, hardware: summary.hardware_label };
      const gpuList = extractGpuList(summary);
      const hostGpus = summary.setup?.host_gpus;
      const environmentSummary: SummaryFact[] = [
        { key: "host_gpu", label: t("benchmark.Installed host GPUs"), value: hostGpus == null ? t("benchmark.Host GPU inventory not recorded") : hostGpus.length ? hostGpus.map(gpu => `${gpu.name ?? gpu.vendor ?? t("benchmark.Unknown device")}${gpu.integrated === true ? ` · ${t("benchmark.Integrated")}` : ""}`).join(", ") : t("benchmark.None reported") },
        { key: "gpu", label: t("benchmark.Selected graphics"), value: selectedGpuRecord(gpuList, summary.setup?.mode, summary.setup?.execution_selection_complete, t) },
        { key: "cpu", label: t("benchmark.CPU"), value: summary.setup?.cpu ?? t("benchmark.Unknown") },
        { key: "runtime", label: t("benchmark.Inference engine"), value: `${summary.identity?.engine_name ?? t("benchmark.Unknown")}${summary.setup?.backend ? ` · ${summary.setup.backend}` : ""}` },
      ];
      return <tr className="explorer-row" key={item.public_id}>
        <ExplorerCell label={t("benchmark.Compare")} className="explorer-cell-compare"><input type="checkbox" className="explorer-compare-input" checked={selected} disabled={!selected && comparisonFull} aria-label={t(selected ? "benchmark.Remove {model} on {hardware} from the comparison" : "benchmark.Add {model} on {hardware} to the comparison", identity)} onChange={() => onToggleComparison(item)} /></ExplorerCell>
        <th scope="row" className="explorer-cell explorer-cell-identity explorer-cell-model"><Link className="explorer-detail-link" href={localizedPath(locale, `${explorerDetailHref(item.public_id)}${search ? `?${search}` : ""}`)}>{summary.model_label}</Link><FactList className="explorer-model-facts" facts={[{ key: "format", label: t("benchmark.Model format"), value: summary.identity?.model_format ?? t("benchmark.Unknown") }, { key: "quantization", label: t("benchmark.Weight quantization"), value: formatWeightPrecision(summary.model_info ?? null, t) }]} /><BenchmarkModelInformation publicId={item.public_id} recordedName={summary.model_info?.name} compact /></th>
        <ExplorerCell label={t("benchmark.Hardware and engine")} className="explorer-cell-environment"><FactList className="explorer-environment-facts explorer-serving-environment" facts={environmentSummary} /></ExplorerCell>
        <ExplorerCell label={t("benchmark.First output")} className="explorer-cell-numeric explorer-cell-prefill"><MetricCell value={!shown ? t("benchmark.Not measured at this point") : shown.first_output_ms ? formatServingMetric("first_output_ms", shown.first_output_ms.median, t) : servingMetricAbsence("first_output_ms", { outputBytes: shown.output_bytes?.max }, t)} spread={servingSpread("first_output_ms", shown, t)} /></ExplorerCell>
        <ExplorerCell label={t("benchmark.Observed output B/s")} className="explorer-cell-numeric explorer-cell-decode"><MetricCell value={!shown ? t("benchmark.Not measured at this point") : shown.output_bytes_per_second ? formatServingMetric("output_bytes_per_second", shown.output_bytes_per_second.median, t) : servingMetricAbsence("output_bytes_per_second", {}, t)} spread={servingSpread("output_bytes_per_second", shown, t)} /></ExplorerCell>
        <ExplorerCell label={t("benchmark.Test conditions")} className="explorer-cell-setup">
          <span className="explorer-setup-line">{shown ? t("benchmark.{bytes} B input · {concurrency} requests · max {tokens} output tokens", { bytes: shown.input_bytes, concurrency: shown.concurrency, tokens: shown.max_output_tokens }) : t("benchmark.Not measured at this point")}</span>
          {shown ? <span className="explorer-setup-line">{t("benchmark.{count} measurements", { count: shown.samples })}</span> : null}
        </ExplorerCell>
      </tr>;
    })}</tbody>
  </table>;
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
            <ColumnHeading label={t("benchmark.Compare")} />
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-identity explorer-head-model">
            <ColumnHeading label={t("benchmark.Model")} />
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-environment">
            <ColumnHeading label={t("benchmark.Environment")} />
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-numeric explorer-head-prefill">
            <ColumnHeading label={t("benchmark.Prefill")} unit="tok/s" />
            {basisLabel ? <span className="explorer-head-basis">{basisLabel}</span> : null}
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-numeric explorer-head-decode">
            <ColumnHeading label={t("benchmark.Decode")} unit="tok/s" />
            {basisLabel ? <span className="explorer-head-basis">{basisLabel}</span> : null}
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-setup">
            <ColumnHeading label={t("benchmark.Context / workload")} />
          </th>
        </tr>
      </thead>
      <tbody className="explorer-table-body">
        {items.map((item) => {
          const { summary } = item;
          const selected = isCompared(compare, item.public_id);
          const identity = { model: summary.model_label, hardware: summary.hardware_label };
          const info = summary.model_info ?? null;
          // Weight quantization qualifies the model name itself, so it stays next to
          // it; both it and the publisher name their gaps instead of disappearing.
          const quantizationFact: SummaryFact = { key: "quantization", label: t("benchmark.Weight quantization"), value: formatWeightPrecision(info, t) };
          const publisherFact: SummaryFact = { key: "publisher", label: t("benchmark.Repository owner (recorded)"), value: modelValue(modelPublisher(info), t) };
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
          // The device and backend identify the environment at a glance; the rest qualifies it.
          const environmentSummary = envFacts.filter(fact => fact.key === "gpu" || fact.key === "backend");
          const environmentDetails = envFacts.filter(fact => fact.key !== "gpu" && fact.key !== "backend");
          const contextFormatted = formatPromptLengths(summary.prompt_lengths) ?? t("benchmark.Unknown");
          // With a basis named every row answers the same question; without one
          // each row leads with a point it actually measured and says which.
          const shown: BenchmarkPoint | null = legacyBasis
            ? findPoint(summary.points, legacyBasis.prompt_tokens, legacyBasis.concurrency)
            : defaultPoint(summary.points);
          const measuredPoints = formatMeasuredPoints(summary.points);
          const duration = pointMedian(shown, "e2e_ms");
          const readingFact: SummaryFact = {
            key: "shown-point",
            label: t("benchmark.Reading at"),
            value: shown
              ? t("benchmark.{point} · n={samples}", { point: formatPointLabel(shown.prompt_tokens, shown.concurrency), samples: String(shown.samples) })
              : t("benchmark.Not measured at this point"),
          };
          const detailFacts: SummaryFact[] = [
            publisherFact,
            ...environmentDetails,
            { key: "method", label: t("benchmark.Method"), value: formatMethodName(summary.method_label, t) },
            ...(duration != null ? [{
              key: "duration",
              label: t("benchmark.Duration"),
              value: `${formatDuration(duration)} s${formatSecondsSpread(shown?.e2e_ms) ? ` (${formatSecondsSpread(shown?.e2e_ms)})` : ""}`,
            }] : []),
            ...(measuredPoints ? [{ key: "measured-points", label: t("benchmark.Measured points"), value: measuredPoints }] : []),
            { key: "registered", label: t("benchmark.Registered"), value: <LocalTime value={item.created_at} /> },
          ];
          return (
            <tr key={item.public_id} className="explorer-row">
              <td className="explorer-cell explorer-cell-compare">
                <span className="explorer-cell-label" aria-hidden="true">{t("benchmark.Compare")}</span>
                <label className="explorer-compare-control">
                <input
                  className="explorer-compare-input"
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && comparisonFull}
                  onChange={() => onToggleComparison(item)}
                  aria-label={t(selected ? "benchmark.Remove {model} on {hardware} from the comparison" : "benchmark.Add {model} on {hardware} to the comparison", identity)}
                />
                </label>
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
                  <FactList className="explorer-model-facts" facts={[quantizationFact]} />
                  <BenchmarkModelInformation publicId={item.public_id} recordedName={info?.name} compact />
                </div>
              </th>
              <td className="explorer-cell explorer-cell-environment">
                <span className="explorer-cell-label" aria-hidden="true">{t("benchmark.Environment")}</span>
                <div className="explorer-cell-value">
                  <FactList className="explorer-environment-facts" facts={environmentSummary} />
                </div>
              </td>
              <ExplorerCell label={t("benchmark.Prefill (tok/s)")} className="explorer-cell-numeric explorer-cell-prefill">
                <MetricCell value={formatThroughput(pointMedian(shown, "pp_tps"))} spread={formatThroughputSpread(shown?.pp_tps)} />
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Decode (tok/s)")} className="explorer-cell-numeric explorer-cell-decode">
                <MetricCell value={formatThroughput(pointMedian(shown, "tg_tps"))} spread={formatThroughputSpread(shown?.tg_tps)} />
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Context / workload")} className="explorer-cell-setup">
                {/* Whole lines: the configured input lengths, then the workload they ran. */}
                <span className="explorer-setup-line explorer-setup-context" aria-hidden="true">{contextFormatted}</span>
                <span className="sr-only">{t("benchmark.Input context: {value}", { value: contextFormatted })}</span>
                <span className="explorer-setup-line explorer-setup-workload">
                  <span className="sr-only">{t("benchmark.Workload")} </span>{formatWorkloadName(summary.workload_label, t)}
                </span>
                <FactList className="explorer-setup-facts" facts={[readingFact]} />
                <details className="explorer-row-details">
                  <summary aria-label={t("benchmark.Setup and provenance for {model} on {hardware}", identity)}>{t("benchmark.Setup and provenance")}</summary>
                  <FactList className="explorer-detail-facts" facts={detailFacts} />
                </details>
                <span className="sr-only">{t("benchmark.Measurement count: {value}", { value: String(summary.row_count) })}</span>
              </ExplorerCell>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

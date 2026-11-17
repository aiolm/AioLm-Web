"use client";
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
  extractGpuList,
  type SummaryFact,
  formatServingMetric,
} from "./benchmark-explorer-format";
import { defaultServingPoint, findServingPoint, type ServingBenchmarkPoint } from "@/lib/benchmark-points";
import { formatWeightPrecision } from "./benchmark-model-identity";
import { selectedGpuRecord, servingMetricAbsence } from "./benchmark-evidence";
import { BenchmarkModelInformation } from "./benchmark-model-information";

/**
 * Published results as one native table. Model and Environment are separated
 * so the hardware and runtime scan cleanly while weight quantization stays
 * beside the model identity.
 *
 * Every speed here is read at one operating point, never averaged across the
 * input sizes and concurrencies a result happened to measure. With a basis
 * point named, each row reports that point and the column compares like for
 * like; without one, each row reports its own leading point and says which.
 * The model link leads to full configuration, provenance and statistics.
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
  return <table className="explorer-table">
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
      const shown = basis ? findServingPoint(summary.serving_points, basis.input_bytes, basis.concurrency, basis.max_output_tokens) : defaultServingPoint(summary.serving_points);
      const selected = isCompared(compare, item.public_id);
      const identity = { model: summary.model_label, hardware: summary.hardware_label };
      const gpuList = extractGpuList(summary);
      const hostGpus = summary.setup.host_gpus;
      const environmentSummary: SummaryFact[] = [
        { key: "host_gpu", label: t("benchmark.Installed host GPUs"), value: hostGpus == null ? t("benchmark.Host GPU inventory not recorded") : hostGpus.length ? hostGpus.map(gpu => `${gpu.name ?? gpu.vendor ?? t("benchmark.Unknown device")}${gpu.integrated === true ? ` · ${t("benchmark.Integrated")}` : ""}`).join(", ") : t("benchmark.None reported") },
        { key: "gpu", label: t("benchmark.Selected graphics"), value: selectedGpuRecord(gpuList, summary.setup.mode, summary.setup.execution_selection_complete, t) },
        { key: "cpu", label: t("benchmark.CPU"), value: summary.setup.cpu ?? t("benchmark.Unknown") },
        { key: "runtime", label: t("benchmark.Inference engine"), value: `${summary.identity.engine_name ?? t("benchmark.Unknown")}${summary.setup.backend ? ` · ${summary.setup.backend}` : ""}` },
      ];
      return <tr className="explorer-row" key={item.public_id}>
        <ExplorerCell label={t("benchmark.Compare")} className="explorer-cell-compare"><input type="checkbox" className="explorer-compare-input" checked={selected} disabled={!selected && comparisonFull} aria-label={t(selected ? "benchmark.Remove {model} on {hardware} from the comparison" : "benchmark.Add {model} on {hardware} to the comparison", identity)} onChange={() => onToggleComparison(item)} /></ExplorerCell>
        <th scope="row" aria-label={summary.model_label} className="explorer-cell explorer-cell-identity explorer-cell-model"><Link className="explorer-detail-link" href={localizedPath(locale, `${explorerDetailHref(item.public_id)}${search ? `?${search}` : ""}`)}>{summary.model_label}</Link><FactList className="explorer-model-facts" facts={[{ key: "format", label: t("benchmark.Model format"), value: summary.identity.model_format ?? t("benchmark.Unknown") }, { key: "quantization", label: t("benchmark.Weight quantization"), value: formatWeightPrecision(summary.model_info, t) }]} /><BenchmarkModelInformation publicId={item.public_id} recordedName={summary.model_info?.name} compact /></th>
        <ExplorerCell label={t("benchmark.Hardware and engine")} className="explorer-cell-environment"><FactList className="explorer-environment-facts explorer-serving-environment" facts={environmentSummary} /></ExplorerCell>
        <ExplorerCell label={t("benchmark.First output")} className="explorer-cell-numeric explorer-cell-prefill"><MetricCell value={!shown ? t("benchmark.Not measured at this point") : shown.first_output_ms ? formatServingMetric("first_output_ms", shown.first_output_ms.median, t) : servingMetricAbsence("first_output_ms", {}, t)} spread={servingSpread("first_output_ms", shown, t)} /></ExplorerCell>
        <ExplorerCell label={t("benchmark.Observed output B/s")} className="explorer-cell-numeric explorer-cell-decode"><MetricCell value={!shown ? t("benchmark.Not measured at this point") : shown.output_bytes_per_second ? formatServingMetric("output_bytes_per_second", shown.output_bytes_per_second.median, t) : servingMetricAbsence("output_bytes_per_second", {}, t)} spread={servingSpread("output_bytes_per_second", shown, t)} /></ExplorerCell>
        <ExplorerCell label={t("benchmark.Test conditions")} className="explorer-cell-setup">
          <span className="explorer-setup-line">{shown ? t("benchmark.{bytes} B input · {concurrency} requests · max {tokens} output tokens", { bytes: shown.input_bytes, concurrency: shown.concurrency, tokens: shown.max_output_tokens }) : t("benchmark.Not measured at this point")}</span>
          {shown ? <span className="explorer-setup-line">{t("benchmark.{count} measurements", { count: shown.samples })}</span> : null}
        </ExplorerCell>
      </tr>;
    })}</tbody>
  </table>;
}

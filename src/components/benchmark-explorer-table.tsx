"use client";
import { useI18n } from "@/i18n/client";
import { localizedPath } from "@/i18n/config";
import { useSearchParams } from "next/navigation";

import Link from "next/link";
import {
  EXPLORER_COMPARE_LIMIT,
  explorerDetailHref,
  isCompared,
  type ExplorerItem,
} from "./benchmark-explorer-state";
import { environmentFacts, formatDuration, formatPromptLengths, formatPublishedDate, formatSampleCount, formatThroughput, type SummaryFact } from "./benchmark-explorer-format";
import { formatWeightQuantization, modelPublisher, modelValue } from "./benchmark-model-identity";

/**
 * Published results as one native table. Setup fields are paired into a single
 * column each, so the desktop table stays scannable while every cell keeps a
 * label element that lets the same markup stack into readable rows on a phone.
 *
 * Inside a cell, supporting values are labeled facts rather than one separated
 * line: who published the weights and how they were quantized are different
 * claims from the operating system and the backend, and a reader should not have
 * to infer which is which from their order.
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

export interface BenchmarkExplorerTableProps {
  items: ExplorerItem[];
  compare: ExplorerItem[];
  onToggleComparison: (item: ExplorerItem) => void;
}

export function BenchmarkExplorerTable({
  items,
  compare,
  onToggleComparison,
}: BenchmarkExplorerTableProps): React.JSX.Element {
  const { locale, t } = useI18n();
  const search = useSearchParams().toString();
  const comparisonFull = compare.length >= EXPLORER_COMPARE_LIMIT;
  return (
    <table className="explorer-table">
      <caption className="explorer-table-caption">{t("benchmark.Published results in your selected order. Each row is a self-reported measurement of one configuration.")}</caption>
      <thead className="explorer-table-head">
        <tr className="explorer-head-row">
          <th scope="col" className="explorer-head-cell explorer-head-compare">{t("benchmark.Compare")}</th>
          <th scope="col" className="explorer-head-cell explorer-head-identity">{t("benchmark.Model & hardware")}</th>
          <th scope="col" className="explorer-head-cell explorer-head-setup">{t("benchmark.Method & workload")}</th>
          <th scope="col" className="explorer-head-cell explorer-head-numeric">{t("benchmark.Prompt processing")}{" "}<span className="explorer-unit">{t("benchmark.(tok/s)")}</span>
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-numeric">{t("benchmark.Generation")}{" "}<span className="explorer-unit">{t("benchmark.(tok/s)")}</span>
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-numeric">{t("benchmark.Duration")}{" "}<span className="explorer-unit">{t("benchmark.(ms)")}</span>
          </th>
          <th scope="col" className="explorer-head-cell explorer-head-published">{t("benchmark.Published")}</th>
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
              <th scope="row" className="explorer-cell explorer-cell-identity">
                <span className="explorer-cell-label" aria-hidden="true">{t("benchmark.Model & hardware")}</span>
                <div className="explorer-cell-value">
                  <Link
                    className="explorer-detail-link"
                    href={localizedPath(locale, `${explorerDetailHref(item.public_id)}${search ? `?${search}` : ""}`)}
                    aria-label={t("benchmark.Open the full result for {model} on {hardware}", identity)}
                  >
                    {summary.model_label}
                  </Link>
                  <FactList className="explorer-model-facts" facts={modelFacts} />
                  <span className="explorer-identity-hardware">{summary.hardware_label}</span>
                  <FactList className="explorer-environment-facts" facts={environmentFacts(summary.setup, t)} />
                </div>
              </th>
              <ExplorerCell label={t("benchmark.Method & workload")} className="explorer-cell-setup">
                <span className="explorer-setup-method">{summary.method_label}</span>
                <span className="explorer-setup-workload">{summary.workload_label}</span>
                <span className="explorer-result-meta">{t("benchmark.Input context: {value}", { value: formatPromptLengths(summary.prompt_lengths) ?? t("benchmark.Unknown") })}</span>
                <span className="explorer-measurement-meta">
                  <span>{t("benchmark.Measurement count: {value}", { value: formatSampleCount(summary.row_count, summary.failed_rows, t) })}</span>
                  <span className={`explorer-status explorer-status-${summary.status}`}>{summary.status}</span>
                </span>
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Prompt processing (tok/s)")} className="explorer-cell-numeric">
                {formatThroughput(summary.mean_pp_tps)}
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Generation (tok/s)")} className="explorer-cell-numeric">
                {formatThroughput(summary.mean_tg_tps)}
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Duration (ms)")} className="explorer-cell-numeric">
                {formatDuration(summary.mean_e2e_ms)}
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Published")} className="explorer-cell-published">
                <time dateTime={item.created_at}>{formatPublishedDate(item.created_at)}</time>
              </ExplorerCell>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

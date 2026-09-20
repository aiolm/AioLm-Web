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
import { formatDuration, formatPublishedDate, formatSampleCount, formatThroughput } from "./benchmark-explorer-format";

/**
 * Published results as one native table. Setup fields are paired into a single
 * column each, so the desktop table stays scannable while every cell keeps a
 * label element that lets the same markup stack into readable rows on a phone.
 */

interface ExplorerCellProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

function ExplorerCell({ label, className, children }: ExplorerCellProps): React.JSX.Element {
  return (
    <td className={className ? `explorer-cell ${className}` : "explorer-cell"}>
      <span className="explorer-cell-label" aria-hidden="true">{label}</span>
      <span className="explorer-cell-value">{children}</span>
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
      <caption className="explorer-table-caption">{t("benchmark.Published results, newest first. Each row is one self-reported measurement of one configuration; rows are not ranked against each other.")}</caption>
      <thead className="explorer-table-head">
        <tr className="explorer-head-row">
          <th scope="col" className="explorer-head-cell explorer-head-compare">{t("benchmark.Compare")}</th>
          <th scope="col" className="explorer-head-cell explorer-head-identity">{t("benchmark.Model & hardware")}</th>
          <th scope="col" className="explorer-head-cell explorer-head-setup">{t("benchmark.Method & workload")}</th>
          <th scope="col" className="explorer-head-cell explorer-head-samples">{t("benchmark.Samples")}</th>
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
                <span className="explorer-cell-value">
                  <Link
                    className="explorer-detail-link"
                    href={localizedPath(locale, `${explorerDetailHref(item.public_id)}${search ? `?${search}` : ""}`)}
                    aria-label={t("benchmark.Open the full result for {model} on {hardware}", identity)}
                  >
                    {summary.model_label}
                  </Link>
                  <span className="explorer-identity-hardware">{summary.hardware_label}</span>
                </span>
              </th>
              <ExplorerCell label={t("benchmark.Method & workload")} className="explorer-cell-setup">
                <span className="explorer-setup-method">{summary.method_label}</span>
                <span className="explorer-setup-workload">{summary.workload_label}</span>
              </ExplorerCell>
              <ExplorerCell label={t("benchmark.Samples")} className="explorer-cell-samples">
                <span className="explorer-sample-count">
                  {formatSampleCount(summary.row_count, summary.failed_rows, t)}
                </span>
                <span className={`explorer-status explorer-status-${summary.status}`}>{summary.status}</span>
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

"use client";

import Link from "next/link";
import {
  EXPLORER_COMPARE_LIMIT,
  comparisonCompatibility,
  explorerDetailHref,
  type ExplorerItem,
} from "./benchmark-explorer-state";
import { formatDuration, formatPublishedDate, formatSampleCount, formatThroughput } from "./benchmark-explorer-format";

/**
 * Side-by-side view of results the reader picked by hand. It transposes the
 * summary so each field reads across the selected columns, and it states plainly
 * when the selected runs used different methods or workloads.
 */

interface ComparisonField {
  key: string;
  label: string;
  render: (item: ExplorerItem) => React.ReactNode;
}

const COMPARISON_FIELDS: ComparisonField[] = [
  { key: "hardware", label: "Hardware", render: (item) => item.summary.hardware_label },
  { key: "method", label: "Method", render: (item) => item.summary.method_label },
  { key: "workload", label: "Workload", render: (item) => item.summary.workload_label },
  {
    key: "samples",
    label: "Samples",
    render: (item) => formatSampleCount(item.summary.row_count, item.summary.failed_rows),
  },
  { key: "status", label: "Status", render: (item) => item.summary.status },
  { key: "throughput", label: "Throughput (tok/s)", render: (item) => formatThroughput(item.summary.mean_tg_tps) },
  { key: "duration", label: "Duration (ms)", render: (item) => formatDuration(item.summary.mean_e2e_ms) },
  {
    key: "published",
    label: "Published",
    render: (item) => <time dateTime={item.created_at}>{formatPublishedDate(item.created_at)}</time>,
  },
  {
    key: "detail",
    label: "Detail",
    render: (item) => (
      <Link
        className="explorer-detail-link"
        href={explorerDetailHref(item.public_id)}
        aria-label={`Open the full result for ${item.summary.model_label} on ${item.summary.hardware_label}`}
      >
        Open result
      </Link>
    ),
  },
];

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
  if (items.length === 0) return null;
  const compatibility = comparisonCompatibility(items);
  return (
    <section className="explorer-comparison" aria-labelledby="explorer-comparison-title">
      <div className="explorer-comparison-header">
        <h3 id="explorer-comparison-title" className="explorer-comparison-title">Selected results</h3>
        <button type="button" className="explorer-button explorer-comparison-clear" onClick={onClear}>
          Clear selection
        </button>
      </div>
      <p className="explorer-comparison-note">
        {items.length} of {EXPLORER_COMPARE_LIMIT} results selected. These are the results you picked; the site
        publishes self-reported measurements and does not rank them. Only summary fields appear here, so open a
        result to check its full environment before drawing a conclusion.
      </p>
      {compatibility.comparable ? null : (
        <p className="explorer-comparison-caveat">
          <strong>Not directly comparable.</strong> The selected results do not share one method and workload
          (methods: {compatibility.methods.join(", ")}; workloads: {compatibility.workloads.join(", ")}), so their
          numbers describe different work. Read each column on its own terms.
        </p>
      )}
      <div
        className="explorer-comparison-scroll"
        role="region"
        aria-label="Selected results comparison table"
        tabIndex={0}
      >
        <table className="explorer-comparison-table" style={{ minWidth: `${10 + items.length * 12}rem` }}>
          <caption className="explorer-comparison-caption">
            Summary fields for the selected results, one column per result.
          </caption>
          <thead className="explorer-comparison-head">
            <tr className="explorer-comparison-head-row">
              <th scope="col" className="explorer-comparison-field-head">Field</th>
              {items.map((item) => (
                <th scope="col" key={item.public_id} className="explorer-comparison-item-head">
                  <span className="explorer-comparison-item-title">{item.summary.model_label}</span>
                  <button
                    type="button"
                    className="explorer-comparison-remove"
                    onClick={() => onRemove(item)}
                    aria-label={`Remove ${item.summary.model_label} on ${item.summary.hardware_label} from the comparison`}
                  >
                    Remove
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="explorer-comparison-body">
            {COMPARISON_FIELDS.map((field) => (
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

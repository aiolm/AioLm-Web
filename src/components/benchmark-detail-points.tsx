"use client";
import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { ColumnHeading } from "./benchmark-i18n";
import { SERVING_METRIC_KEYS, type ServingBenchmarkPoint } from "@aiolm/benchmark-contracts";
import { servingMetricColumns } from "./benchmark-detail-rows";
import { servingMetricAbsence } from "./benchmark-evidence";
import { formatServingPointLabel } from "./benchmark-explorer-format";

/**
 * What this result measured, point by point.
 *
 * A run sweeps input sizes against concurrencies, and speed moves with both, so
 * the reader picks one operating point and the table shows the whole sweep.
 * Each value is the median of that point's repetitions with the range they
 * covered, so a point measured once and a point whose repetitions disagreed
 * cannot look alike.
 */

function MeasuredCell({ value, spread }: { value: string; spread: string | null }): React.JSX.Element {
  return (
    <td className="detail-num">
      <span className="detail-point-value">{value}</span>
      {spread === null ? null : <span className="detail-point-spread">{spread}</span>}
    </td>
  );
}

/** The eight shared serving metrics, with metric-specific sample counts, at each byte operating point. */
export function ServingBenchmarkPointsPanel({ points, memoryScope, requestUsage }: {
  points: readonly ServingBenchmarkPoint[];
  memoryScope: unknown;
  requestUsage?: unknown;
}): React.JSX.Element {
  const { t } = useI18n();
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (points.length === 0) return <p className="muted detail-points-empty">{t("benchmark.This result published no measurement that names an operating point, so there is no speed to report.")}</p>;
  const selected = points[Math.min(selectedIndex, points.length - 1)]!;
  const columns = servingMetricColumns(t);
  const spread = (point: ServingBenchmarkPoint, index: number): string | null => {
    const stat = point[SERVING_METRIC_KEYS[index]!];
    const format = columns[index]!.format;
    return stat ? t("benchmark.{range} · n={samples}", { range: `${format(stat.min)}–${format(stat.max)}`, samples: stat.samples }) : null;
  };
  return <div className="detail-points">
    <fieldset className="detail-chip-set">
      <legend className="detail-chip-legend">{t("benchmark.Measured operating points")}</legend>
      <div className="detail-chip-row">{points.map((point, index) => <button type="button" className={point === selected ? "detail-chip detail-chip-on" : "detail-chip"} aria-pressed={point === selected} key={`${point.input_bytes}/${point.concurrency}/${point.max_output_tokens}`} onClick={() => setSelectedIndex(index)}>{formatServingPointLabel(point.input_bytes, point.concurrency, point.max_output_tokens)}</button>)}</div>
    </fieldset>
    <p className="muted detail-point-reading" role="status">{t("benchmark.Reading {point} over {samples} repetitions; output tokens are a requested maximum.", { point: formatServingPointLabel(selected.input_bytes, selected.concurrency, selected.max_output_tokens), samples: selected.samples })}</p>
    <p className="muted">{t("benchmark.servingMetricsNote")}</p>
    <p className="muted">{t("benchmark.Memory scope")}: {memoryScope === "owned_process_tree" ? t("benchmark.Owned process tree") : memoryScope === "owned_root_process" ? t("benchmark.Owned root process") : memoryScope === "unavailable" ? t("benchmark.Unavailable for this process scope") : t("benchmark.Value not recorded")}{typeof memoryScope === "string" ? ` (${memoryScope})` : ""}.</p>
    <div className="detail-performance-grid">
      {columns.map((column, index) => {
        const key = SERVING_METRIC_KEYS[index]!;
        const stat = selected[key];
        return <div className="detail-metric-card" key={key}>
          <span className="detail-metric-label">{column.label}</span>
          <strong className="detail-metric-value">{column.format(stat?.median)}{stat && column.unit ? <small> {column.unit}</small> : null}</strong>
          <span className="detail-metric-spread">{spread(selected, index) ?? servingMetricAbsence(key, { requestUsage, memoryScope }, t)}</span>
        </div>;
      })}
    </div>
    <div className="detail-points-scroll" tabIndex={0} role="region" aria-label={t("benchmark.Measured operating points")}>
      <table className="data detail-points-table">
        <caption className="detail-points-caption">{t("benchmark.Every operating point this result measured. Each value is the median of that point's repetitions, with the range they covered below it.")}</caption>
        <thead><tr>
          <th scope="col">{t("benchmark.Input UTF-8 bytes")}</th><th scope="col">{t("benchmark.Concurrency")}</th><th scope="col">{t("benchmark.Maximum output token request")}</th><th scope="col">{t("benchmark.Repetitions")}</th>
          {columns.map((column) => <th scope="col" key={column.key}><ColumnHeading label={column.label} unit={column.unit} /></th>)}
        </tr></thead>
        <tbody>{points.map((point, pointIndex) => <tr key={`${point.input_bytes}/${point.concurrency}/${point.max_output_tokens}`} className={point === selected ? "detail-point-row detail-point-row-on" : "detail-point-row"}>
          <th scope="row"><button type="button" className="detail-point-select" aria-pressed={point === selected} onClick={() => setSelectedIndex(pointIndex)}>{point.input_bytes} B</button></th><td>{point.concurrency}</td><td>{point.max_output_tokens}</td><td>{point.samples}</td>
          {columns.map((column, index) => {
            const key = SERVING_METRIC_KEYS[index]!;
            return <MeasuredCell key={key} value={point[key] ? column.format(point[key]?.median) : servingMetricAbsence(key, { requestUsage, memoryScope }, t)} spread={spread(point, index)} />;
          })}
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

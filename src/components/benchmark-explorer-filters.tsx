"use client";
import { type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { EditableCombobox } from "./editable-combobox";
import { EXPLORER_FILTER_LABELS, EXPLORER_FILTER_PLACEHOLDERS, EXPLORER_RANGE_LABELS, buildExplorerOptionsPath, invalidExplorerRanges, type ExplorerFilters, type ExplorerFilterKey, type EXPLORER_TEXT_KEYS, type EXPLORER_RANGES } from "./benchmark-explorer-state";
type TextKey = typeof EXPLORER_TEXT_KEYS[number];
type Range = typeof EXPLORER_RANGES[number];
export function BenchmarkExplorerFilters({ draft, onChange, actions, pending }: { draft: ExplorerFilters; onChange: (key: ExplorerFilterKey, value: string) => void; actions?: ReactNode; pending?: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const invalid = invalidExplorerRanges(draft);
  const advancedCount = Object.entries(draft).filter(([key, value]) => !["q", "vendor", "gpu", "sort"].includes(key) && value !== "").length;
  const textField = (key: TextKey) => <EditableCombobox key={key} name={key} label={t(`benchmark.${EXPLORER_FILTER_LABELS[key]}`)} value={draft[key]}
    placeholder={t(key === "vendor" ? "benchmark.All vendors" : key === "gpu" ? "benchmark.All GPUs" : `benchmark.${EXPLORER_FILTER_PLACEHOLDERS[key as keyof typeof EXPLORER_FILTER_PLACEHOLDERS] ?? "Type any value"}`)}
    optionsUrl={buildExplorerOptionsPath(key, draft[key], draft)} onChange={value => onChange(key, value)}
    messages={{ toggle: t("benchmark.Toggle suggestions for {field}", { field: t(`benchmark.${EXPLORER_FILTER_LABELS[key]}`) }), loading: t("benchmark.Loading suggestions…"), empty: t("benchmark.No suggestions. Your text can still be applied."), error: t("benchmark.Suggestions unavailable. Type any value."), more: t("benchmark.Type to find more values.") }} />;
  const rangeField = (range: Range) => <fieldset className="explorer-range" key={range}>
    <legend>{t(`benchmark.${EXPLORER_RANGE_LABELS[range]}`)}</legend>
    <div className="explorer-range-inputs">{(["min", "max"] as const).map(bound => {
      const key = `${range}_${bound}` as const;
      return <div className="explorer-field" key={key}><label htmlFor={`filter-${key}`}>{t(bound === "min" ? "benchmark.Minimum" : "benchmark.Maximum")}</label>
        <input id={`filter-${key}`} name={key} className="explorer-field-input" type="text" inputMode={range === "gpu_layers" ? "text" : "numeric"} value={draft[key]}
          aria-invalid={invalid.includes(range)} aria-describedby={invalid.includes(range) ? `error-${range}` : undefined}
          onChange={event => onChange(key, event.target.value)} /></div>;
    })}</div>
    {invalid.includes(range) ? <p id={`error-${range}`} className="explorer-validation" role="alert">{t("benchmark.Use whole numbers with minimum ≤ maximum.")}</p> : null}
  </fieldset>;
  return <>
    <div className="explorer-search-row">
      <div className="explorer-field"><label className="explorer-field-label" htmlFor="explorer-search">{t("benchmark.Search all results")}</label>
        <input id="explorer-search" name="q" type="search" className="explorer-field-input" maxLength={120} placeholder={t("benchmark.Search models, hardware, runtime…")} value={draft.q} onChange={event => onChange("q", event.target.value)} /></div>
      <div className="explorer-search-actions">{actions}</div>
    </div>
    <div className="explorer-quick-filters">{(["vendor", "gpu"] as const).map(textField)}</div>
    <div className="explorer-draft-status" role="status">{pending ? t("benchmark.Changes not applied. Apply filters to update results.") : null}</div>
    <details className="explorer-more-filters">
      <summary>{t("benchmark.More filters")}{advancedCount > 0 ? <span className="explorer-filter-count">{advancedCount}</span> : null}</summary>
      <div className="explorer-advanced-groups">
        <fieldset className="explorer-advanced-group"><legend>{t("benchmark.Hardware and specifications")}</legend><div className="explorer-group-fields">{(["model", "hardware", "cpu"] as const).map(textField)}{(["vram", "cores"] as const).map(rangeField)}</div></fieldset>
        <fieldset className="explorer-advanced-group"><legend>{t("benchmark.OS and runtime")}</legend><div className="explorer-group-fields">{(["os", "arch", "runtime", "backend"] as const).map(textField)}</div></fieldset>
        <fieldset className="explorer-advanced-group"><legend>{t("benchmark.Execution and workload")}</legend><div className="explorer-group-fields">{(["context", "parallel", "threads", "gpu_layers"] as const).map(rangeField)}{(["mode", "method", "workload", "flash_attention", "cache_type_k", "cache_type_v", "split_mode"] as const).map(textField)}</div></fieldset>
      </div>
      <div className="explorer-advanced-actions">{actions}</div>
    </details>
    {invalid.length ? <p className="explorer-validation" role="alert">{t("benchmark.Check numeric ranges before applying filters.")} {invalid.map(range => t(`benchmark.${EXPLORER_RANGE_LABELS[range as Range]}`)).join(", ")}</p> : null}
  </>;
}

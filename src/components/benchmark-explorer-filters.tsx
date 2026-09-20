"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { EditableCombobox } from "./editable-combobox";
import { EXPLORER_FILTER_LABELS, EXPLORER_FILTER_PLACEHOLDERS, EXPLORER_RANGE_LABELS, EXPLORER_SORTS, buildExplorerOptionsPath, invalidExplorerRanges, type ExplorerFilters, type ExplorerFilterKey, type EXPLORER_TEXT_KEYS, type EXPLORER_RANGES } from "./benchmark-explorer-state";
type TextKey = typeof EXPLORER_TEXT_KEYS[number];
type Range = typeof EXPLORER_RANGES[number];
/** Deep links reveal their group; clearing its last field preserves editing focus. */
function FilterGroup({ active, title, children }: { active: boolean; title: string; children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(active);
  const [previousActive, setPreviousActive] = useState(active);
  if (previousActive !== active) {
    setPreviousActive(active);
    if (active) setOpen(true);
  }
  return <details className="explorer-filter-group" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary><div className="explorer-group-fields">{children}</div>
  </details>;
}
export function BenchmarkExplorerFilters({ draft, onChange }: { draft: ExplorerFilters; onChange: (key: ExplorerFilterKey, value: string) => void }): React.JSX.Element {
  const { t } = useI18n();
  const invalid = invalidExplorerRanges(draft);
  const groupActive = (keys: ExplorerFilterKey[]) => keys.some(key => draft[key] !== "");
  const textField = (key: TextKey) => <EditableCombobox key={key} name={key} label={t(`benchmark.${EXPLORER_FILTER_LABELS[key]}`)} value={draft[key]}
    placeholder={t(`benchmark.${EXPLORER_FILTER_PLACEHOLDERS[key as keyof typeof EXPLORER_FILTER_PLACEHOLDERS] ?? "Type any value"}`)}
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
      <div className="explorer-field"><label className="explorer-field-label" htmlFor="explorer-sort">{t("benchmark.Sort")}</label>
        <select id="explorer-sort" name="sort" className="explorer-field-input" value={draft.sort || "newest"} onChange={event => onChange("sort", event.target.value === "newest" ? "" : event.target.value)}>
          {Object.entries(EXPLORER_SORTS).map(([value, label]) => <option value={value} key={value}>{t(`benchmark.${label}`)}</option>)}
        </select></div>
    </div>
    <div className="explorer-quick-filters">{(["vendor", "gpu", "os"] as const).map(textField)}</div>
    <div className="explorer-filter-groups">
      <FilterGroup active={groupActive(["model", "hardware", "cpu", "vram_min", "vram_max", "cores_min", "cores_max"])} title={t("benchmark.Hardware and specifications")}>{(["model", "hardware", "cpu"] as const).map(textField)}{(["vram", "cores"] as const).map(rangeField)}</FilterGroup>
      <FilterGroup active={groupActive(["arch", "runtime", "backend"])} title={t("benchmark.OS and runtime")}>{(["arch", "runtime", "backend"] as const).map(textField)}</FilterGroup>
      <FilterGroup active={groupActive(["context_min", "context_max", "parallel_min", "parallel_max", "threads_min", "threads_max", "gpu_layers_min", "gpu_layers_max", "mode", "method", "workload", "flash_attention", "cache_type_k", "cache_type_v", "split_mode"])} title={t("benchmark.Execution and workload")}>{(["context", "parallel", "threads", "gpu_layers"] as const).map(rangeField)}{(["mode", "method", "workload", "flash_attention", "cache_type_k", "cache_type_v", "split_mode"] as const).map(textField)}</FilterGroup>
    </div>
    {invalid.length ? <p className="explorer-validation" role="alert">{t("benchmark.Check numeric ranges before applying filters.")} {invalid.map(range => t(`benchmark.${EXPLORER_RANGE_LABELS[range as Range]}`)).join(", ")}</p> : null}
  </>;
}

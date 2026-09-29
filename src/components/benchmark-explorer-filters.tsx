"use client";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { EditableCombobox } from "./editable-combobox";
import { EXPLORER_BASIS_KEYS, EXPLORER_FILTER_LABELS, EXPLORER_FILTER_PLACEHOLDERS, EXPLORER_RANGE_HINTS, EXPLORER_RANGE_LABELS, buildExplorerOptionsPath, invalidExplorerRanges, type ExplorerFilters, type ExplorerFilterKey, type EXPLORER_TEXT_KEYS, type EXPLORER_RANGES } from "./benchmark-explorer-state";
type TextKey = typeof EXPLORER_TEXT_KEYS[number];
type Range = typeof EXPLORER_RANGES[number];
/** Result controls and legacy link filters must survive a form submit. */
const CARRIED_KEYS = [...EXPLORER_BASIS_KEYS, "point_only", "hardware", "q", "model"] as const;
/** Common conditions stay visible; only advanced conditions are disclosures. */
function FilterGroup({ label, count, children }: { label: string; count: number; children: ReactNode }): React.JSX.Element {
  return <section className="explorer-filter-group" aria-label={label}>
    <h3 className="explorer-filter-group-title">{label}{count > 0 ? <span className="explorer-filter-count">{count}</span> : null}</h3>
    <div className="explorer-group-fields">{children}</div>
  </section>;
}
/** Remember manual disclosure choices while revealing newly restored conditions. */
function FilterSection({ label, count, children, invalid = false }: {
  label: string; count: number; children: ReactNode; invalid?: boolean;
}): React.JSX.Element {
  const { t } = useI18n();
  const [open, setOpen] = useState(count > 0);
  const [previousCount, setPreviousCount] = useState(count);
  if (previousCount !== count) {
    setPreviousCount(count);
    if (count > previousCount) setOpen(true);
  }
  return <details className="explorer-secondary-filters"
    open={open || invalid} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>{label}</span>{count > 0 ? <span className="explorer-filter-count">{t("benchmark.{count} selected", { count })}</span> : null}</summary>
    <div className="explorer-group-fields">{children}</div>
  </details>;
}
export function BenchmarkExplorerFilters({ draft, onChange, actions }: { draft: ExplorerFilters; onChange: (key: ExplorerFilterKey, value: string) => void; actions?: ReactNode }): React.JSX.Element {
  const { t } = useI18n();
  const invalid = invalidExplorerRanges(draft);
  // A minimum/maximum pair is one condition, including when both bounds are set.
  const count = (...keys: (TextKey | Range)[]) => keys.filter(key => key in draft
    ? draft[key as TextKey] !== ""
    : draft[`${key as Range}_min`] !== "" || draft[`${key as Range}_max`] !== "").length;
  const textField = (key: TextKey) => <EditableCombobox key={key} name={key} label={t(key === "model_query" ? "benchmark.Find a model" : `benchmark.${EXPLORER_FILTER_LABELS[key]}`)} value={draft[key]}
    hint={key === "model_query" ? t("benchmark.Search model names, repositories, files or SHA-256 hashes.") : undefined}
    placeholder={t(key === "vendor" ? "benchmark.All vendors" : key === "gpu" ? "benchmark.All GPUs" : `benchmark.${EXPLORER_FILTER_PLACEHOLDERS[key as keyof typeof EXPLORER_FILTER_PLACEHOLDERS] ?? "Type any value"}`)}
    optionsUrl={buildExplorerOptionsPath(key, draft[key], draft)} onChange={value => onChange(key, value)}
    messages={{ toggle: t("benchmark.Toggle suggestions for {field}", { field: t(`benchmark.${EXPLORER_FILTER_LABELS[key]}`) }), loading: t("benchmark.Loading suggestions…"), empty: t("benchmark.No suggestions. Your text can still be applied."), error: t("benchmark.Suggestions unavailable. Type any value."), more: t("benchmark.Type to find more values.") }} />;
  const rangeField = (range: Range) => <fieldset className="explorer-range" key={range}>
    <legend>{t(`benchmark.${EXPLORER_RANGE_LABELS[range]}`)}</legend>
    <div className="explorer-range-inputs">{(["min", "max"] as const).map(bound => {
      const key = `${range}_${bound}` as const;
      const boundLabel = t(bound === "min" ? "benchmark.Minimum" : "benchmark.Maximum");
      return <div className="explorer-field" key={key}>
        <label className="sr-only" htmlFor={`filter-${key}`}>{boundLabel}</label>
        <input id={`filter-${key}`} name={key} className="explorer-field-input" type="text"
          placeholder={boundLabel} inputMode={range === "gpu_layers" ? "text" : "numeric"} value={draft[key]}
          aria-invalid={invalid.includes(range)} aria-describedby={invalid.includes(range) ? `error-${range}` : undefined}
          onChange={event => onChange(key, event.target.value)} />
      </div>;
    })}</div>
    {range in EXPLORER_RANGE_HINTS ? <p className="explorer-range-hint">{t(`benchmark.${EXPLORER_RANGE_HINTS[range as keyof typeof EXPLORER_RANGE_HINTS]}`)}</p> : null}
    {invalid.includes(range) ? <p id={`error-${range}`} className="explorer-validation" role="alert">{t("benchmark.Use whole numbers with minimum ≤ maximum.")}</p> : null}
  </fieldset>;
  return <>
    <div className="explorer-sidebar-groups">
      <FilterGroup label={t("benchmark.Model")} count={count("model_query", "quantization", "publisher", "base_model")}>
        {textField("model_query")}{textField("quantization")}
        <FilterSection label={t("benchmark.More options")} count={count("publisher", "base_model")}>
          {(["base_model", "publisher"] as const).map(textField)}
        </FilterSection>
      </FilterGroup>
      <FilterGroup label={t("benchmark.Hardware")} count={count("vendor", "gpu", "vram", "cpu", "cores")}>
        {(["vendor", "gpu"] as const).map(textField)}{rangeField("vram")}
        <FilterSection label={t("benchmark.More options")} count={count("cpu", "cores")} invalid={invalid.includes("cores")}>
          {textField("cpu")}{rangeField("cores")}
        </FilterSection>
      </FilterGroup>
      <FilterGroup label={t("benchmark.Execution environment")} count={count("os", "arch", "runtime", "backend")}>
        {textField("os")}
        <FilterSection label={t("benchmark.More options")} count={count("arch", "runtime", "backend")}>
          {(["runtime", "backend", "arch"] as const).map(textField)}
        </FilterSection>
      </FilterGroup>
      <FilterSection label={t("benchmark.Measurement settings")}
        count={count("context", "parallel", "threads", "gpu_layers", "mode", "method", "workload", "flash_attention", "cache_type_k", "cache_type_v", "split_mode")}
        invalid={invalid.some(range => range !== "vram" && range !== "cores")}>
        {(["context", "parallel", "threads", "gpu_layers"] as const).map(rangeField)}
        {(["mode", "method", "workload", "flash_attention", "cache_type_k", "cache_type_v", "split_mode"] as const).map(textField)}
      </FilterSection>
    </div>
    {/* Legacy conditions keep their original scope on native GET submits too.
        They have no duplicate input; each is visible as a removable active chip. */}
    {CARRIED_KEYS.map(key => <input type="hidden" key={key} name={key} value={draft[key]} />)}
    <div className="explorer-sidebar-actions">{actions}</div>
    {invalid.length ? <p className="explorer-validation" role="alert">{t("benchmark.Check numeric ranges before applying filters.")} {invalid.map(range => t(`benchmark.${EXPLORER_RANGE_LABELS[range as Range]}`)).join(", ")}</p> : null}
  </>;
}

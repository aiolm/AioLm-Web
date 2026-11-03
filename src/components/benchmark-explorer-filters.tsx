"use client";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { FILTER_DEFINITIONS, type TextFilterKey, type RangeFilterKey } from "@/lib/benchmark-discovery";
import { EditableCombobox } from "./editable-combobox";
import { BenchmarkWeightBitsFilter } from "./benchmark-weight-bits-filter";
import { BenchmarkSettingEditor } from "./benchmark-setting-editor";
import "./ui-controls.css";
import { EXPLORER_BASIS_KEYS, EXPLORER_FILTER_MAX_LENGTH, explorerOptionsRequestError, buildExplorerOptionsPath, invalidExplorerRanges, invalidExplorerDraft, type ExplorerFilters, type ExplorerFilterKey } from "./benchmark-explorer-state";

export function BenchmarkExplorerFilters({ draft, onChange, onSettingsChange, actions }: { draft: ExplorerFilters; onChange: (key: ExplorerFilterKey, value: string) => void; onSettingsChange: (value: string[]) => void; actions?: ReactNode }): React.JSX.Element {
  const { t } = useI18n();
  const invalid = invalidExplorerRanges(draft);
  const legacy = draft.measurement === "legacy";
  const definitions = Object.entries(FILTER_DEFINITIONS).filter(([key, definition]) => key !== "q" && (definition.scope === "all" || definition.scope === (legacy ? "legacy" : "serving")
    || (definition.kind === "range" ? draft[`${key as RangeFilterKey}_min`] || draft[`${key as RangeFilterKey}_max`] : draft[key as ExplorerFilterKey])));
  const textField = (key: TextFilterKey, label: string) => {
    const optionsPath = buildExplorerOptionsPath(key, key === "weight_bits" ? "" : draft[key], draft);
    const requestError = explorerOptionsRequestError(optionsPath);
    return key === "weight_bits"
    ? <BenchmarkWeightBitsFilter key={key} value={draft.weight_bits} optionsPath={optionsPath} onChange={value => onChange("weight_bits", value)} />
    : <EditableCombobox key={key} name={key} label={t(`benchmark.${label}`)} value={draft[key]}
      hint={key === "model_query" ? t("benchmark.Search model names, repositories, files or SHA-256 hashes.") : undefined}
      placeholder={t("benchmark.Type any value")} optionsUrl={optionsPath} requestError={requestError ? t(`benchmark.${requestError}`) : undefined} onChange={value => onChange(key, value)}
      messages={{ toggle: t("benchmark.Toggle suggestions for {field}", { field: t(`benchmark.${label}`) }), loading: t("benchmark.Loading suggestions…"), empty: t("benchmark.No suggestions. Your text can still be applied."), error: t("benchmark.Suggestions unavailable. Type any value."), more: t("benchmark.Type to find more values.") }} />;
  };
  const rangeField = (range: RangeFilterKey, label: string) => <fieldset className="explorer-range" key={range}>
    <legend>{t(`benchmark.${label}`)}</legend>
    <div className="explorer-range-inputs">{(["min", "max"] as const).map(bound => {
      const key = `${range}_${bound}` as const;
      const boundLabel = t(bound === "min" ? "benchmark.Minimum" : "benchmark.Maximum");
      return <label className="explorer-field" key={key}><span className="sr-only">{boundLabel}</span>
        <input name={key} className="explorer-field-input" type="text" placeholder={boundLabel} inputMode={range === "gpu_layers" ? "text" : "numeric"} value={draft[key]} aria-invalid={invalid.includes(range)} aria-describedby={invalid.includes(range) ? `error-${range}` : range === "input_bytes" ? "hint-input-bytes" : undefined} onChange={event => onChange(key, event.target.value)} />
      </label>;
    })}</div>
    {range === "input_bytes" ? <p id="hint-input-bytes" className="explorer-range-hint">{t("benchmark.Matches the largest configured UTF-8 input, including points not completed.")}</p> : null}
    {invalid.includes(range) ? <p id={`error-${range}`} className="explorer-validation" role="alert">{t("benchmark.Use whole numbers with minimum ≤ maximum.")}</p> : null}
  </fieldset>;
  return <>
    <div className="explorer-filter-groups">
      {([ ["model", "Model"], ["engine", "Inference engine"], ["hardware", "Hardware"], ["measurement", "Measurement"] ] as const).map(([group, label]) => <section key={group} className="explorer-filter-group" aria-label={t(`benchmark.${label}`)}>
        <h3 className="explorer-filter-group-title">{t(`benchmark.${label}`)}</h3>
        <div className="explorer-group-fields">
          {group === "measurement" ? <label className="explorer-field"><span className="explorer-field-label">{t("benchmark.Measurement scope")}</span><select className="explorer-field-input" name="measurement" value={draft.measurement || "openai-chat-serving@1"} onChange={event => onChange("measurement", event.target.value)}><option value="openai-chat-serving@1">{t("benchmark.Common API · UTF-8 bytes")}</option><option value="legacy">{t("benchmark.Legacy · tokens")}</option></select></label> : null}
          {definitions.filter(([, definition]) => definition.group === group).map(([key, definition]) => definition.kind === "text" ? textField(key as TextFilterKey, definition.label) : definition.kind === "range" ? rangeField(key as RangeFilterKey, definition.label)
            : <label className="explorer-field" key={key}><span className="explorer-field-label">{t(`benchmark.${definition.label}`)}</span><select name={key} className="explorer-field-input" value={draft[key as ExplorerFilterKey]} onChange={event => onChange(key as ExplorerFilterKey, event.target.value)}><option value="">{t("benchmark.Any")}</option><option value="1">{t("benchmark.Yes")}</option><option value="0">{t("benchmark.No")}</option></select></label>)}
        </div>
      </section>)}
      {!legacy || draft.setting.length > 0 ? <details className="explorer-secondary-filters explorer-execution-filters"><summary>{t("benchmark.Execution options")}{draft.setting.length > 0 ? <span className="explorer-filter-count">{draft.setting.length}</span> : null}</summary><BenchmarkSettingEditor filters={draft} onChange={onSettingsChange} /></details> : null}
    </div>
    {EXPLORER_BASIS_KEYS.map(key => <input type="hidden" key={key} name={key} value={draft[key]} />)}
    <input type="hidden" name="point_only" value={draft.point_only} />
    {draft.setting.map((condition, index) => <input type="hidden" name="setting" key={index} value={condition} />)}
    <div className="explorer-filter-panel-actions">{actions}</div>
    {invalidExplorerDraft(draft) && Array.from(draft.q.trim()).length <= EXPLORER_FILTER_MAX_LENGTH ? <p className="explorer-validation" role="alert">{t("benchmark.Check conditions before applying. Byte and legacy token conditions cannot be mixed.")}</p> : null}
  </>;
}

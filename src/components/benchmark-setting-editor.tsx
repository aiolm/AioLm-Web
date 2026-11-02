"use client";
import { useId } from "react";
import { useI18n } from "@/i18n/client";
import { SETTING_UNITS, SETTING_ROLES, SETTING_MAX_CONDITIONS, canonicalSettingCondition, canonicalSettingDescriptor, parseSettingCondition, parseSettingDescriptor, type SettingDescriptor, type SettingCondition, type BenchmarkOptions } from "@/lib/benchmark-discovery";
import { explorerOptionsRequestError, buildExplorerSettingOptionsPath, type ExplorerFilters } from "./benchmark-explorer-state";
import { useJsonFetch } from "./ui";
import { recordedSettingLabel } from "./benchmark-evidence";

type ValueType = "string" | "number" | "boolean" | "array";
interface SettingDraft { target: string; scope: string; name: string; unit: string; role: string; op: string; valueType: ValueType; text: string; min: string; max: string }
const EMPTY_DRAFT: SettingDraft = { target: "launch", scope: "", name: "", unit: "", role: "", op: "eq", valueType: "number", text: "", min: "", max: "" };
function readDraft(raw: string): SettingDraft {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?._draft && typeof parsed._draft === "object" &&
      Object.keys(EMPTY_DRAFT).every(key => typeof parsed._draft[key] === "string") &&
      ["string", "number", "boolean", "array"].includes(parsed._draft.valueType)) return parsed._draft;
    const condition = parseSettingCondition(parsed);
    const value = condition.op === "eq" ? condition.value : undefined;
    return { target: condition.target, scope: condition.scope.join(", "), name: condition.name, unit: condition.unit ?? "", role: condition.role ?? "", op: condition.op,
      valueType: Array.isArray(value) ? "array" : typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string",
      text: Array.isArray(value) ? value.join(", ") : value === undefined ? "" : String(value), min: condition.op === "range" && condition.min !== undefined ? String(condition.min) : "", max: condition.op === "range" && condition.max !== undefined ? String(condition.max) : "" };
  } catch { return { ...EMPTY_DRAFT }; }
}
function descriptorOf(draft: SettingDraft): SettingDescriptor {
  return parseSettingDescriptor({ target: draft.target, scope: draft.scope.trim() ? draft.scope.split(",").map(value => value.trim()) : [], name: draft.name, unit: draft.unit || null, role: draft.role || null });
}
function finiteNumber(text: string): number {
  if (!text.trim()) throw new Error("Missing number");
  const value: unknown = JSON.parse(text);
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid number");
  return value;
}
function conditionOf(draft: SettingDraft): SettingCondition {
  const descriptor = descriptorOf(draft);
  if (draft.op === "range") return parseSettingCondition({ ...descriptor, op: "range", ...(draft.min.trim() ? { min: finiteNumber(draft.min) } : {}), ...(draft.max.trim() ? { max: finiteNumber(draft.max) } : {}) });
  const value = draft.valueType === "number" ? finiteNumber(draft.text) : draft.valueType === "boolean" ? draft.text === "true" ? true : draft.text === "false" ? false : undefined
    : draft.valueType === "array" ? draft.text.trim() ? draft.text.split(",").map(finiteNumber) : [] : draft.text;
  return parseSettingCondition({ ...descriptor, op: "eq", value });
}
export function settingConditionLabel(raw: string): string {
  try {
    const condition = parseSettingCondition(raw);
    const identity = `${condition.target} / ${condition.scope.length ? condition.scope.join(" / ") + " / " : ""}${condition.name}${condition.unit ? ` (${condition.unit})` : ""}${condition.role ? ` · ${condition.role}` : ""}`;
    return condition.op === "eq" ? `${identity} = ${JSON.stringify(condition.value)}` : `${identity}: ${condition.min ?? "−∞"} … ${condition.max ?? "∞"}`;
  } catch { return ""; }
}
function suggestedSettingValue(raw: string, descriptor: SettingDescriptor) {
  const condition = parseSettingCondition({ ...descriptor, op: "eq", value: JSON.parse(raw) });
  if (condition.op !== "eq") throw new Error("Invalid setting value recommendation");
  return condition.value;
}
function SettingRow({ raw, index, filters, onChange, onRemove }: { raw: string; index: number; filters: ExplorerFilters; onChange: (value: string) => void; onRemove: () => void }): React.JSX.Element {
  const { t } = useI18n();
  const id = useId();
  const draft = readDraft(raw);
  let parsedDescriptor: SettingDescriptor | undefined;
  let valid = false;
  try { parsedDescriptor = descriptorOf(draft); conditionOf(draft); valid = true; } catch { /* Incomplete drafts stay editable, never applicable. */ }
  const descriptor = parsedDescriptor;
  const descriptorPath = buildExplorerSettingOptionsPath("setting", filters, index);
  const valuePath = descriptor ? buildExplorerSettingOptionsPath("setting_value", filters, index, descriptor) : null;
  const descriptorError = explorerOptionsRequestError(descriptorPath);
  const valueError = valuePath ? explorerOptionsRequestError(valuePath) : undefined;
  const descriptors = useJsonFetch<BenchmarkOptions>(descriptorError ? null : descriptorPath);
  const values = useJsonFetch<BenchmarkOptions>(valueError ? null : valuePath);
  const update = (patch: Partial<SettingDraft>) => {
    const next = { ...draft, ...patch };
    try { onChange(canonicalSettingCondition(conditionOf(next))); } catch { onChange(JSON.stringify({ _draft: next })); }
  };
  const field = (key: "name" | "scope" | "text" | "min" | "max", label: string) => <label className="explorer-field" key={key}>
    <span className="explorer-field-label">{t(`benchmark.${label}`)}</span>
    <input className="explorer-field-input" value={draft[key]} inputMode={key === "min" || key === "max" || (key === "text" && draft.valueType === "number") ? "decimal" : "text"} onChange={event => update({ [key]: event.target.value })} />
  </label>;
  const select = (key: "target" | "unit" | "role" | "op" | "valueType", label: string, options: Array<[string, string]>) => <label className="explorer-field" key={key}><span className="explorer-field-label">{t(`benchmark.${label}`)}</span><select className="explorer-field-input" value={draft[key]} onChange={event => update({ [key]: event.target.value, ...(key === "valueType" ? { text: event.target.value === "boolean" ? "true" : "" } : {}) })}>{options.map(([value, text]) => <option key={value} value={value}>{(key === "unit" || key === "role") && value ? text : t(`benchmark.${text}`)}</option>)}</select></label>;
  return <fieldset className="explorer-setting-row" aria-describedby={!valid ? `${id}-error` : undefined}>
    <legend>{t("benchmark.Option condition")} {index + 1}</legend>
    <label className="explorer-field"><span className="explorer-field-label">{t("benchmark.Recorded option suggestions")}</span>
      <select className="explorer-field-input" value="" onChange={event => { if (!event.target.value) return; try { const choice = parseSettingDescriptor(event.target.value); update({ target: choice.target, scope: choice.scope.join(", "), name: choice.name, unit: choice.unit ?? "", role: choice.role ?? "" }); } catch { /* Reject malformed recommendations. */ } }}>
        <option value="">{t("benchmark.Choose an option or enter its identity below")}</option>
        {(descriptors.data?.options ?? []).flatMap(option => { try { const value = parseSettingDescriptor(option.value); return [<option key={option.value} value={canonicalSettingDescriptor(value)}>{recordedSettingLabel(value, t)} ({option.count})</option>]; } catch { return []; } })}
      </select>
    </label>
    <div className="explorer-setting-grid">
      {select("target", "Target", [["launch", "Launch"], ["request", "Request"]])}{field("scope", "Scope (comma-separated names)")}{field("name", "Option name")}
      {select("unit", "Unit", [["", "No unit specified"], ...SETTING_UNITS.map(value => [value, value] as [string, string])])}
      {select("role", "Role", [["", "No role"], ...SETTING_ROLES.map(value => [value, value] as [string, string])])}
      {select("op", "Condition", [["eq", "Equals"], ["range", "Numeric range"]])}
      {draft.op === "eq" ? <>{select("valueType", "Value type", [["string", "Text"], ["number", "Number"], ["boolean", "Boolean"], ["array", "Number list"]])}
        {draft.valueType === "boolean" ? <label className="explorer-field"><span className="explorer-field-label">{t("benchmark.Value")}</span><select className="explorer-field-input" value={draft.text} onChange={event => update({ text: event.target.value })}><option value="">{t("benchmark.Choose a value")}</option><option value="true">true</option><option value="false">false</option></select></label> : field("text", draft.valueType === "array" ? "Values (comma-separated numbers)" : "Value")}</> : <>{field("min", "Minimum")}{field("max", "Maximum")}</>}
    </div>
    {descriptor ? <label className="explorer-field"><span className="explorer-field-label">{t("benchmark.Recorded value suggestions")}</span><select className="explorer-field-input" value="" onChange={event => { if (!event.target.value) return; try { const value = suggestedSettingValue(event.target.value, descriptor); update({ op: "eq", valueType: Array.isArray(value) ? "array" : typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : "string", text: Array.isArray(value) ? value.join(", ") : String(value) }); } catch { /* Reject malformed recommendations. */ } }}><option value="">{t("benchmark.Choose a value")}</option>{(values.data?.options ?? []).map(option => { try { const value = suggestedSettingValue(option.value, descriptor); return <option key={option.value} value={option.value}>{Array.isArray(value) ? `[${value.join(", ")}]` : typeof value === "string" ? `“${value}”` : String(value)} ({option.count})</option>; } catch { return null; } })}</select></label> : null}
    {!descriptorError && !valueError && (descriptors.error || values.error) ? <p className="explorer-range-hint" role="status">{t("benchmark.Suggestions unavailable. Type any value.")}</p> : descriptors.data?.has_more || values.data?.has_more ? <p className="explorer-range-hint">{t("benchmark.More recorded options exist. Enter an exact identity or value.")}</p> : null}
    {descriptorError || valueError ? <p className="explorer-validation" role="status">{t(`benchmark.${descriptorError ?? valueError}`)}</p> : null}
    {!valid ? <p id={`${id}-error`} className="explorer-validation" role="alert">{t("benchmark.Complete the option identity and a valid typed value or numeric range before applying.")}</p> : null}
    <button type="button" className="explorer-button" onClick={onRemove}>{t("benchmark.Remove condition")}</button>
  </fieldset>;
}
export function BenchmarkSettingEditor({ filters, onChange }: { filters: ExplorerFilters; onChange: (value: string[]) => void }): React.JSX.Element {
  const { t } = useI18n();
  return <div className="explorer-setting-editor">
    <p className="explorer-range-hint">{t("benchmark.All option conditions must match. Unknown values never match a condition.")}</p>
    {filters.setting.map((raw, index) => <SettingRow key={index} raw={raw} index={index} filters={filters} onChange={value => onChange(filters.setting.map((previous, row) => row === index ? value : previous))} onRemove={() => onChange(filters.setting.filter((_, row) => row !== index))} />)}
    <button type="button" className="explorer-button" disabled={filters.setting.length >= SETTING_MAX_CONDITIONS} onClick={() => onChange([...filters.setting, JSON.stringify({ _draft: EMPTY_DRAFT })])}>{t("benchmark.Add option condition")}</button>
  </div>;
}

"use client";
import { useI18n } from "@/i18n/client";
import { isWeightBitValue } from "@/lib/weight-bits";
import { useJsonFetch } from "./ui";
import { UiSelect } from "./ui-select";

/** Select confirmed weight-bit families present under the other discovery filters. */
export function BenchmarkWeightBitsFilter({ value, optionsPath, onChange }: {
  value: string; optionsPath: string; onChange: (value: string) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { data, error, reload } = useJsonFetch<{ options: { value: string; count: number }[] }>(optionsPath);
  const available = (data?.options ?? []).filter(option => isWeightBitValue(Number(option.value)) && String(Number(option.value)) === option.value);
  // Keep a restored selection when other filters have no matching results, and
  // during loading/failure. Clearing it would silently widen a shared query.
  const selectable = value && !available.some(option => option.value === value)
    ? [{ value, count: 0 }, ...available] : available;
  return <div className="explorer-field">
    <label id="filter-weight-bits-label" className="explorer-field-label" htmlFor="filter-weight-bits">{t("benchmark.Weight bits")}</label>
    <UiSelect id="filter-weight-bits" name="weight_bits" value={value} onChange={onChange}
      labelledBy="filter-weight-bits-label" describedBy="filter-weight-bits-hint"
      options={[{ value: "", label: t("benchmark.All weight bits") }, ...selectable.map(option => ({ value: option.value, label: `${option.value} bit${option.count > 0 ? ` (${option.count})` : ""}` }))]} />
    <p id="filter-weight-bits-hint" className="explorer-field-hint">{t("benchmark.Uses the declared weight format, not average file storage or KV cache precision. Unclassified results remain visible with no bit filter.")}</p>
    {error ? <p className="explorer-field-hint" role="status">{t("benchmark.Weight bit options unavailable. Clear the selection or retry.")} <button type="button" className="explorer-button" onClick={reload}>{t("benchmark.Refresh")}</button></p>
      : data === null ? <p className="explorer-field-hint" role="status">{t("benchmark.Loading suggestions…")}</p>
      : available.length === 0 ? <p className="explorer-field-hint">{t("benchmark.No confirmed weight bits match the other filters.")}</p> : null}
  </div>;
}

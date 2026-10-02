"use client";
import { useI18n } from "@/i18n/client";
import { useJsonFetch } from "./ui";
import { parsePointId } from "@/lib/benchmark-points";
import { formatPointLabel } from "./benchmark-explorer-format";
import { UiSelect } from "./ui-select";

/**
 * The basis point: the one operating point every listed result is read at.
 *
 * Published results measure a grid of input lengths against concurrencies, so a
 * column of speeds only answers one question once all of its rows report the
 * same point. Naming one here is what turns the table into a comparison, and it
 * is also what the two speed sorts rank at.
 *
 * The options are the points that were really measured under the other
 * conditions, offered as whole pairs: a reader cannot ask for an input length
 * at a concurrency nobody ran. Leaving it unset is a valid view - each result
 * then reports its own leading point, which is stated per row.
 */

export interface BasisPointOption {
  value: string;
  count: number;
}

export function BenchmarkBasisPoint({
  value,
  only,
  optionsPath,
  onSelect,
  onOnlyChange,
}: {
  value: string;
  only: boolean;
  optionsPath: string;
  onSelect: (value: string) => void;
  onOnlyChange: (value: boolean) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const { data, error } = useJsonFetch<{ options: BasisPointOption[]; has_more: boolean }>(optionsPath);
  const options = (data?.options ?? []).filter((option) => parsePointId(option.value) !== null);
  // A selection restored from a shared link stays selectable even if the
  // current conditions no longer offer it, so the address keeps describing the view.
  const selectable = value && !options.some((option) => option.value === value)
    ? [{ value, count: 0 }, ...options]
    : options;
  const unavailable = error !== null || (data !== null && options.length === 0);

  return (
    <div className="explorer-basis">
      <div className="explorer-field explorer-basis-field">
        <div className="explorer-basis-label-row">
        <label className="explorer-field-label" id="explorer-basis-point-label" htmlFor="explorer-basis-point">{t("benchmark.Basis point")}</label>
        <details className="explorer-basis-help">
          <summary aria-label={t("benchmark.How the basis point works")}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M8.1 7.5a1.9 1.9 0 0 1 3.8.2c0 1.3-1.9 1.5-1.9 2.8M10 13.1v.1" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </summary>
          <p className="explorer-basis-hint">
            {unavailable
              ? t("benchmark.No measured points to choose from. Each result reports its own leading point.")
              : value
                ? t("benchmark.Every row reports this point, so the speed columns answer the same question.")
                : t("benchmark.Pick a point to read every result at the same input length and concurrency.")}
          </p>
        </details>
        </div>
        <UiSelect
          id="explorer-basis-point"
          name="basis_point"
          labelledBy="explorer-basis-point-label"
          value={value}
          disabled={unavailable}
          onChange={onSelect}
          options={[
            { value: "", label: t("benchmark.Each result's own leading point") },
            ...selectable.map((option) => {
              const point = parsePointId(option.value)!;
              const label = formatPointLabel(point.prompt_tokens, point.concurrency);
              return { value: option.value, label: option.count > 0 ? t("benchmark.{point} ({count} results)", { point: label, count: String(option.count) }) : label };
            }),
          ]}
        />
      </div>
      <label className="explorer-basis-only">
        <input
          type="checkbox"
          checked={only}
          disabled={!value}
          onChange={(event) => onOnlyChange(event.target.checked)}
        />
        <span>{t("benchmark.Only results measured at this point")}</span>
      </label>
      {unavailable ? <p className="explorer-basis-unavailable" role="status">{t("benchmark.No measured points to choose from. Each result reports its own leading point.")}</p> : null}
    </div>
  );
}

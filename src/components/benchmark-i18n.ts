import React from "react";
import type { Translator } from "@/i18n/types";

/** English fallback for pure helpers used without a page provider. */
export const benchmarkFallback: Translator = (key, values = {}) => key.replace(/^benchmark\./, "").replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));

export interface ColumnHeadingProps {
  label: string;
  unit?: string;
}

/**
 * A column heading in the reader’s language only. A reported unit sits on its
 * own quiet line so numeric columns stay narrow and keep their unit in view.
 */
export function ColumnHeading({ label, unit }: ColumnHeadingProps): React.JSX.Element {
  return React.createElement(
    "span",
    { className: "column-heading" },
    React.createElement("span", { className: "column-heading-label" }, label),
    unit ? React.createElement("span", { className: "column-heading-unit" }, unit) : null,
  );
}

import React from "react";
import type { Translator } from "@/i18n/types";

/** English fallback for pure helpers used without a page provider. */
export const benchmarkFallback: Translator = (key, values = {}) => key.replace(/^benchmark\./, "").replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));

export interface BilingualHeaderProps {
  local: string;
  en: string;
  unit?: string;
  locale: string;
  className?: string;
}

/**
 * Two-line bilingual column header for ko/ja/zh: concise local label on top,
 * English label (+ optional unit) on bottom, each nowrap.
 * On English (en): single line with English label (+ optional unit).
 */
export function BilingualHeader({
  local,
  en,
  unit,
  locale,
  className,
}: BilingualHeaderProps): React.JSX.Element {
  const isEn = locale === "en" || local.trim().toLowerCase() === en.toLowerCase();
  const cls = className ? `bilingual-header ${className}` : "bilingual-header";
  if (isEn) {
    return React.createElement(
      "span",
      { className: cls },
      React.createElement("span", { className: "bilingual-en" }, en),
      unit ? React.createElement("span", { className: "bilingual-unit" }, ` (${unit})`) : null,
    );
  }
  return React.createElement(
    "span",
    { className: cls },
    React.createElement("span", { className: "bilingual-local" }, local),
    React.createElement("span", { className: "bilingual-sub" }, `${en}${unit ? ` (${unit})` : ""}`),
  );
}

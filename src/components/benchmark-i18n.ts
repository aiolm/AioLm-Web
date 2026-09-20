import type { Translator } from "@/i18n/types";
/** English fallback for pure helpers used without a page provider. */
export const benchmarkFallback: Translator = (key, values = {}) => key.replace(/^benchmark\./, "").replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));

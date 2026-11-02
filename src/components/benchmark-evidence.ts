import type { RecordedSetting, ServingMetricKey } from "@aiolm/benchmark-contracts";
import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";

const SETTING_UNIT_LABELS: Partial<Record<NonNullable<RecordedSetting["unit"]>, string>> = {
  tokens: "benchmark.tokens", threads: "benchmark.Threads", layers: "benchmark.layers",
  count: "benchmark.count", ratio: "benchmark.ratio", bits: "benchmark.bits",
};
const SETTING_ROLE_LABELS: Record<NonNullable<RecordedSetting["role"]>, string> = {
  "context.total_tokens": "benchmark.Total context allocation",
  "context.per_sequence_tokens": "benchmark.Per-sequence context allocation",
  "context.per_request_kv_tokens": "benchmark.Per-request KV allocation",
  "concurrency.capacity": "benchmark.Server concurrency capacity",
};

/** Descriptor identity stays exact: root and nested scopes, unit and role never collapse. */
export function recordedSettingLabel(setting: Pick<RecordedSetting, "target" | "scope" | "name" | "unit" | "role">, t: Translator = benchmarkFallback): string {
  const target = t(setting.target === "request" ? "benchmark.Request" : "benchmark.Launch");
  const scope = setting.scope.length ? JSON.stringify(setting.scope) : t("benchmark.Root scope");
  return `${target} · ${scope} · ${setting.name} · ${t("benchmark.Unit")}: ${setting.unit ?? t("benchmark.No unit specified")} · ${t("benchmark.Role")}: ${setting.role ?? t("benchmark.No role")}`;
}

/** JSON preserves the difference between strings, numbers, false, zero and ordered arrays. */
export function recordedSettingValue(value: RecordedSetting["value"], t: Translator = benchmarkFallback): string {
  return value === null ? t("benchmark.Value not recorded") : JSON.stringify(value);
}

/** Readable setting value; the full descriptor remains available separately. */
export function recordedSettingPresentation(setting: RecordedSetting, t: Translator = benchmarkFallback) {
  const unitKey = setting.unit === null ? undefined : SETTING_UNIT_LABELS[setting.unit];
  return {
    identity: JSON.stringify([setting.target, setting.scope, setting.name, setting.unit, setting.role]),
    descriptor: recordedSettingLabel(setting, t),
    label: `${setting.name} · ${t(setting.target === "request" ? "benchmark.Request" : "benchmark.Launch")}${setting.scope.length ? ` · ${JSON.stringify(setting.scope)}` : ""}`,
    value: recordedSettingValue(setting.value, t),
    unit: setting.unit === null ? undefined : unitKey ? t(unitKey) : setting.unit === "bytes" ? "B" : setting.unit === "percent" ? "%" : setting.unit,
    description: setting.role === null ? undefined : `${t(SETTING_ROLE_LABELS[setting.role])} (${setting.role})`,
  };
}

/** Configured selection is separate from installed inventory and never proves layer placement. */
export function selectedGpuRecord(names: readonly string[] | undefined, mode: unknown, complete: unknown, t: Translator = benchmarkFallback): string {
  if (mode === "cpu") return "CPU";
  if (!names?.length) return t(complete === true ? "benchmark.None reported" : "benchmark.GPU selection not recorded");
  const devices = names.join(", ");
  if (complete === true) return devices;
  return `${devices} · ${t(complete === false ? "benchmark.Incomplete selection record" : "benchmark.Selection completeness not recorded")}`;
}

export interface ServingMetricEvidence {
  requestUsage?: unknown;
  memoryScope?: unknown;
  usageStatus?: unknown;
  outputBytes?: number;
  contentBytes?: number;
  reasoningBytes?: number;
}

/** A missing number is not zero, and a channel with zero bytes has no first event. */
export function servingMetricAbsence(key: ServingMetricKey, evidence: ServingMetricEvidence, t: Translator = benchmarkFallback): string {
  if (key.startsWith("reported_")) {
    if (evidence.usageStatus === "invalid") return t("benchmark.Usage response invalid or inconsistent");
    if (evidence.requestUsage === false) return t("benchmark.Usage not requested");
    return t("benchmark.Usage value not reported");
  }
  if (key === "first_reasoning_ms" && evidence.reasoningBytes === 0) return t("benchmark.No reasoning output observed");
  if (key === "first_content_ms" && evidence.contentBytes === 0) return t("benchmark.No content output observed");
  if (key === "first_output_ms" && evidence.outputBytes === 0) return t("benchmark.No output observed");
  if (key === "peak_memory_bytes" && evidence.memoryScope === "unavailable") return t("benchmark.Unavailable for this process scope");
  return t("benchmark.Measurement not reported");
}

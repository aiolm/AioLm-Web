"use client";
import { useI18n } from "@/i18n/client";
import { asRecord, displayText, formatCompactBytes } from "./benchmark-detail-format";
import { BilingualHeader } from "./benchmark-i18n";
import type { BenchmarkSetup } from "./benchmark-detail-fields";

/** Measurement-time hardware is visible before optional reproducibility details. */
export function BenchmarkHardwareOverview({ benchmark }: { benchmark: BenchmarkSetup }): React.JSX.Element {
  const { locale, t } = useI18n();
  const env = asRecord(benchmark.environment);
  const cpu = asRecord(env?.cpu);
  const execution = asRecord(env?.execution);
  const runtime = asRecord(benchmark.runtime);
  const gpus = execution?.mode === "cpu" ? [] : Array.isArray(execution?.selected_gpus) ? execution.selected_gpus.map(asRecord).filter((gpu): gpu is Record<string, unknown> => gpu !== null) : [];
  return <section className="card" aria-labelledby="hardware-overview-title">
    <h2 id="hardware-overview-title">{t("benchmark.Environment")}</h2>
    <div className="detail-hardware-grid">
      <article><BilingualHeader local={t("benchmark.Selected graphics")} en="Selected GPU" locale={locale} />
        {gpus.length > 0 ? <ul>{gpus.map((gpu, index) => <li key={index}><strong>{displayText(gpu.name, t)}</strong>{typeof gpu.vram_mb === "number" ? <span>{formatCompactBytes(gpu.vram_mb * 1024 ** 2, t)} VRAM</span> : null}</li>)}</ul> : <strong>{execution?.mode === "cpu" ? "CPU" : "—"}</strong>}
      </article>
      <article><BilingualHeader local={t("benchmark.CPU")} en="CPU" locale={locale} /><strong>{displayText(cpu?.name, t)}</strong>{typeof cpu?.logical_cores === "number" ? <span>{t("benchmark.Logical cores")}: {cpu.logical_cores}</span> : null}</article>
      <article><BilingualHeader local={t("benchmark.System memory")} en="System RAM" locale={locale} /><strong>{typeof env?.system_memory_bytes === "number" ? formatCompactBytes(env.system_memory_bytes, t) : "—"}</strong></article>
      <article><BilingualHeader local={t("benchmark.Runtime and backend")} en="Runtime / Backend" locale={locale} /><strong>{[runtime?.name, runtime?.backend].filter(value => typeof value === "string").join(" · ") || "—"}</strong><span>{displayText(runtime?.version, t)}</span><span>{[env?.os, env?.arch].filter(value => typeof value === "string").join(" · ")}</span></article>
    </div>
  </section>;
}

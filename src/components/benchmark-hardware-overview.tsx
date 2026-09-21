"use client";
import { useI18n } from "@/i18n/client";
import { asRecord, displayText, formatCompactBytes, formatVramGb } from "./benchmark-detail-format";
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
  const osArch = [env?.os, env?.arch].filter(value => typeof value === "string").join(" · ");

  return (
    <section className="card" aria-labelledby="hardware-overview-title">
      <h2 id="hardware-overview-title">{t("benchmark.Environment")}</h2>
      <div className="detail-hardware-grid">
        <article className="detail-hardware-card">
          <BilingualHeader local={t("benchmark.Selected graphics")} en="Selected GPU" locale={locale} />
          {gpus.length > 0 ? (
            <ul className="detail-hardware-gpus">
              {gpus.map((gpu, index) => (
                <li key={index} className="detail-gpu-entry">
                  <strong>{displayText(gpu.name, t)}</strong>
                  {typeof gpu.vram_mb === "number" ? (
                    <div className="detail-fact">
                      <span className="detail-fact-label">{t("benchmark.VRAM")}</span>
                      <span className="detail-fact-value">{formatVramGb(gpu.vram_mb, t)}</span>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <strong>{execution?.mode === "cpu" ? "CPU" : "—"}</strong>
          )}
        </article>

        <article className="detail-hardware-card">
          <BilingualHeader local={t("benchmark.CPU")} en="CPU" locale={locale} />
          <strong>{displayText(cpu?.name, t)}</strong>
          {typeof cpu?.logical_cores === "number" ? (
            <div className="detail-fact">
              <span className="detail-fact-label">{t("benchmark.Logical cores")}</span>
              <span className="detail-fact-value">{cpu.logical_cores}</span>
            </div>
          ) : null}
        </article>

        <article className="detail-hardware-card">
          <BilingualHeader local={t("benchmark.System memory")} en="System RAM" locale={locale} />
          <strong>{typeof env?.system_memory_bytes === "number" ? formatCompactBytes(env.system_memory_bytes, t) : "—"}</strong>
        </article>

        <article className="detail-hardware-card">
          <BilingualHeader local={t("benchmark.Runtime and backend")} en="Runtime / Backend" locale={locale} />
          <div className="detail-hardware-facts">
            {runtime?.name ? (
              <div className="detail-fact">
                <span className="detail-fact-label">{t("benchmark.Runtime")}</span>
                <span className="detail-fact-value">
                  {displayText(runtime.name, t)}
                  {runtime.version ? ` (${displayText(runtime.version, t)})` : ""}
                </span>
              </div>
            ) : null}
            {runtime?.backend ? (
              <div className="detail-fact">
                <span className="detail-fact-label">{t("benchmark.Backend")}</span>
                <span className="detail-fact-value">{displayText(runtime.backend, t)}</span>
              </div>
            ) : null}
            {osArch ? (
              <div className="detail-fact">
                <span className="detail-fact-label">{t("benchmark.OS")}</span>
                <span className="detail-fact-value">{osArch}</span>
              </div>
            ) : null}
            {!runtime?.name && !runtime?.backend && !osArch ? <strong>—</strong> : null}
          </div>
        </article>
      </div>
    </section>
  );
}

"use client";
import { useI18n } from "@/i18n/client";
import { asRecord, displayText, formatCompactBytes, formatVramGb } from "./benchmark-detail-format";
import { formatCpuCores, runtimeVersionLabel } from "./benchmark-explorer-format";
import { BilingualHeader } from "./benchmark-i18n";
import type { BenchmarkSetup } from "./benchmark-detail-fields";

interface AggregatedGpu {
  gpu: Record<string, unknown>;
  count: number;
}

function aggregateGpus(gpus: Record<string, unknown>[]): AggregatedGpu[] {
  const groups: AggregatedGpu[] = [];
  for (const gpu of gpus) {
    const key = [
      gpu.name ?? "",
      gpu.vendor ?? "",
      gpu.vram_mb ?? "",
      gpu.driver ?? "",
      gpu.integrated ?? "",
    ].join("|");
    const existing = groups.find((g) => {
      const gKey = [
        g.gpu.name ?? "",
        g.gpu.vendor ?? "",
        g.gpu.vram_mb ?? "",
        g.gpu.driver ?? "",
        g.gpu.integrated ?? "",
      ].join("|");
      return gKey === key;
    });
    if (existing) {
      existing.count += 1;
    } else {
      groups.push({ gpu, count: 1 });
    }
  }
  return groups;
}

/** Measurement-time hardware is visible before optional reproducibility details. */
export function BenchmarkHardwareOverview({ benchmark }: { benchmark: BenchmarkSetup }): React.JSX.Element {
  const { locale, t } = useI18n();
  const env = asRecord(benchmark.environment);
  const cpu = asRecord(env?.cpu);
  const execution = asRecord(env?.execution);
  const runtime = asRecord(benchmark.runtime);
  const rawGpus = execution?.mode === "cpu" ? [] : Array.isArray(execution?.selected_gpus) ? execution.selected_gpus.map(asRecord).filter((gpu): gpu is Record<string, unknown> => gpu !== null) : [];
  const gpus = aggregateGpus(rawGpus);
  const osArch = [env?.os, env?.arch].filter(value => typeof value === "string").join(" · ");
  const runtimeVersion = runtimeVersionLabel(runtime?.version, runtime?.build);

  return (
    <section className="card" aria-labelledby="hardware-overview-title">
      <h2 id="hardware-overview-title">{t("benchmark.Environment")}</h2>
      <div className="detail-hardware-grid">
        <article className="detail-hardware-card">
          <BilingualHeader local={t("benchmark.Selected graphics")} en="Selected GPU" locale={locale} />
          {gpus.length > 0 ? (
            <ul className="detail-hardware-gpus">
              {gpus.map(({ gpu, count }, index) => {
                const name = displayText(gpu.name, t);
                const title = count > 1 ? `${name} x ${count}` : name;
                return (
                  <li key={index} className="detail-gpu-entry">
                    <strong>{title}</strong>
                    {typeof gpu.vram_mb === "number" ? (
                      <div className="detail-fact">
                        <span className="detail-fact-label">{t("benchmark.VRAM")}</span>
                        <span className="detail-fact-value">{formatVramGb(gpu.vram_mb, t)}</span>
                      </div>
                    ) : null}
                  </li>
                );
              })}
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
              <span className="detail-fact-label">
                {typeof cpu.physical_cores === "number" && cpu.physical_cores > 0
                  ? t("benchmark.CPU cores")
                  : t("benchmark.Logical cores")}
              </span>
              <span className="detail-fact-value">
                {formatCpuCores({
                  logical_cores: cpu.logical_cores as number,
                  physical_cores: typeof cpu.physical_cores === "number" ? cpu.physical_cores : null,
                })}
              </span>
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
                  {runtimeVersion ? ` (${runtimeVersion})` : ""}
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

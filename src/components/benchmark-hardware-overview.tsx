"use client";
import { useI18n } from "@/i18n/client";
import { asRecord, displayText, formatCompactBytes, formatVramGb, reportedGpuMemory } from "./benchmark-detail-format";
import { formatCpuCores, runtimeVersionLabel } from "./benchmark-explorer-format";
import { ColumnHeading } from "./benchmark-i18n";
import type { BenchmarkSetup } from "./benchmark-detail-fields";
import { selectedGpuRecord } from "./benchmark-evidence";

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
  const { t } = useI18n();
  const env = asRecord(benchmark.environment);
  const cpu = asRecord(env?.cpu);
  const execution = asRecord(env?.execution);
  const runtime = asRecord(benchmark.runtime);
  const rawGpus = benchmark.schema_version === 3
    ? (Array.isArray(env?.installed_gpus) ? env.installed_gpus : []).map(asRecord).filter((gpu): gpu is Record<string, unknown> => gpu !== null)
    : execution?.mode === "cpu" ? [] : Array.isArray(execution?.selected_gpus) ? execution.selected_gpus.map(asRecord).filter((gpu): gpu is Record<string, unknown> => gpu !== null) : [];
  const selectedNames = Array.isArray(execution?.selected_gpus) ? execution.selected_gpus.map(asRecord).filter((gpu): gpu is Record<string, unknown> => gpu !== null).map(gpu => displayText(gpu.name, t)) : [];
  const gpus = aggregateGpus(rawGpus);
  const osArch = [env?.os, env?.arch].filter(value => typeof value === "string").join(" · ");
  const runtimeVersion = benchmark.schema_version === 3 ? (typeof runtime?.version === "string" ? runtime.version : null) : runtimeVersionLabel(runtime);

  return (
    <section className="card detail-environment" aria-labelledby="hardware-overview-title">
      <h2 id="hardware-overview-title">{t("benchmark.Environment")}</h2>
      {benchmark.schema_version === 3 ? <p className="muted">{t("benchmark.Host resources describe the AioLM host, not the attached engine or container allocation.")} {t("benchmark.Environment scope")}: {displayText(env?.scope, t)}</p> : null}
      <div className="detail-hardware-grid">
        <article className="detail-hardware-card">
          <ColumnHeading label={t(benchmark.schema_version === 3 ? "benchmark.Installed host GPUs" : "benchmark.Selected graphics")} />
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
                        <span className="detail-fact-label">{t(gpu.integrated === true ? "benchmark.Reported GPU memory" : "benchmark.VRAM")}</span>
                        <span className="detail-fact-value">{formatVramGb(gpu.vram_mb, t)}</span>
                      </div>
                    ) : null}
                    {benchmark.schema_version === 3 && typeof gpu.integrated === "boolean" ? <div className="detail-fact"><span className="detail-fact-label">{t("benchmark.Integrated")}</span><span className="detail-fact-value">{displayText(gpu.integrated, t)}</span></div> : null}
                    {benchmark.schema_version === 3 && gpu.vram_mb == null ? <div className="detail-fact"><span className="detail-fact-label">{t(gpu.integrated === true ? "benchmark.Reported GPU memory" : "benchmark.VRAM")}</span><span className="detail-fact-value">{reportedGpuMemory(gpu.vram_mb, gpu.integrated, t)}</span></div> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <strong>{benchmark.schema_version === 3 ? t(Array.isArray(env?.installed_gpus) ? "benchmark.None reported" : "benchmark.Host GPU inventory not recorded") : execution?.mode === "cpu" ? "CPU" : "—"}</strong>
          )}
          {benchmark.schema_version === 3 ? <div className="detail-fact"><span className="detail-fact-label">{t("benchmark.Selected graphics")}</span><span className="detail-fact-value">{selectedGpuRecord(selectedNames, execution?.mode, execution?.selection_complete, t)}</span></div> : null}
        </article>

        <article className="detail-hardware-card">
          <ColumnHeading label={t("benchmark.CPU")} />
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
          <ColumnHeading label={t("benchmark.System memory")} />
          <strong>{typeof env?.system_memory_bytes === "number" ? formatCompactBytes(env.system_memory_bytes, t) : "—"}</strong>
        </article>

        <article className="detail-hardware-card">
          <ColumnHeading label={t("benchmark.Runtime and backend")} />
          <div className="detail-hardware-facts">
            <div className="detail-fact">
              <span className="detail-fact-label">{t("benchmark.Runtime")}</span>
              <span className="detail-fact-value">
                {displayText(runtime?.name, t)}
                {runtimeVersion ? ` ${runtimeVersion}` : ""}
              </span>
            </div>
            {runtime?.backend || benchmark.schema_version === 3 ? (
              <div className="detail-fact">
                <span className="detail-fact-label">{t("benchmark.Backend")}</span>
                <span className="detail-fact-value">{runtime?.backend ? displayText(runtime.backend, t) : t("benchmark.Backend identity not recorded")}</span>
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

import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";
/**
 * The reported test setup, grouped the way a reader checks one: what ran, on
 * what machine, against which workload, with which execution settings.
 *
 * Every field the public contract publishes
 * (`@aiolm/benchmark-contracts`, `schema/public-benchmark.schema.json`) has a
 * row even when the publication left it null: an absent setting is itself a
 * result, and hiding it would let two different runs look identical.
 */

import { asRecord, describeGpuList, displayText, formatByteSize, joinList } from "./benchmark-detail-format";

/** The public `benchmark` object of GET /v1/benchmark-runs/<id>. Every member is unverified input. */
export interface BenchmarkSetup {
  model: unknown;
  runtime: unknown;
  workload: unknown;
  environment: unknown;
  execution: unknown;
  method: unknown;
  app_version: unknown;
  status: unknown;
}

export interface SetupField {
  label: string;
  /** Rendered next to the label, never folded into the value. */
  unit?: string;
  /** One readable value, or one entry per reported item when the field is a set of devices. */
  value: string | string[];
}

export interface SetupGroup {
  /** Heading id, used to label the group's definition list. */
  id: string;
  title: string;
  fields: SetupField[];
}

export function buildSetupGroups(benchmark: BenchmarkSetup, t: Translator = benchmarkFallback): SetupGroup[] {
  const model = asRecord(benchmark.model);
  const runtime = asRecord(benchmark.runtime);
  const method = asRecord(benchmark.method);
  const workload = asRecord(benchmark.workload);
  const environment = asRecord(benchmark.environment);
  const execution = asRecord(benchmark.execution);
  const envExecution = asRecord(environment?.["execution"]);
  const cpu = asRecord(environment?.["cpu"]);
  const settings = asRecord(execution?.["settings"]);

  return [
    {
      id: "detail-setup-model",
      title: t("benchmark.Model and runtime"),
      fields: [
        { label: t("benchmark.App version"), value: displayText(benchmark.app_version, t) },
        { label: t("benchmark.Result status"), value: displayText(benchmark.status, t) },
        { label: t("benchmark.Model identity"), value: displayText(model?.["status"], t) },
        { label: t("benchmark.Model checksum"), value: displayText(model?.["sha256"], t) },
        { label: t("benchmark.Model size"), value: formatByteSize(model?.["size_bytes"], t) },
        { label: t("benchmark.Runtime"), value: displayText(runtime?.["name"], t) },
        { label: t("benchmark.Runtime version"), value: displayText(runtime?.["version"], t) },
        { label: t("benchmark.Runtime backend"), value: displayText(runtime?.["backend"], t) },
        { label: t("benchmark.Runtime build"), value: displayText(runtime?.["build"], t) },
      ],
    },
    {
      id: "detail-setup-hardware",
      title: t("benchmark.Hardware and operating system"),
      fields: [
        { label: t("benchmark.Operating system"), value: displayText(environment?.["os"], t) },
        { label: t("benchmark.Architecture"), value: displayText(environment?.["arch"], t) },
        { label: t("benchmark.CPU"), value: displayText(cpu?.["name"], t) },
        { label: t("benchmark.CPU cores"), unit: t("benchmark.logical"), value: displayText(cpu?.["logical_cores"], t) },
        { label: t("benchmark.Installed graphics"), value: describeGpuList(environment?.["installed_gpus"], t) },
        { label: t("benchmark.Run mode"), value: displayText(envExecution?.["mode"], t) },
        { label: t("benchmark.Selected graphics"), value: describeGpuList(envExecution?.["selected_gpus"], t) },
        { label: t("benchmark.Graphics selection complete"), value: displayText(envExecution?.["selection_complete"], t) },
      ],
    },
    {
      id: "detail-setup-workload",
      title: t("benchmark.Workload and method"),
      fields: [
        { label: t("benchmark.Method"), value: displayText(method?.["id"], t) },
        { label: t("benchmark.Method version"), value: displayText(method?.["version"], t) },
        { label: t("benchmark.Corpus"), value: displayText(workload?.["corpus"], t) },
        { label: t("benchmark.Corpus version"), value: displayText(workload?.["corpus_version"], t) },
        { label: t("benchmark.Corpus checksum"), value: displayText(workload?.["corpus_sha256"], t) },
        { label: t("benchmark.Prompt lengths"), unit: t("benchmark.tokens"), value: joinList(workload?.["prompt_lengths"], t) },
        { label: t("benchmark.Generation length"), unit: t("benchmark.tokens"), value: displayText(workload?.["generation_length"], t) },
        { label: t("benchmark.Batch sizes"), value: joinList(workload?.["batch_sizes"], t) },
        { label: t("benchmark.Repetitions"), value: displayText(workload?.["repetitions"], t) },
        { label: t("benchmark.Warmup"), value: displayText(workload?.["warmup"], t) },
      ],
    },
    {
      id: "detail-setup-execution",
      title: t("benchmark.Execution settings"),
      fields: [
        { label: t("benchmark.Context size"), unit: t("benchmark.tokens"), value: displayText(execution?.["context_size"], t) },
        { label: t("benchmark.Parallel requests"), value: displayText(execution?.["parallel"], t) },
        { label: t("benchmark.Threads"), value: displayText(settings?.["threads"], t) },
        { label: t("benchmark.Batch threads"), value: displayText(settings?.["threads_batch"], t) },
        { label: t("benchmark.Graphics layers"), value: displayText(settings?.["gpu_layers"], t) },
        { label: t("benchmark.Flash attention"), value: displayText(settings?.["flash_attention"], t) },
        { label: t("benchmark.KV cache type"), unit: t("benchmark.keys"), value: displayText(settings?.["cache_type_k"], t) },
        { label: t("benchmark.KV cache type"), unit: t("benchmark.values"), value: displayText(settings?.["cache_type_v"], t) },
        { label: t("benchmark.Split mode"), value: displayText(settings?.["split_mode"], t) },
        { label: t("benchmark.Tensor split"), value: joinList(settings?.["tensor_split"], t) },
      ],
    },
  ];
}

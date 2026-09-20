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

export function buildSetupGroups(benchmark: BenchmarkSetup): SetupGroup[] {
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
      title: "Model and runtime",
      fields: [
        { label: "App version", value: displayText(benchmark.app_version) },
        { label: "Result status", value: displayText(benchmark.status) },
        { label: "Model identity", value: displayText(model?.["status"]) },
        { label: "Model checksum", value: displayText(model?.["sha256"]) },
        { label: "Model size", value: formatByteSize(model?.["size_bytes"]) },
        { label: "Runtime", value: displayText(runtime?.["name"]) },
        { label: "Runtime version", value: displayText(runtime?.["version"]) },
        { label: "Runtime backend", value: displayText(runtime?.["backend"]) },
        { label: "Runtime build", value: displayText(runtime?.["build"]) },
      ],
    },
    {
      id: "detail-setup-hardware",
      title: "Hardware and operating system",
      fields: [
        { label: "Operating system", value: displayText(environment?.["os"]) },
        { label: "Architecture", value: displayText(environment?.["arch"]) },
        { label: "CPU", value: displayText(cpu?.["name"]) },
        { label: "CPU cores", unit: "logical", value: displayText(cpu?.["logical_cores"]) },
        { label: "Installed graphics", value: describeGpuList(environment?.["installed_gpus"]) },
        { label: "Run mode", value: displayText(envExecution?.["mode"]) },
        { label: "Selected graphics", value: describeGpuList(envExecution?.["selected_gpus"]) },
        { label: "Graphics selection complete", value: displayText(envExecution?.["selection_complete"]) },
      ],
    },
    {
      id: "detail-setup-workload",
      title: "Workload and method",
      fields: [
        { label: "Method", value: displayText(method?.["id"]) },
        { label: "Method version", value: displayText(method?.["version"]) },
        { label: "Corpus", value: displayText(workload?.["corpus"]) },
        { label: "Corpus version", value: displayText(workload?.["corpus_version"]) },
        { label: "Corpus checksum", value: displayText(workload?.["corpus_sha256"]) },
        { label: "Prompt lengths", unit: "tokens", value: joinList(workload?.["prompt_lengths"]) },
        { label: "Generation length", unit: "tokens", value: displayText(workload?.["generation_length"]) },
        { label: "Batch sizes", value: joinList(workload?.["batch_sizes"]) },
        { label: "Repetitions", value: displayText(workload?.["repetitions"]) },
        { label: "Warmup", value: displayText(workload?.["warmup"]) },
      ],
    },
    {
      id: "detail-setup-execution",
      title: "Execution settings",
      fields: [
        { label: "Context size", unit: "tokens", value: displayText(execution?.["context_size"]) },
        { label: "Parallel requests", value: displayText(execution?.["parallel"]) },
        { label: "Threads", value: displayText(settings?.["threads"]) },
        { label: "Batch threads", value: displayText(settings?.["threads_batch"]) },
        { label: "Graphics layers", value: displayText(settings?.["gpu_layers"]) },
        { label: "Flash attention", value: displayText(settings?.["flash_attention"]) },
        { label: "KV cache type", unit: "keys", value: displayText(settings?.["cache_type_k"]) },
        { label: "KV cache type", unit: "values", value: displayText(settings?.["cache_type_v"]) },
        { label: "Split mode", value: displayText(settings?.["split_mode"]) },
        { label: "Tensor split", value: joinList(settings?.["tensor_split"]) },
      ],
    },
  ];
}

import { formatCpuCores, runtimeVersionLabel } from "./benchmark-explorer-format";
import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";
/**
 * The reported test setup, grouped the way a reader checks one: which weights
 * ran, on what machine, under which operating system, with which runtime and
 * backend, against which workload, and with which execution settings.
 *
 * Every field the public contract publishes
 * (`@aiolm/benchmark-contracts`, `schema/public-benchmark.schema.json`) has a
 * row even when the publication left it null: an absent setting is itself a
 * result, and hiding it would let two different runs look identical.
 *
 * Model metadata is optional in the contract, so the model group reports
 * unknown for a publication that carried none rather than reconstructing it.
 * The distributor is read from the repository namespace only, and `quantized_by`
 * keeps its own row because it names a different party.
 */

import { asRecord, describeArguments, describeGpuDetails, describeGpuList, type ReportedDevice, displayText, formatByteSize, joinList } from "./benchmark-detail-format";
import {
  formatMetadataSource,
  formatWeightQuantization,
  huggingFaceLinks,
  huggingFaceUrl,
  modelDisplayName,
  modelPublisher,
  modelValue,
  readModelInfo,
} from "./benchmark-model-identity";

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
  /**
   * Public source pages for the value, keyed by the text as it is displayed.
   * Only an id that validates as a repository gets one, so an unusable value
   * stays plain text instead of becoming a link that goes nowhere.
   */
  links?: Record<string, string>;
  devices?: ReportedDevice[];
  /** Shown as command text: one entry per line, in a monospaced block. */
  command?: boolean;
}

export interface SetupGroup {
  /** Heading id, used to label the definition list of the group. */
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
  const info = readModelInfo(model?.["metadata"]);
  const repositoryUrl = huggingFaceUrl(info?.repository);

  // Model group: key fields shown once; empty optional metadata fields omitted.
  const modelFields: SetupField[] = [
    { label: t("benchmark.Model name"), value: info?.name ? modelDisplayName(info, info.name) : modelValue(null, t) },
    { label: t("benchmark.Publisher"), value: modelValue(modelPublisher(info), t) },
    { label: t("benchmark.Weight quantization"), value: formatWeightQuantization(info, t) },
  ];
  if (info?.repository) {
    modelFields.push({
      label: t("benchmark.Repository"),
      value: info.repository,
      ...(repositoryUrl ? { links: { [info.repository]: repositoryUrl } } : {}),
    });
  }
  if (info?.quantized_by) {
    modelFields.push({ label: t("benchmark.Quantized by"), value: info.quantized_by });
  }
  if (info && info.base_models.length > 0) {
    modelFields.push({
      label: t("benchmark.Base model"),
      value: info.base_models,
      links: huggingFaceLinks(info.base_models),
    });
  }
  if (info?.artifact) {
    modelFields.push({ label: t("benchmark.Artifact file"), value: info.artifact });
  }
  if (info?.architecture) {
    modelFields.push({ label: t("benchmark.Model architecture"), value: info.architecture });
  }
  if (info?.size_label) {
    modelFields.push({ label: t("benchmark.Parameter size"), value: info.size_label });
  }
  if (info?.format) {
    modelFields.push({ label: t("benchmark.Weights format"), value: info.format });
  }
  if (info?.file_type != null) {
    modelFields.push({ label: t("benchmark.Quantization file type"), value: String(info.file_type) });
  }
  if (info?.source) {
    modelFields.push({ label: t("benchmark.Metadata source"), value: formatMetadataSource(info, t) });
  }
  modelFields.push(
    { label: t("benchmark.Model identity"), value: displayText(model?.["status"], t) },
    { label: t("benchmark.Model checksum"), value: displayText(model?.["sha256"], t) },
    { label: t("benchmark.Model size"), value: formatByteSize(model?.["size_bytes"], t) },
  );

  // Hardware group: Selected GPU only; no installed GPU list. System RAM when reported.
  const physicalCores = typeof cpu?.["physical_cores"] === "number" && cpu["physical_cores"] > 0 ? cpu["physical_cores"] : null;
  const logicalCores = cpu?.["logical_cores"];
  const hardwareFields: SetupField[] = [
    { label: t("benchmark.CPU"), value: displayText(cpu?.["name"], t) },
    { label: t("benchmark.CPU cores"), value: typeof logicalCores === "number"
      ? formatCpuCores({ logical_cores: logicalCores, physical_cores: physicalCores })
      : displayText(null, t) },
  ];
  if (typeof environment?.["system_memory_bytes"] === "number") {
    hardwareFields.push({
      label: t("benchmark.System memory"),
      value: formatByteSize(environment["system_memory_bytes"], t),
    });
  }
  hardwareFields.push(
    { label: t("benchmark.Run mode"), value: displayText(envExecution?.["mode"], t) },
    { label: t("benchmark.Selected graphics"), value: describeGpuList(envExecution?.["selected_gpus"], t), devices: describeGpuDetails(envExecution?.["selected_gpus"], t) },
    { label: t("benchmark.Graphics selection complete"), value: displayText(envExecution?.["selection_complete"], t) },
  );

  return [
    {
      id: "detail-setup-model",
      title: t("benchmark.Model"),
      fields: modelFields,
    },
    {
      id: "detail-setup-hardware",
      title: t("benchmark.Hardware"),
      fields: hardwareFields,
    },
    {
      id: "detail-setup-os",
      title: t("benchmark.Operating system"),
      fields: [
        { label: t("benchmark.Operating system"), value: displayText(environment?.["os"], t) },
        { label: t("benchmark.Architecture"), value: displayText(environment?.["arch"], t) },
      ],
    },
    {
      id: "detail-setup-runtime",
      title: t("benchmark.Runtime and backend"),
      fields: [
        { label: t("benchmark.Runtime"), value: displayText(runtime?.["name"], t) },
        { label: t("benchmark.Runtime version"), value: displayText(runtimeVersionLabel(runtime?.["version"]), t) },
        { label: t("benchmark.Runtime backend"), value: displayText(runtime?.["backend"], t) },
        { label: t("benchmark.Runtime build"), value: displayText(runtime?.["build"], t) },
        { label: t("benchmark.App version"), value: displayText(benchmark.app_version, t) },
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
        { label: t("benchmark.Allocated context size"), unit: t("benchmark.tokens"), value: displayText(execution?.["context_size"], t) },
        { label: t("benchmark.Parallel requests"), value: displayText(execution?.["parallel"], t) },
        { label: t("benchmark.Threads"), value: displayText(settings?.["threads"], t) },
        { label: t("benchmark.Batch threads"), value: displayText(settings?.["threads_batch"], t) },
        { label: t("benchmark.Graphics layers"), value: displayText(settings?.["gpu_layers"], t) },
        { label: t("benchmark.Flash attention"), value: displayText(settings?.["flash_attention"], t) },
        { label: t("benchmark.KV cache type"), unit: t("benchmark.keys"), value: displayText(settings?.["cache_type_k"], t) },
        { label: t("benchmark.KV cache type"), unit: t("benchmark.values"), value: displayText(settings?.["cache_type_v"], t) },
        { label: t("benchmark.Split mode"), value: displayText(settings?.["split_mode"], t) },
        { label: t("benchmark.Tensor split"), value: joinList(settings?.["tensor_split"], t) },
        // The same launch the fields above summarize, kept whole so a reader can
        // reproduce it. Published without the options that name the publisher's
        // machine, so a model path is absent by contract, not by omission here.
        { label: t("benchmark.llama-server options"), value: describeArguments(execution?.["effective_args"], t), command: true },
      ],
    },
  ];
}

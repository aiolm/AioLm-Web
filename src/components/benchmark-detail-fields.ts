import { formatCpuCores, runtimeVersionLabel } from "./benchmark-explorer-format";
import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";
import { FIXED_OUTPUT_MEASUREMENT, servingScopeOf } from "@/lib/benchmark-discovery";
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
import { recordedSettingPresentation, selectedGpuRecord } from "./benchmark-evidence";
import type { RecordedSetting } from "@aiolm/benchmark-contracts";
import {
  formatMetadataSource,
  formatWeightQuantization,
  huggingFaceLinks,
  huggingFaceUrl,
  isRepositoryId,
  modelDisplayName,
  modelPublisher,
  modelValue,
  readModelInfo,
} from "./benchmark-model-identity";

/** The public `benchmark` object of GET /v1/benchmark-runs/<id>. Every member is unverified input. */
export interface BenchmarkSetup {
  schema_version?: unknown;
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
  identity?: string;
  descriptor?: string;
  description?: string;
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
  notes?: string[];
}

export function buildSetupGroups(benchmark: BenchmarkSetup, t: Translator = benchmarkFallback): SetupGroup[] {
  const model = asRecord(benchmark.model);
  const runtime = asRecord(benchmark.runtime);
  const method = asRecord(benchmark.method);
  const workload = asRecord(benchmark.workload);
  const environment = asRecord(benchmark.environment);
  const execution = asRecord(benchmark.execution);
  const serving = benchmark.schema_version === 3;
  const source = asRecord(model?.["source"]);
  const envExecution = asRecord(environment?.["execution"]);
  const cpu = asRecord(environment?.["cpu"]);
  const settings = asRecord(execution?.["settings"]);
  const info = readModelInfo(model?.["metadata"]);
  const pythonEngine = runtime?.name === "vllm" || runtime?.name === "mlx-vlm";
  const formats: Record<string, string> = { gguf: "GGUF", "hf-safetensors": "safetensors", mlx: "MLX", unknown: t("benchmark.Unknown") };
  const modelFormat = info?.format ?? (typeof model?.format === "string" ? formats[model.format] : undefined);
  const repository = typeof source?.repository === "string" ? source.repository : info?.repository;
  const repositoryUrl = huggingFaceUrl(repository);

  // Model group: key fields shown once; empty optional metadata fields omitted.
  const modelFields: SetupField[] = [
    { label: t("benchmark.Model name"), value: info?.name ? modelDisplayName(info, info.name) : modelValue(null, t) },
    { label: t("benchmark.Repository owner (recorded)"), value: serving && !isRepositoryId(repository) && !modelPublisher(info) ? t("benchmark.Value not recorded") : modelValue(isRepositoryId(repository) ? repository.split("/")[0] : modelPublisher(info), t) },
    { label: t("benchmark.Weight quantization"), value: formatWeightQuantization(info, t) },
  ];
  if (repository || serving) {
    modelFields.push({
      label: t("benchmark.Repository (recorded)"),
      value: repository || t("benchmark.Value not recorded"),
      ...(repository && repositoryUrl ? { links: { [repository]: repositoryUrl } } : {}),
    });
  }
  if (info?.quantized_by || serving) {
    modelFields.push({ label: t("benchmark.Quantized by (recorded)"), value: info?.quantized_by || t("benchmark.Value not recorded") });
  }
  if (info && info.base_models.length > 0) {
    modelFields.push({
      label: t("benchmark.Base model (recorded)"),
      value: info.base_models,
      links: huggingFaceLinks(info.base_models),
    });
  }
  if (info?.artifact) {
    modelFields.push({ label: t("benchmark.Artifact file (recorded)"), value: info.artifact });
  }
  if (info?.architecture) {
    modelFields.push({ label: t("benchmark.Model architecture"), value: info.architecture });
  }
  if (info?.size_label) {
    modelFields.push({ label: t("benchmark.Parameter size"), value: info.size_label });
  }
  if (modelFormat) {
    modelFields.push({ label: t("benchmark.Weights format"), value: modelFormat });
  }
  if (info?.file_type != null) {
    modelFields.push({ label: t("benchmark.Quantization file type"), value: String(info.file_type) });
  }
  if (info?.source) {
    modelFields.push({ label: t("benchmark.Metadata source"), value: formatMetadataSource(info, t) });
  }
  modelFields.push(
    { label: t("benchmark.Model identity"), value: displayText(model?.["status"], t) },
    { label: t("benchmark.Model checksum"), value: serving && model?.sha256 == null ? t("benchmark.Value not recorded") : displayText(model?.["sha256"], t) },
    { label: t("benchmark.Model size"), value: formatByteSize(model?.["size_bytes"], t) },
  );
  if (serving) {
    modelFields.push({ label: t("benchmark.Source revision (recorded)"), value: source?.revision == null ? t("benchmark.Value not recorded") : displayText(source.revision, t) });
  }
  const missingModelFields = [
    [t("benchmark.Model checksum"), model?.sha256], [t("benchmark.Repository (recorded)"), repository],
    [t("benchmark.Source revision (recorded)"), source?.revision], [t("benchmark.Quantized by (recorded)"), info?.quantized_by],
  ].filter(([, value]) => value == null || value === "").map(([label]) => label as string);

  // Installed host inventory and configured execution selection are different facts.
  const physicalCores = typeof cpu?.["physical_cores"] === "number" && cpu["physical_cores"] > 0 ? cpu["physical_cores"] : null;
  const logicalCores = cpu?.["logical_cores"];
  const hardwareFields: SetupField[] = [
    ...(serving ? [{ label: t("benchmark.Environment scope"), value: displayText(environment?.scope, t) }] : []),
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
  if (serving) {
    hardwareFields.push({
      label: t("benchmark.Installed host GPUs"),
      value: describeGpuList(environment?.installed_gpus, t),
      devices: describeGpuDetails(environment?.installed_gpus, t),
    });
  }
  hardwareFields.push(
    { label: t("benchmark.Run mode"), value: displayText(envExecution?.["mode"], t) },
    { label: t("benchmark.Selected graphics"), value: serving ? selectedGpuRecord(Array.isArray(envExecution?.selected_gpus) ? envExecution.selected_gpus.map(gpu => displayText(asRecord(gpu)?.name, t)) : undefined, envExecution?.mode, envExecution?.selection_complete, t) : describeGpuList(envExecution?.["selected_gpus"], t), devices: describeGpuDetails(envExecution?.["selected_gpus"], t), ...(serving && envExecution?.selection_complete === false && Array.isArray(envExecution?.selected_gpus) && envExecution.selected_gpus.length ? { description: t("benchmark.Incomplete selection record") } : {}) },
    { label: t(serving ? "benchmark.Selection record complete" : "benchmark.Graphics selection complete"), value: displayText(envExecution?.["selection_complete"], t) },
  );

  return [
    {
      id: "detail-setup-model",
      title: t("benchmark.Model"),
      fields: modelFields,
      ...(serving ? { notes: [
        ...(missingModelFields.length ? [t("benchmark.Not recorded: {fields}. Names and quantization labels do not establish this evidence.", { fields: missingModelFields.join(", ") })] : []),
        t("benchmark.Source repository and revision describe provenance, not the weights SHA256 or proof of unmodified weights."),
      ] } : {}),
    },
    {
      id: "detail-setup-hardware",
      title: t("benchmark.Hardware"),
      fields: hardwareFields,
      ...(serving ? { notes: [t("benchmark.Installed host GPUs do not establish execution selection or layer placement. System RAM is not dedicated VRAM.")] } : {}),
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
        { label: t("benchmark.Runtime version"), value: displayText(serving ? runtime?.version : runtimeVersionLabel(runtime), t) },
        ...(serving ? [
          { label: t("benchmark.Runtime variant"), value: runtime?.variant == null ? t("benchmark.Not recorded; applicability not declared") : displayText(runtime.variant, t) },
          { label: t("benchmark.Runtime build"), value: displayText(runtime?.build, t) },
          { label: t("benchmark.Runtime plugin version"), value: runtime?.plugin_version == null ? t("benchmark.Not recorded; applicability not declared") : displayText(runtime.plugin_version, t) },
        ] : []),
        { label: t("benchmark.Runtime backend"), value: serving && runtime?.backend == null ? t("benchmark.Backend identity not recorded") : displayText(runtime?.["backend"], t) },
        { label: t("benchmark.App version"), value: displayText(benchmark.app_version, t) },
      ],
    },
    {
      id: "detail-setup-workload",
      title: t("benchmark.Workload and method"),
      fields: serving ? [
        { label: t("benchmark.Method"), value: displayText(method?.id, t) },
        { label: t("benchmark.Method version"), value: displayText(method?.version, t) },
        { label: t("benchmark.Corpus"), value: displayText(workload?.corpus, t) },
        { label: t("benchmark.Corpus version"), value: displayText(workload?.corpus_version, t) },
        { label: t("benchmark.Input UTF-8 bytes and SHA256"), value: Array.isArray(workload?.inputs) ? workload.inputs.map((input) => {
          const item = asRecord(input);
          return `${displayText(item?.bytes, t)} B · ${displayText(item?.sha256, t)}`;
        }) : displayText(null, t) },
        { label: t(servingScopeOf(method) === FIXED_OUTPUT_MEASUREMENT ? "benchmark.fixedOutputTokens" : "benchmark.Maximum output token request"), unit: t("benchmark.tokens"), value: displayText(workload?.max_output_tokens, t) },
        { label: t("benchmark.Concurrency"), value: joinList(workload?.concurrencies, t) },
        { label: t("benchmark.Repetitions"), value: displayText(workload?.repetitions, t) },
        { label: t("benchmark.Warmup"), value: displayText(workload?.warmup, t) },
        { label: t("benchmark.Request usage"), value: displayText(workload?.request_usage, t) },
        { label: t("benchmark.Cache policy"), value: displayText(workload?.cache_policy, t) },
      ] : [
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
      ...(serving ? { notes: [t("benchmark.No role means no common semantic role was assigned, not a missing setting value. No unit specified means the publication supplied no unit.")] } : {}),
      fields: serving ? [
        { label: t("benchmark.Execution topology"), value: displayText(execution?.topology, t) },
        { label: t("benchmark.Memory scope"), value: displayText(execution?.memory_scope, t) },
        ...recordedSettingFields(execution?.settings, t),
      ] : [
        { label: t(pythonEngine ? "benchmark.Per-sequence context allocation" : "benchmark.Allocated context size"), unit: t("benchmark.tokens"), value: displayText(execution?.["context_size"], t) },
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
        { label: t(pythonEngine ? "benchmark.Engine launch options" : "benchmark.llama-server options"), value: describeArguments(execution?.["effective_args"], t), command: true },
      ],
    },
  ];
}

/** Preserve typed values; optional descriptor metadata is not a missing value. */
function recordedSettingFields(value: unknown, t: Translator): SetupField[] {
  if (!Array.isArray(value) || value.length === 0) return [{ label: t("benchmark.Recorded settings"), value: t("benchmark.None reported") }];
  return value.map((entry) => {
    const setting = entry as RecordedSetting;
    if (!setting || !Array.isArray(setting.scope)) return { label: t("benchmark.Recorded settings"), value: t("benchmark.Value not recorded") };
    return recordedSettingPresentation(setting, t);
  });
}

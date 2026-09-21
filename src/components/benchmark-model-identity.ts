import type { Translator } from "@/i18n/types";
import { benchmarkFallback } from "./benchmark-i18n";
import { asRecord } from "./benchmark-detail-format";

/**
 * Who published a set of weights, who quantized them, and which file was run.
 *
 * The public contract publishes this as optional model metadata, so every field
 * can be absent and an absent field is reported as unknown rather than guessed.
 * Two rules from the contract are enforced here rather than left to each caller:
 * the distributor is read from the repository namespace and from nothing else,
 * and `quantized_by` is a separate fact that never stands in for it. Neither the
 * format nor the quantization says anything about output quality; they describe
 * the weights in the published file, not the KV cache and not the model.
 */

/** Optional model metadata as the summary and the public submission publish it. */
export interface BenchmarkModelInfo {
  format: string | null;
  name: string | null;
  architecture: string | null;
  size_label: string | null;
  quantization: string | null;
  file_type: number | null;
  quantized_by: string | null;
  /** Hugging Face `namespace/repo`, never a URL and never a local path. */
  repository: string | null;
  base_models: string[];
  /** Repository-relative `.gguf` path taken from the download receipt. */
  artifact: string | null;
  source: string | null;
  sha256: string | null;
  identity_status: string | null;
}

/** At most eight base models are published; anything beyond that is not shown. */
const BASE_MODEL_LIMIT = 8;

/** Repository id component: ASCII, starts alphanumeric. `..` is rejected separately. */
const REPOSITORY_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function wholeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/**
 * Model metadata out of an untrusted payload. A member of the wrong type is
 * dropped to null instead of being rendered, so a malformed publication reads
 * as unknown rather than as whatever it happened to contain.
 */
export function readModelInfo(value: unknown): BenchmarkModelInfo | null {
  const info = asRecord(value);
  if (!info) return null;
  return {
    format: text(info["format"]),
    name: text(info["name"]),
    architecture: text(info["architecture"]),
    size_label: text(info["size_label"]),
    quantization: text(info["quantization"]),
    file_type: wholeNumber(info["file_type"]),
    quantized_by: text(info["quantized_by"]),
    repository: text(info["repository"]),
    base_models: (Array.isArray(info["base_models"]) ? info["base_models"] : [])
      .map(text)
      .filter((entry): entry is string => entry !== null)
      .slice(0, BASE_MODEL_LIMIT),
    artifact: text(info["artifact"]),
    source: text(info["source"]),
    sha256: text(info["sha256"]),
    identity_status: text(info["identity_status"]),
  };
}

/** A repository id we are willing to turn into a public link. */
export function isRepositoryId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // The contract rejects `..` anywhere: traversal must not become a link.
  if (value.includes("..")) return false;
  const parts = value.split("/");
  return parts.length === 2 && parts.every((part) => REPOSITORY_COMPONENT.test(part));
}

/**
 * The distributor, which is the repository namespace and nothing else. GGUF's
 * own `general.quantized_by` names whoever produced the weights file, and that
 * is regularly not the account the file was downloaded from, so it is reported
 * on its own. A result with no repository has no distributor to report.
 */
export function modelPublisher(info: BenchmarkModelInfo | null): string | null {
  return isRepositoryId(info?.repository) ? (info.repository.split("/")[0] ?? null) : null;
}

/** Public source page for a reported repository, or null when it is not a usable id. */
export function huggingFaceUrl(repository: unknown): string | null {
  return isRepositoryId(repository) ? `https://huggingface.co/${repository}` : null;
}

/** Links for the repository ids in a list, keyed by the id as it is displayed. */
export function huggingFaceLinks(repositories: readonly string[]): Record<string, string> {
  const links: Record<string, string> = {};
  for (const repository of repositories) {
    const url = huggingFaceUrl(repository);
    if (url) links[repository] = url;
  }
  return links;
}

/** A published value, or the localized unknown. Never a blank cell. */
export function modelValue(value: string | number | null | undefined, t: Translator = benchmarkFallback): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : t("benchmark.Unknown");
  return value === null || value === undefined || value.trim() === "" ? t("benchmark.Unknown") : value;
}

/**
 * The quantization of the weights. An enum the contract does not know stays
 * unnamed and keeps its raw file type number, because naming it from the number
 * would be a guess and naming it from the file name is forbidden outright.
 */
export function formatWeightQuantization(info: BenchmarkModelInfo | null, t: Translator = benchmarkFallback): string {
  if (info?.quantization) return info.quantization;
  if (typeof info?.file_type === "number") return t("benchmark.Unknown (file type {value})", { value: info.file_type });
  return t("benchmark.Unknown");
}

/**
 * Where the reported metadata came from, in words rather than the raw enum.
 * The contract publishes `gguf`, `huggingface` or `gguf+huggingface`; anything
 * else, including an absent source, reads as unknown rather than as raw text.
 */
export function formatMetadataSource(info: BenchmarkModelInfo | null, t: Translator = benchmarkFallback): string {
  if (info?.source === "gguf") return t("benchmark.GGUF file");
  if (info?.source === "huggingface") return t("benchmark.Hugging Face");
  if (info?.source === "gguf+huggingface") return t("benchmark.GGUF file and Hugging Face");
  return t("benchmark.Unknown");
}

/** Reported base models. An empty list means none was recorded, not that there is none. */
export function formatBaseModels(info: BenchmarkModelInfo | null, t: Translator = benchmarkFallback): string {
  const models = info?.base_models ?? [];
  return models.length === 0 ? t("benchmark.Unknown") : models.join(", ");
}

/**
 * What pins a result to one weights file: its full checksum, and only when the
 * recorded identity says that checksum was verified. A repository and artifact
 * alone cannot prove identical weights because the same path can change across
 * revisions, so a result without a verified hash has no identity to compare,
 * which is itself worth saying.
 */
export function modelArtifactKey(info: BenchmarkModelInfo | null): string | null {
  if (info?.identity_status === "sha256" && typeof info?.sha256 === "string" && /^[a-f0-9]{64}$/.test(info.sha256)) {
    return `sha256:${info.sha256}`;
  }
  return null;
}

export interface ModelIdentityComparison {
  /** Every selection names the same weights file. */
  same: boolean;
  /** At least one selection does not say which file it ran. */
  unknown: boolean;
}

/**
 * Whether the picked results ran the same weights file. This is about the file,
 * not the model: two results can carry the same model name and still have run
 * different quantizations of it, and the panel says so instead of letting the
 * names imply the numbers are interchangeable.
 */
export function modelIdentityComparison(infos: ReadonlyArray<BenchmarkModelInfo | null>): ModelIdentityComparison {
  const keys = infos.map(modelArtifactKey);
  return {
    same: new Set(keys.filter((key): key is string => key !== null)).size <= 1,
    unknown: keys.some((key) => key === null),
  };
}

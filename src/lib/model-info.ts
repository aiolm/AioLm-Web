import type { BenchmarkModelMetadata, PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";

/**
 * Public model metadata carried on a summary.
 *
 * Contract 0.3.0 added an OPTIONAL model.metadata block and schema_version
 * stays 1, so a payload without one stays valid. Everything here is either copied
 * from that block after validation or derived from the recorded identity; the
 * publisher comes ONLY from the repository namespace, and nothing is ever
 * parsed out of a filename or a curated label. A field that fails validation is
 * null - unknown - rather than a guess.
 *
 * Format and quantization describe the model weights. They say nothing about
 * the KV cache (setup.cache_type_k/v) and are not a quality claim.
 */
export type BenchmarkModelInfo = {
  format: "GGUF" | "hf-safetensors" | "mlx" | "unknown";
  name: string | null;
  architecture: string | null;
  size_label: string | null;
  quantization: string | null;
  file_type: number | null;
  quantized_by: string | null;
  /** Hugging Face namespace/repo only, never a URL or a local path. */
  repository: string | null;
  /** Inspected source revision, never a replacement for the weight SHA. */
  revision?: string | null;
  base_models: string[];
  /** Repo-relative .gguf artifact from a file-matched public origin. */
  artifact: string | null;
  source: "gguf" | "huggingface" | "gguf+huggingface" | null;
  /**
   * Hugging Face namespace of `repository`, the only publisher evidence a
   * submission carries. GGUF general.quantized_by is who quantized the weights,
   * which is a different party, so it is never read as a publisher.
   */
  publisher: string | null;
  sha256: string | null;
  identity_status: string;
};

/** Display labels: bounded, single-line, and free of identifier punctuation. */
const LABEL = /^[^/\\:@\u0000-\u001f\u007f]{1,256}$/;
/** namespace/repo, each component ASCII-safe, starting alphanumeric, at most 128 characters. */
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/**
 * Repo-relative .gguf path, spelled as the contract schema spells it: every
 * segment starts alphanumeric, so traversal, backslashes, drive letters,
 * user@host, control characters and absolute paths are all excluded by shape.
 */
const ARTIFACT = /^(?:[A-Za-z0-9][A-Za-z0-9._ -]{0,127}\/)*[A-Za-z0-9][A-Za-z0-9._ -]*\.[gG][gG][uU][fF]$/;
const SOURCES = ["gguf", "huggingface", "gguf+huggingface"] as const;

function label(value: unknown): string | null {
  return typeof value === "string" && LABEL.test(value) ? value : null;
}
function repository(value: unknown): string | null {
  return typeof value === "string" && REPOSITORY.test(value) && !value.includes("..") ? value : null;
}
function artifact(value: unknown): string | null {
  return typeof value === "string" && value.length <= 512 && ARTIFACT.test(value) ? value : null;
}
function fileType(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65535 ? value : null;
}
/** First occurrence wins, duplicates collapse, and the contract's cap of 8 is enforced here too. */
function baseModels(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(repository).filter((v): v is string => v !== null))].slice(0, 8) : [];
}

function modelSource(value: unknown): { repository: string; revision: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const source = value as { kind?: unknown; repository?: unknown; revision?: unknown };
  const repo = repository(source.repository);
  return source.kind === "huggingface" && repo !== null &&
    typeof source.revision === "string" && /^[a-f0-9]{40}$/.test(source.revision)
    ? { repository: repo, revision: source.revision } : null;
}

/**
 * Summary model metadata for a submission, or null when it carries none that
 * survives validation. Callers treat null as unknown: a run whose weights were
 * never described stays explicitly unidentified instead of borrowing a guess.
 */
export function normalizeModelInfo(benchmark: PublicBenchmarkSubmission): BenchmarkModelInfo | null {
  const model = benchmark.model;
  const source = benchmark.schema_version === 3 ? modelSource(benchmark.model.source) : null;
  const format = benchmark.schema_version === 1 ? "gguf" : model.format;
  const meta: unknown = model.metadata;
  const m = format === "gguf" && typeof meta === "object" && meta !== null &&
    !Array.isArray(meta) && (meta as Partial<BenchmarkModelMetadata>).format === "GGUF"
    ? meta as Partial<BenchmarkModelMetadata> : null;
  if (!m && !source) return null;
  const repo = source?.repository ?? repository(m?.repository);
  const metadataSource = SOURCES.find((known) => known === m?.source) ?? null;
  const provenanceSource = source ? (m ? "gguf+huggingface" : "huggingface") : metadataSource;
  // An artifact remains evidence from the GGUF metadata block, not a source-repo guess.
  const metadataOrigin = repo !== null && repository(m?.repository) === repo &&
    (metadataSource === "huggingface" || metadataSource === "gguf+huggingface");
  return {
    format: format === "gguf" ? "GGUF" : format ?? "unknown",
    name: label(m?.name),
    architecture: label(m?.architecture),
    size_label: label(m?.size_label),
    quantization: label(m?.quantization),
    file_type: fileType(m?.file_type),
    quantized_by: label(m?.quantized_by),
    repository: repo,
    ...(benchmark.schema_version === 3 ? { revision: source?.revision ?? null } : {}),
    base_models: baseModels(m?.base_models),
    artifact: metadataOrigin ? artifact(m?.artifact) : null,
    source: provenanceSource,
    publisher: repo === null ? null : repo.split("/")[0],
    // Identity is not metadata: the contract schema already constrains status to
    // its enum and sha256 to lowercase hex, so both are echoed exactly as recorded.
    sha256: model.sha256,
    identity_status: model.status,
  };
}

/**
 * Public label for a NEW submission. A described model is named by its own
 * metadata; everything else keeps the existing hash-or-status label, so a run
 * without metadata still reads exactly as it did before.
 */
/** Name presentation is separate from weight identity: never derive quantization here. */
export function cleanModelName(value: string): string {
  const withoutExtension = value.replace(/\.gguf$/i, "");
  const cleaned = withoutExtension.replace(/[-_. ](?:UD[-_])?(?:IQ[1-4]_[A-Z0-9_]+|Q[2-8]_[A-Z0-9_]+|BF16|FP16|F16|FP32|F32)$/i, "");
  return cleaned || withoutExtension;
}

export function modelLabelFor(benchmark: PublicBenchmarkSubmission, info: BenchmarkModelInfo | null): string {
  if (info?.name) {
    const name = cleanModelName(info.name);
    // A declared base name may normalize spelling only when it describes the
    // entire recorded name; a fine-tune's identity must never be replaced by its parent.
    const compact = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
    const base = info.base_models.length === 1 ? info.base_models[0].split("/").at(-1) : undefined;
    if (base && compact(name) === compact(info.base_models[0])) return cleanModelName(base);
    return name;
  }
  if (info?.repository) return info.repository;
  return benchmark.model.status === "sha256" && benchmark.model.sha256
    ? `sha256:${benchmark.model.sha256.slice(0, 12)}`
    : benchmark.model.status;
}

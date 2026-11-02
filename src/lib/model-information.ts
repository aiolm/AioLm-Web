/** Later catalog evidence; never a replacement for the frozen benchmark payload. */
export interface ModelInformationEvidence {
  sha256: string | null;
  size_bytes: number | null;
  name: string | null;
  repository: string | null;
  format: string | null;
}

export interface HuggingFaceFileMatch {
  repository: string;
  revision: string;
  artifact: string;
  sha256: string;
  size_bytes: number;
  /** The repository namespace, not a claim about authorship or the download origin. */
  repository_owner: string;
  /** Declarations from the model card at this exact revision. */
  base_models: string[];
  licenses: string[];
  license_name: string | null;
  /** Only an explicit card declaration, never inferred from the namespace. */
  quantized_by: string | null;
  model_card_url: string;
  artifact_url: string;
}

export interface HuggingFaceModelInformation {
  status: "matched" | "unidentified" | "not_found" | "unavailable";
  reason: "missing_checksum" | "missing_size" | "missing_hint" | null;
  match_basis: "recorded_sha256_and_size";
  sha256: string | null;
  size_bytes: number | null;
  /** Lookup time, not measurement time or the original download time. */
  checked_at: string | null;
  /** Every returned file independently matches both recorded hash and byte size. */
  matches: HuggingFaceFileMatch[];
}

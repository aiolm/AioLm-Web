import encodings from "./weight-encodings.json";

/** Nominal weight encoding families, not average stored bits/weight or KV-cache precision.
 * GGUF general.file_type uses llama_ftype, NOT ggml_type (whose numbers differ).
 * Source: https://github.com/ggml-org/llama.cpp/blob/master/include/llama.h
 * Exact codes only: no filename parsing, AWQ/GPTQ defaults, or guessed file types.
 * IQ1 and ternary TQ formats are not rounded into an integer bit family.
 */
export const WEIGHT_BIT_VALUES = [1, 2, 3, 4, 5, 6, 8, 16, 32] as const;
const labels = new Map(encodings.flatMap(row => row.labels.map(label => [label, row.bits] as const)));
const fileTypes = new Map(encodings.map(row => [row.file_type, row.bits]));
const fractionalLabels = new Set(["IQ1_S", "IQ1_M", "TQ1_0", "TQ2_0"]);
const fractionalFileTypes = new Set([24, 31, 36, 37]);

export function isWeightBitValue(value: unknown): value is number {
  return typeof value === "number" && (WEIGHT_BIT_VALUES as readonly number[]).includes(value);
}

export function weightBits(info: unknown): number | null {
  if (!info || typeof info !== "object" || Array.isArray(info)) return null;
  const m = info as Record<string, unknown>;
  if (m.format !== "GGUF") return null;
  // LLAMA_FTYPE_GUESSED is explicitly not recorded in the file.
  if (typeof m.file_type === "number" && m.file_type >= 1024) return null;
  const label = typeof m.quantization === "string" ? m.quantization.replace(/^ +| +$/g, "").toUpperCase() : "";
  if (fractionalLabels.has(label) || typeof m.file_type === "number" && fractionalFileTypes.has(m.file_type)) return null;
  const byLabel = labels.get(label);
  const byFile = typeof m.file_type === "number" ? fileTypes.get(m.file_type) : undefined;
  if (byLabel !== undefined && byFile !== undefined && byLabel !== byFile) return null;
  return byFile ?? byLabel ?? null;
}

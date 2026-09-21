/**
 * Publication/benchmark validation — re-exported from the versioned packed
 * artifact, never duplicated here. The website must not carry an independent
 * copy of the shared contract.
 *
 * Artifact: vendor/aiolm-benchmark-contracts-0.5.0.tgz
 * (from AioLM tmp/sharing-contracts-release, integrity-pinned in package-lock.json)
 */
export {
  DESCRIPTION_MAX_CODEPOINTS,
  PUBLICATION_MAX_ROWS,
  PUBLICATION_MAX_UTF8_BYTES,
  countCodePoints,
  utf8ByteLength,
  validateDescriptionMd,
  normalizePublicationInput,
  validatePublicationRequest,
  serializePublicationRequest,
  parsePublicationSnapshot,
  validatePublicBenchmark,
  validateBenchmarkReceipt as validateContractReceipt,
  type BenchmarkPublicationRequest,
  type BenchmarkPublicationInput,
  type PublicBenchmarkSubmission,
  type PublicBenchmarkRow,
  type BenchmarkReceipt,
} from "@aiolm/benchmark-contracts";

import { utf8ByteLength as utf8Len, validateBenchmarkReceipt as validateReceipt } from "@aiolm/benchmark-contracts";
import type { BenchmarkReceipt as Receipt } from "@aiolm/benchmark-contracts";

export const REPORT_REASON_MAX_CHARS = 2000;

/** Receipt validation plus the 16KiB transport bound (receipt shape itself is the shared contract). */
export function validateBenchmarkReceipt(value: unknown, expectedSubmissionId?: string): Receipt {
  const receipt = validateReceipt(value, expectedSubmissionId);
  if (utf8Len(JSON.stringify(receipt)) > 16 * 1024) throw new Error("Receipt exceeds 16KiB.");
  return receipt;
}

export function validateReportReason(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Report reason is required.");
  if (value.length > REPORT_REASON_MAX_CHARS) throw new Error("Report reason exceeds 2000 characters.");
  return value;
}

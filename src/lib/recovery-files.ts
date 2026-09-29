import { RECOVERY_MAX_FILE_BYTES, decodeRecoveryCode, normalizeServiceOrigin } from "./recovery";

/**
 * Local status of one picked recovery file. `rejected` and `gone` are set
 * later from the service answer when the entry is opened.
 */
export type RecoveryFileStatus = "ready" | "invalid" | "too_large" | "wrong_service" | "duplicate" | "rejected" | "gone";

export interface RecoveryFileEntry {
  key: string;
  name: string;
  /** File modification time (ms) as reported by the browser. */
  savedAt: number;
  status: RecoveryFileStatus;
  submissionId: string | null;
  /** The recovery code itself; present only for `ready` entries and never rendered. */
  code: string | null;
  /** Filled in once a management session for this entry has been opened. */
  publicId: string | null;
}

export interface RecoveryFileLike {
  name: string;
  size: number;
  lastModified: number;
  text(): Promise<string>;
}

/**
 * Validate picked recovery files entirely in the browser, so malformed,
 * oversized, foreign or duplicate files never reach the service (and never
 * consume the invalid-attempt budget). Oversized files are rejected before
 * they are read. New entries are appended after `existing`; a submission that
 * is already listed as usable is marked as a duplicate.
 */
export async function readRecoveryFiles(
  files: readonly RecoveryFileLike[],
  serviceOrigin: string,
  existing: readonly RecoveryFileEntry[] = [],
): Promise<RecoveryFileEntry[]> {
  const origin = normalizeOrigin(serviceOrigin);
  const seen = new Set(existing.filter((e) => e.code !== null).map((e) => e.submissionId));
  const entries: RecoveryFileEntry[] = [];
  for (const [index, file] of files.entries()) {
    const base = { key: `${existing.length + index}:${file.name}`, name: file.name, savedAt: file.lastModified, publicId: null };
    if (file.size > RECOVERY_MAX_FILE_BYTES) {
      entries.push({ ...base, status: "too_large", submissionId: null, code: null });
      continue;
    }
    let code: string;
    let payload: ReturnType<typeof decodeRecoveryCode>;
    try {
      code = (await file.text()).trim();
      payload = decodeRecoveryCode(code);
    } catch {
      entries.push({ ...base, status: "invalid", submissionId: null, code: null });
      continue;
    }
    if (payload.origin !== origin) {
      entries.push({ ...base, status: "wrong_service", submissionId: payload.submission_id, code: null });
    } else if (seen.has(payload.submission_id)) {
      entries.push({ ...base, status: "duplicate", submissionId: payload.submission_id, code: null });
    } else {
      seen.add(payload.submission_id);
      entries.push({ ...base, status: "ready", submissionId: payload.submission_id, code });
    }
  }
  return [...existing, ...entries];
}

function normalizeOrigin(value: string): string | null {
  try {
    return normalizeServiceOrigin(value);
  } catch {
    return null;
  }
}

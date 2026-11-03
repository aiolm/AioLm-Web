/**
 * Owner recovery encoding — re-exported from the versioned packed artifact
 * selected in package.json and integrity-pinned in package-lock.json. No independent copy here.
 */
export {
  RECOVERY_PREFIX,
  RECOVERY_MAX_FILE_BYTES,
  RECOVERY_FIXTURE,
  base64UrlEncode,
  base64UrlDecode,
  normalizeServiceOrigin,
  decodeRecoveryCode,
  encodeRecoveryCode,
  type BenchmarkRecoveryPayload,
} from "@aiolm/benchmark-contracts";

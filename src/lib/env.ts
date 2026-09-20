import { normalizeServiceOrigin } from "@aiolm/benchmark-contracts";

/**
 * Deployment configuration. Missing security-critical values fail closed:
 * routes return 503 instead of operating with unsafe defaults. In particular,
 * a missing SERVICE_ORIGIN in production never emits localhost links.
 */

export function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

/** Public service origin (canonical root origin). Production requires explicit configuration. */
export function getServiceOrigin(): string {
  const raw = process.env["SERVICE_ORIGIN"];
  if (!raw) {
    if (isProduction()) throw new Error("SERVICE_ORIGIN is not configured.");
    return "http://localhost:3000";
  }
  // Shared root-origin validation: rejects credentials, non-root paths,
  // query/fragment, and non-HTTPS origins except explicit debug loopback.
  // Throws fail-closed on misconfiguration.
  const origin = normalizeServiceOrigin(raw);
  // normalizeServiceOrigin's one-argument API deliberately allows the HTTP
  // debug loopback, which is only ever acceptable in development/test.
  // Production additionally requires HTTPS.
  if (isProduction() && !origin.startsWith("https://")) {
    throw new Error("SERVICE_ORIGIN must use HTTPS in production.");
  }
  return origin;
}

export interface QuotaConfig {
  perIpHour: number;
  perIpDay: number;
  globalDay: number;
  globalBytesDay: number;
  globalRowsDay: number;
  sessionCreatePerMinIp: number;
  invalidManagePerMinIp: number;
  reportPerHourIp: number;
}

export function quotaConfigFromEnv(): QuotaConfig {
  const num = (key: string, fallback: number): number => {
    const raw = process.env[key];
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0 ? n : fallback;
  };
  return {
    perIpHour: num("QUOTA_PER_IP_HOUR", 20),
    perIpDay: num("QUOTA_PER_IP_DAY", 100),
    globalDay: num("QUOTA_GLOBAL_DAY", 1000),
    globalBytesDay: num("QUOTA_GLOBAL_BYTES_DAY", 64 * 1024 * 1024),
    globalRowsDay: num("QUOTA_GLOBAL_ROWS_DAY", 250_000),
    sessionCreatePerMinIp: num("QUOTA_SESSION_CREATE_PER_MIN_IP", 5),
    invalidManagePerMinIp: num("QUOTA_INVALID_MANAGE_PER_MIN_IP", 10),
    reportPerHourIp: num("QUOTA_REPORT_PER_HOUR_IP", 3),
  };
}

export interface CapacityConfig {
  bytes: number | null;
  rows: number | null;
  /** Production with no provisioned capacity fails closed for new inserts. */
  strictMissing: boolean;
}

function positiveNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function capacityConfigFromEnv(): CapacityConfig {
  return {
    bytes: positiveNumber(process.env["PROVISIONED_BYTES"]),
    rows: positiveNumber(process.env["PROVISIONED_ROWS"]),
    strictMissing: isProduction(),
  };
}

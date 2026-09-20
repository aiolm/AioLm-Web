import { createHmac } from "node:crypto";

/**
 * Client IP extraction. Trust the managed host's controlled header only;
 * local synthetic traffic uses an explicit separate adapter (never the same header).
 */
export function getClientIp(headers: Headers): string | null {
  // Vercel controlled header.
  const vercelIp = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;
  const realIp = headers.get("x-real-ip")?.trim();
  // Only honored when explicitly marked as synthetic test traffic; production
  // deployments must not set SYNTHETIC_TEST_MODE.
  if (process.env["SYNTHETIC_TEST_MODE"] === "1" && process.env["NODE_ENV"] === "test") {
    const synthetic = headers.get("x-synthetic-test-ip")?.trim() || realIp;
    if (synthetic) return synthetic;
  }
  return null;
}

/** HMAC(ip) quota key material: raw IP is never persisted by the app. */
export function quotaKeyForIp(quotaSecret: string, ip: string, scope: string, window: string): string {
  return createHmac("sha256", quotaSecret).update(`v1|${scope}|${window}|${ip}`, "utf8").digest("hex");
}

export function quotaWindowHour(nowMs: number): string {
  const d = new Date(nowMs);
  d.setMinutes(0, 0, 0);
  return `h:${d.toISOString()}`;
}

export function quotaWindowDay(nowMs: number): string {
  return `d:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

export function quotaWindowMinute(nowMs: number): string {
  const d = new Date(nowMs);
  d.setSeconds(0, 0);
  return `m:${d.toISOString()}`;
}

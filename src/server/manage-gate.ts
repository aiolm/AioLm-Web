import { quotaConfigFromEnv } from "@/lib/env";
import { serviceError } from "@/lib/errors";
import { getClientIp, quotaKeyForIp, quotaWindowMinute } from "@/lib/ip";
import type { BenchmarkStore } from "@/server/repository";

/**
 * Invalid-attempt budget shared by every path that turns a secret into a
 * management session (recovery codes and app handoffs): 10/min/IP by default,
 * atomic, 429 + Retry-After, failing CLOSED when it cannot be enforced.
 */
export interface InvalidManageGate {
  key: string;
  windowMs: number;
  limit: number;
}

/** Quota context for the invalid-attempt budget; null when IP/quota secrets are unavailable. */
export function invalidManageGate(request: Request): InvalidManageGate | null {
  const quotaSecret = process.env["QUOTA_HMAC_SECRET"] ?? null;
  const ip = getClientIp(request.headers);
  if (!ip || !quotaSecret) return null;
  const config = quotaConfigFromEnv();
  return {
    key: quotaKeyForIp(quotaSecret, ip, "invalid-manage", quotaWindowMinute(Date.now())),
    windowMs: 60_000,
    limit: config.invalidManagePerMinIp,
  };
}

/** Structured fail-closed answer when the invalid-attempt budget cannot be enforced. */
export function abuseProtectionUnavailable(): Response {
  return serviceError(503, "service_unavailable", "Abuse protection is unavailable.", 60);
}

/** Structured, detail-free answer when the management store cannot be reached. */
export function managementUnavailable(): Response {
  return serviceError(503, "service_unavailable", "Management is temporarily unavailable.", 60);
}

/**
 * Record one invalid attempt atomically, then answer. Budget overflow answers
 * 429 + Retry-After; a quota store that errors answers 503 rather than letting
 * the unaccounted attempt through.
 */
export async function chargeInvalid(
  store: BenchmarkStore,
  gate: InvalidManageGate,
  onAllowed: () => Response,
): Promise<Response> {
  let result: { allowed: boolean; retryAfterSec: number };
  try {
    result = await store.quotaGateAtomic(gate.key, gate.windowMs, gate.limit);
  } catch {
    return abuseProtectionUnavailable();
  }
  if (!result.allowed) {
    return serviceError(429, "rate_limited", "Too many attempts. Try again shortly.", result.retryAfterSec);
  }
  return onAllowed();
}

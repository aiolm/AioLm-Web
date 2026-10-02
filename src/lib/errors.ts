/** Machine-readable service errors: {error:{code,message}} plus Retry-After for 429/503. */

export {
  RECOVERABLE_SERVICE_ERRORS as RECOVERABLE_CODES,
  TERMINAL_SERVICE_ERRORS as TERMINAL_CODES,
  isRecoverableServiceCode as isRecoverable,
  isTerminalServiceCode as isTerminal,
} from "@aiolm/benchmark-contracts";

export function serviceError(status: number, code: string, message: string, retryAfterSec?: number): Response {
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
  if (retryAfterSec !== undefined && (status === 429 || status === 503)) {
    headers["retry-after"] = String(retryAfterSec);
  }
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers });
}

export function rateLimited(message: string, retryAfterSec: number): Response {
  return serviceError(429, "rate_limited", message, retryAfterSec);
}
export function unavailable(message: string, retryAfterSec = 60): Response {
  return serviceError(503, "service_unavailable", message, retryAfterSec);
}

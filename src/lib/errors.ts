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

export function badRequest(code: string, message: string): Response {
  return serviceError(400, code, message);
}
export function unauthorized(code: string, message: string): Response {
  return serviceError(401, code, message);
}
export function forbidden(code: string, message: string): Response {
  return serviceError(403, code, message);
}
export function notFound(code = "not_found", message = "Not found."): Response {
  return serviceError(404, code, message);
}
export function conflict(code: string, message: string): Response {
  return serviceError(409, code, message);
}
export function gone(code: string, message: string): Response {
  return serviceError(410, code, message);
}
export function rateLimited(message: string, retryAfterSec: number): Response {
  return serviceError(429, "rate_limited", message, retryAfterSec);
}
export function payloadTooLarge(message: string): Response {
  return serviceError(413, "payload_too_large", message);
}
export function unavailable(message: string, retryAfterSec = 60): Response {
  return serviceError(503, "service_unavailable", message, retryAfterSec);
}

/**
 * Cloudflare Turnstile server verification via siteverify.
 * Checks hostname/action benchmark_publish or benchmark_report and token
 * single-use/expiry semantics are enforced by Cloudflare; the expected
 * hostname is explicitly configured and required (fail closed), and the
 * siteverify call carries a bounded timeout. Synthetic tests use explicit
 * fixtures and never run in production.
 */
export interface TurnstileResult {
  ok: boolean;
  hostname?: string;
  action?: string;
  errorCodes?: string[];
}

const SITEVERIFY_TIMEOUT_MS = 8000;

export async function verifyTurnstileToken(args: {
  token: string;
  expectedAction: string;
}): Promise<TurnstileResult> {
  if (process.env["SYNTHETIC_TEST_MODE"] === "1" && process.env["NODE_ENV"] === "test") {
    if (args.token === (process.env["TEST_FIXTURE_TURNSTILE_TOKEN"] ?? "test-turnstile-ok")) {
      const hostname = process.env["TURNSTILE_EXPECTED_HOSTNAME"] ?? "test-host";
      return { ok: true, hostname, action: args.expectedAction };
    }
    return { ok: false, errorCodes: ["invalid-input-response"] };
  }
  const secret = process.env["TURNSTILE_SECRET_KEY"];
  const expectedHostname = process.env["TURNSTILE_EXPECTED_HOSTNAME"];
  if (!secret || !expectedHostname) {
    throw new Error("Turnstile verification is not configured.");
  }
  let res: Response;
  try {
    res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: args.token }),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, errorCodes: ["siteverify-unreachable"] };
  }
  if (!res.ok) return { ok: false, errorCodes: ["siteverify-unreachable"] };
  const data = (await res.json()) as {
    success?: boolean; hostname?: string; action?: string; "error-codes"?: string[];
  };
  if (!data.success) return { ok: false, errorCodes: data["error-codes"] ?? ["invalid-input-response"] };
  if (data.action !== args.expectedAction) return { ok: false, errorCodes: ["action-mismatch"] };
  if (data.hostname !== expectedHostname) return { ok: false, errorCodes: ["hostname-mismatch"] };
  return { ok: true, hostname: data.hostname, action: data.action };
}

import { normalizeServiceOrigin } from "@aiolm/benchmark-contracts";

/**
 * Production configuration validation.
 *
 * Every finding names the variable and what is wrong with it; no check ever
 * puts a configured secret VALUE into its detail, so the same report is safe to
 * print in an operator terminal. The only values that can appear are public by
 * definition (the service origin, the Turnstile action names, a database host
 * with no credentials) or published constants (Cloudflare's testing keys).
 *
 * Scope matters: `runtime` is the public web function, which must hold the
 * least-privilege runtime database URL and nothing else. `operator` is a
 * workstation or CI shell running db:migrate / moderate, where the elevated
 * URLs are expected.
 */

export type ConfigCheckStatus = "ok" | "failed" | "warning";

export interface ConfigCheckResult {
  /** Stable identifier, usually the variable name. */
  name: string;
  status: ConfigCheckStatus;
  /** Human-readable finding. Never contains a configured secret value. */
  detail: string;
}

export interface ConfigReport {
  /** True when nothing is `failed`. Warnings do not block. */
  ok: boolean;
  failed: number;
  warnings: number;
  checks: ConfigCheckResult[];
}

export type ConfigScope = "runtime" | "operator";

type Env = Record<string, string | undefined>;

/** Minimum characters for an HMAC secret: 32 random bytes are 43 base64url characters. */
const MIN_SECRET_CHARS = 32;

/**
 * Values that mark a credential as non-production. Each token is at least six
 * characters, so a random base64url secret cannot trip this by accident.
 */
const PLACEHOLDER_TOKENS = ["placeholder", "changeme", "example", "synthetic", "for-ci"];

/**
 * Cloudflare's published Turnstile testing keys. They always pass, always fail,
 * or always report a spent token, so a deployment carrying one is not verifying
 * anyone. https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
const TURNSTILE_TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);
const TURNSTILE_TEST_SECRET_KEYS = new Set([
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
]);

/**
 * Actions the browser widget sends. They are compiled into the client bundle
 * (`src/components/verify-panel.tsx` and `report-form.tsx`), so a server-side
 * override that disagrees makes every siteverify fail with action-mismatch.
 */
export const CLIENT_TURNSTILE_VERIFY_ACTION = "benchmark_publish";
export const CLIENT_TURNSTILE_REPORT_ACTION = "benchmark_report";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function checkProductionConfig(options: { env?: Env; scope?: ConfigScope } = {}): ConfigReport {
  const env = options.env ?? (process.env as Env);
  const scope = options.scope ?? "runtime";
  const checks: ConfigCheckResult[] = [];
  const add: Add = (name, status, detail) => {
    checks.push({ name, status, detail });
  };

  if (env["NODE_ENV"] === "production") {
    add("NODE_ENV", "ok", "production");
  } else {
    add("NODE_ENV", "failed", `expected "production", found ${describeMode(env["NODE_ENV"])}`);
  }

  const originHost = checkServiceOrigin(env, add);
  checkSecrets(env, add);
  checkTurnstile(env, originHost, add);
  checkTestBypass(env, add);
  checkDatabase(env, scope, add);
  checkCapacity(env, add);
  checkQuotaOverrides(env, add);

  const failed = checks.filter((c) => c.status === "failed").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  return { ok: failed === 0, failed, warnings, checks };
}

type Add = (name: string, status: ConfigCheckStatus, detail: string) => void;

function describeMode(value: string | undefined): string {
  return value ? `"${value}"` : "unset";
}

/** Returns the canonical origin's hostname, or null when it is unusable. */
function checkServiceOrigin(env: Env, add: Add): string | null {
  const raw = env["SERVICE_ORIGIN"];
  if (!raw) {
    add("SERVICE_ORIGIN", "failed", "not set; production refuses to emit localhost links");
    return null;
  }
  let origin: string;
  try {
    origin = normalizeServiceOrigin(raw);
  } catch (err) {
    add("SERVICE_ORIGIN", "failed", `not a canonical root origin: ${err instanceof Error ? err.message : "invalid"}`);
    return null;
  }
  if (!origin.startsWith("https://")) {
    add("SERVICE_ORIGIN", "failed", "must use HTTPS in production");
    return null;
  }
  add("SERVICE_ORIGIN", "ok", origin);
  return new URL(origin).hostname;
}

function checkSecrets(env: Env, add: Add): void {
  const names = ["PERMIT_HMAC_SECRET", "MANAGEMENT_HMAC_SECRET", "QUOTA_HMAC_SECRET"];
  const present: string[] = [];
  for (const name of names) {
    const value = env[name];
    if (!value) {
      add(name, "failed", "not set");
      continue;
    }
    present.push(value);
    const placeholder = PLACEHOLDER_TOKENS.find((token) => value.toLowerCase().includes(token));
    if (placeholder) {
      add(name, "failed", `looks like a non-production value (contains "${placeholder}")`);
    } else if (value.length < MIN_SECRET_CHARS) {
      add(name, "failed", `shorter than ${MIN_SECRET_CHARS} characters`);
    } else {
      add(name, "ok", "configured");
    }
  }
  if (present.length !== names.length) return;
  if (new Set(present).size !== names.length) {
    add("hmac-secrets-distinct", "failed", "the three HMAC secrets must differ from each other");
  } else {
    add("hmac-secrets-distinct", "ok", "all three differ");
  }
}

function checkTurnstile(env: Env, originHost: string | null, add: Add): void {
  const secret = env["TURNSTILE_SECRET_KEY"];
  if (!secret) {
    add("TURNSTILE_SECRET_KEY", "failed", "not set; publishing and reporting both refuse to verify");
  } else if (TURNSTILE_TEST_SECRET_KEYS.has(secret)) {
    add("TURNSTILE_SECRET_KEY", "failed", "is a Cloudflare testing key, which never really verifies anyone");
  } else {
    add("TURNSTILE_SECRET_KEY", "ok", "configured");
  }

  const siteKey = env["NEXT_PUBLIC_TURNSTILE_SITE_KEY"];
  if (!siteKey) {
    add("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "failed", "not set; the widget renders a configuration notice instead");
  } else if (TURNSTILE_TEST_SITE_KEYS.has(siteKey)) {
    add("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "failed", `is the Cloudflare testing key ${siteKey}`);
  } else {
    add("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "ok", "configured");
  }

  const hostname = env["TURNSTILE_EXPECTED_HOSTNAME"];
  if (!hostname) {
    add("TURNSTILE_EXPECTED_HOSTNAME", "failed", "not set; siteverify fails closed without it");
  } else if (originHost && hostname !== originHost) {
    add("TURNSTILE_EXPECTED_HOSTNAME", "failed", `is "${hostname}" but SERVICE_ORIGIN's host is "${originHost}"`);
  } else {
    add("TURNSTILE_EXPECTED_HOSTNAME", "ok", hostname);
  }

  checkAction(env, "TURNSTILE_VERIFY_ACTION", CLIENT_TURNSTILE_VERIFY_ACTION, add);
  checkAction(env, "TURNSTILE_REPORT_ACTION", CLIENT_TURNSTILE_REPORT_ACTION, add);
}

/**
 * The action name is baked into the token the browser mints, so the server-side
 * expectation has to match the constant the widget was built with.
 */
function checkAction(env: Env, name: string, clientValue: string, add: Add): void {
  const value = env[name];
  if (value === undefined || value === clientValue) {
    add(name, "ok", clientValue);
    return;
  }
  add(name, "failed", `is "${value}" but the widget sends "${clientValue}"; every token would be rejected`);
}

function checkTestBypass(env: Env, add: Add): void {
  const enabled = env["SYNTHETIC_TEST_MODE"] === "1";
  if (enabled && env["NODE_ENV"] === "test") {
    add("SYNTHETIC_TEST_MODE", "failed", "the synthetic Turnstile and client-IP bypasses are active");
  } else if (enabled) {
    // Inert while NODE_ENV is not "test", but it must not be one environment
    // edit away from switching on in a live deployment.
    add("SYNTHETIC_TEST_MODE", "failed", "enabled; it must be unset outside the test environment");
  } else {
    add("SYNTHETIC_TEST_MODE", "ok", "not enabled");
  }
  if (env["TEST_FIXTURE_TURNSTILE_TOKEN"]) {
    add("TEST_FIXTURE_TURNSTILE_TOKEN", "warning", "set; it belongs only to the test environment");
  }
}

function checkDatabase(env: Env, scope: ConfigScope, add: Add): void {
  const url = env["DATABASE_URL"];
  if (!url) {
    add("DATABASE_URL", "failed", "not set; every route answers 503");
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || !/^postgres(ql)?:$/.test(parsed.protocol)) {
      add("DATABASE_URL", "failed", "is not a postgres:// or postgresql:// URL");
    } else if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      add("DATABASE_URL", "failed", "points at loopback; a production deployment cannot reach a local database");
    } else {
      // Host and port carry no credentials, so they are safe to report.
      add("DATABASE_URL", "ok", `${parsed.hostname} (TLS verified)`);
      if (parsed.hostname.includes("pooler.") && parsed.port && parsed.port !== "6543") {
        add(
          "DATABASE_URL-pooler-mode",
          "warning",
          `port ${parsed.port} is not the transaction pooler port 6543, but the client runs with prepare:false for transaction mode`,
        );
      }
    }
  }

  if (scope !== "runtime") return;
  // The public web function never runs DDL or moderation. Shipping those URLs
  // into it would place an owner-level and a moderation-level credential in the
  // process that serves anonymous traffic.
  for (const name of ["DATABASE_MIGRATION_URL", "DATABASE_MODERATION_URL"]) {
    if (env[name]) {
      add(name, "failed", "must not be set in the web runtime; it belongs to the operator shell only");
    } else {
      add(name, "ok", "absent from the web runtime");
    }
  }
}

function checkCapacity(env: Env, add: Add): void {
  const bytes = positiveNumber(env["PROVISIONED_BYTES"]);
  const rows = positiveNumber(env["PROVISIONED_ROWS"]);
  if (bytes === null && rows === null) {
    // capacityConfigFromEnv sets strictMissing in production, so acceptRunAtomic
    // refuses every new run with "storage capacity is not configured".
    add("capacity-guard", "failed", "neither PROVISIONED_BYTES nor PROVISIONED_ROWS is set; all new publishing is paused");
    return;
  }
  const parts: string[] = [];
  if (bytes !== null) parts.push(`PROVISIONED_BYTES=${bytes}`);
  if (rows !== null) parts.push(`PROVISIONED_ROWS=${rows}`);
  if (bytes === null || rows === null) {
    add("capacity-guard", "warning", `only ${parts.join(" and ")} is set; the other dimension is unguarded`);
    return;
  }
  add("capacity-guard", "ok", parts.join(", "));
}

const QUOTA_KEYS = [
  "QUOTA_PER_IP_HOUR", "QUOTA_PER_IP_DAY", "QUOTA_GLOBAL_DAY", "QUOTA_GLOBAL_BYTES_DAY",
  "QUOTA_GLOBAL_ROWS_DAY", "QUOTA_SESSION_CREATE_PER_MIN_IP", "QUOTA_INVALID_MANAGE_PER_MIN_IP",
  "QUOTA_REPORT_PER_HOUR_IP",
];

/** quotaConfigFromEnv silently falls back on an unusable override; surface it. */
function checkQuotaOverrides(env: Env, add: Add): void {
  const bad = QUOTA_KEYS.filter((key) => {
    const raw = env[key];
    if (!raw) return false;
    const n = Number(raw);
    return !(Number.isSafeInteger(n) && n > 0);
  });
  if (bad.length === 0) {
    add("quota-overrides", "ok", "none set, or all are positive integers");
    return;
  }
  add("quota-overrides", "warning", `ignored, falling back to defaults: ${bad.join(", ")}`);
}

function positiveNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

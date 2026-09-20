import { afterEach, describe, expect, it } from "vitest";
import { checkProductionConfig, type ConfigReport } from "@/lib/config-check";
import { buildManagementCookie, clearManagementCookie } from "@/server/auth-helpers";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { __setTestStore } from "@/server/store";

/**
 * Production configuration validation. The checks exist because each finding
 * here is a deployment that builds, boots, serves pages, and then fails at the
 * first real request - the failure mode this task was opened to remove.
 *
 * Every value below is synthetic. The secrets are shaped like real ones (43
 * base64url characters) but are literal fixtures, never a generated key.
 */

const PERMIT = "Kq4vUz1sX7bYh0LmPd9tRcE2gJfW6aNoQiS3uZxB5rY";
const MANAGEMENT = "Tb8nHs2wYqL6dJv0XkPm4RgZ1cFuE7aOiN9tQ3yVxWr";
const QUOTA = "Zr5kMv9pCw3xHt1QbLjA8fDn6sYeU0gR2oIiT4uXqNa";

function productionEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = {
    NODE_ENV: "production",
    SERVICE_ORIGIN: "https://benchmarks.invalid",
    PERMIT_HMAC_SECRET: PERMIT,
    MANAGEMENT_HMAC_SECRET: MANAGEMENT,
    QUOTA_HMAC_SECRET: QUOTA,
    TURNSTILE_SECRET_KEY: "0xSyntheticTurnstileSecretForTestsOnly",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0xSyntheticTurnstileSiteKey",
    TURNSTILE_EXPECTED_HOSTNAME: "benchmarks.invalid",
    TURNSTILE_VERIFY_ACTION: "benchmark_publish",
    TURNSTILE_REPORT_ACTION: "benchmark_report",
    DATABASE_URL: "postgresql://runtime:pw@db-pooler.invalid:6543/postgres",
    PROVISIONED_BYTES: "536870912",
    PROVISIONED_ROWS: "2000000",
  };
  return { ...base, ...overrides };
}

function check(overrides: Record<string, string | undefined> = {}, scope: "runtime" | "operator" = "runtime"): ConfigReport {
  return checkProductionConfig({ env: productionEnv(overrides), scope });
}

function failures(report: ConfigReport): string[] {
  return report.checks.filter((c) => c.status === "failed").map((c) => c.name);
}

function detailFor(report: ConfigReport, name: string): string {
  const found = report.checks.find((c) => c.name === name);
  expect(found, `no check named ${name}`).toBeTruthy();
  return found!.detail;
}

describe("production configuration validation", () => {
  it("passes a fully configured deployment with no warnings", () => {
    const report = check();
    expect(failures(report)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.warnings).toBe(0);
  });

  it("never puts a configured secret value in its output", () => {
    // Include the failure paths as well: an invalid value must still not be
    // echoed back, because a config report is pasted into issues and chats.
    const reports = [
      check(),
      check({ PERMIT_HMAC_SECRET: "short" }),
      check({ MANAGEMENT_HMAC_SECRET: undefined }),
      check({ QUOTA_HMAC_SECRET: `${PERMIT}` }),
      check({ TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" }),
    ];
    const secrets = [PERMIT, MANAGEMENT, QUOTA, "0xSyntheticTurnstileSecretForTestsOnly", "runtime:pw", "pw@"];
    for (const report of reports) {
      const text = JSON.stringify(report);
      for (const secret of secrets) expect(text).not.toContain(secret);
    }
  });

  it("rejects a non-production NODE_ENV", () => {
    expect(failures(check({ NODE_ENV: "development" }))).toContain("NODE_ENV");
    expect(failures(check({ NODE_ENV: undefined }))).toContain("NODE_ENV");
  });

  it("requires an HTTPS canonical root service origin", () => {
    expect(failures(check({ SERVICE_ORIGIN: undefined }))).toContain("SERVICE_ORIGIN");
    expect(failures(check({ SERVICE_ORIGIN: "http://benchmarks.invalid" }))).toContain("SERVICE_ORIGIN");
    expect(failures(check({ SERVICE_ORIGIN: "https://benchmarks.invalid/app" }))).toContain("SERVICE_ORIGIN");
    expect(failures(check({ SERVICE_ORIGIN: "https://user@benchmarks.invalid" }))).toContain("SERVICE_ORIGIN");
  });

  it("rejects missing, short, reused, and non-production HMAC secrets", () => {
    expect(failures(check({ QUOTA_HMAC_SECRET: undefined }))).toContain("QUOTA_HMAC_SECRET");
    expect(failures(check({ QUOTA_HMAC_SECRET: "too-short" }))).toContain("QUOTA_HMAC_SECRET");
    // The exact shape CI uses, so a CI environment can never be mistaken for one.
    expect(failures(check({ PERMIT_HMAC_SECRET: "synthetic-permit-secret-for-ci-only" }))).toContain("PERMIT_HMAC_SECRET");
    expect(failures(check({ MANAGEMENT_HMAC_SECRET: PERMIT }))).toContain("hmac-secrets-distinct");
  });

  it("rejects Cloudflare's Turnstile testing keys", () => {
    // These always pass or always fail, so a deployment carrying one verifies
    // nobody while looking completely healthy.
    expect(failures(check({ TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" }))).toContain("TURNSTILE_SECRET_KEY");
    expect(failures(check({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" })))
      .toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
    expect(failures(check({ TURNSTILE_SECRET_KEY: undefined }))).toContain("TURNSTILE_SECRET_KEY");
  });

  it("requires the Turnstile hostname to match the service origin's host", () => {
    const report = check({ TURNSTILE_EXPECTED_HOSTNAME: "other.invalid" });
    expect(failures(report)).toContain("TURNSTILE_EXPECTED_HOSTNAME");
    expect(detailFor(report, "TURNSTILE_EXPECTED_HOSTNAME")).toContain("benchmarks.invalid");
    expect(failures(check({ TURNSTILE_EXPECTED_HOSTNAME: undefined }))).toContain("TURNSTILE_EXPECTED_HOSTNAME");
  });

  it("catches an action override the browser widget does not send", () => {
    // The widget's action is compiled into the client bundle, so an override
    // here makes every siteverify fail with action-mismatch.
    expect(failures(check({ TURNSTILE_VERIFY_ACTION: "publish" }))).toContain("TURNSTILE_VERIFY_ACTION");
    expect(failures(check({ TURNSTILE_REPORT_ACTION: "report" }))).toContain("TURNSTILE_REPORT_ACTION");
    // Unset is fine: the route defaults to the same constant the widget uses.
    expect(failures(check({ TURNSTILE_VERIFY_ACTION: undefined, TURNSTILE_REPORT_ACTION: undefined }))).toEqual([]);
  });

  it("refuses any synthetic test bypass", () => {
    expect(failures(check({ SYNTHETIC_TEST_MODE: "1" }))).toContain("SYNTHETIC_TEST_MODE");
    expect(failures(check({ SYNTHETIC_TEST_MODE: "1", NODE_ENV: "test" }))).toContain("SYNTHETIC_TEST_MODE");
    const withFixture = check({ TEST_FIXTURE_TURNSTILE_TOKEN: "test-turnstile-ok" });
    expect(failures(withFixture)).toEqual([]);
    expect(withFixture.warnings).toBe(1);
  });

  it("rejects an unusable or local database URL", () => {
    expect(failures(check({ DATABASE_URL: undefined }))).toContain("DATABASE_URL");
    expect(failures(check({ DATABASE_URL: "not a url" }))).toContain("DATABASE_URL");
    expect(failures(check({ DATABASE_URL: "https://db.invalid/postgres" }))).toContain("DATABASE_URL");
    expect(failures(check({ DATABASE_URL: "postgresql://u:p@localhost:5432/aiolm_web" }))).toContain("DATABASE_URL");
    expect(failures(check({ DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/aiolm_web" }))).toContain("DATABASE_URL");
  });

  it("warns when a pooler URL is not on the transaction-pooler port", () => {
    const report = check({ DATABASE_URL: "postgresql://u:p@x.pooler.invalid:5432/postgres" });
    expect(failures(report)).toEqual([]);
    expect(report.checks.find((c) => c.name === "DATABASE_URL-pooler-mode")?.status).toBe("warning");
  });

  it("keeps migration and moderation credentials out of the web runtime", () => {
    const leaked = check({
      DATABASE_MIGRATION_URL: "postgresql://owner:pw@db-pooler.invalid:6543/postgres",
      DATABASE_MODERATION_URL: "postgresql://mod:pw@db-pooler.invalid:6543/postgres",
    });
    expect(failures(leaked)).toEqual(["DATABASE_MIGRATION_URL", "DATABASE_MODERATION_URL"]);
    // The same environment is correct for an operator shell running db:migrate.
    const operator = check(
      {
        DATABASE_MIGRATION_URL: "postgresql://owner:pw@db-pooler.invalid:6543/postgres",
        DATABASE_MODERATION_URL: "postgresql://mod:pw@db-pooler.invalid:6543/postgres",
      },
      "operator",
    );
    expect(failures(operator)).toEqual([]);
  });

  it("catches the unset capacity guard that silently pauses all publishing", () => {
    // capacityConfigFromEnv sets strictMissing in production, so with neither
    // value acceptRunAtomic refuses every new run with a 503.
    const report = check({ PROVISIONED_BYTES: undefined, PROVISIONED_ROWS: undefined });
    expect(failures(report)).toContain("capacity-guard");
    const half = check({ PROVISIONED_ROWS: undefined });
    expect(failures(half)).toEqual([]);
    expect(half.checks.find((c) => c.name === "capacity-guard")?.status).toBe("warning");
  });

  it("surfaces quota overrides that are silently ignored", () => {
    const report = check({ QUOTA_PER_IP_HOUR: "twenty", QUOTA_GLOBAL_DAY: "-5" });
    expect(failures(report)).toEqual([]);
    const detail = detailFor(report, "quota-overrides");
    expect(detail).toContain("QUOTA_PER_IP_HOUR");
    expect(detail).toContain("QUOTA_GLOBAL_DAY");
  });
});

describe("production runtime guards", () => {
  const savedNodeEnv = process.env["NODE_ENV"];
  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    if (savedNodeEnv === undefined) delete env["NODE_ENV"];
    else env["NODE_ENV"] = savedNodeEnv;
    __setTestStore(null);
  });

  it("refuses to install the in-memory test store in production", () => {
    // Nothing in the app calls this, but the export sits in the server bundle
    // and an in-memory store would accept and then discard real submissions.
    (process.env as Record<string, string | undefined>)["NODE_ENV"] = "production";
    expect(() => __setTestStore(new InMemoryBenchmarkStore())).toThrow(/in-memory test store/);
    // Clearing the override is always allowed, including from a teardown hook.
    expect(() => __setTestStore(null)).not.toThrow();
  });

  it("clears the management cookie with the same attributes it was set with", () => {
    const env = process.env as Record<string, string | undefined>;
    for (const mode of ["production", "test"]) {
      env["NODE_ENV"] = mode;
      const set = buildManagementCookie("id", "signed");
      const cleared = clearManagementCookie();
      for (const attribute of ["Path=/", "HttpOnly", "SameSite=Strict"]) {
        expect(set).toContain(attribute);
        expect(cleared).toContain(attribute);
      }
      // Secure only over HTTPS, so the development loopback still works.
      expect(set.includes("Secure")).toBe(mode === "production");
      expect(cleared.includes("Secure")).toBe(mode === "production");
      expect(cleared).toContain("Max-Age=0");
    }
  });
});

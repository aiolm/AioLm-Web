import { __setTestStore } from "@/server/store";
import { InMemoryBenchmarkStore } from "@/server/memory-store";

export function setupTestEnv(): void {
  const env = process.env as Record<string, string | undefined>;
  env["NODE_ENV"] = "test";
  env["SYNTHETIC_TEST_MODE"] = "1";
  env["SERVICE_ORIGIN"] = "http://localhost:3000";
  env["PERMIT_HMAC_SECRET"] = "test-permit-secret-0123456789abcdef";
  env["MANAGEMENT_HMAC_SECRET"] = "test-mgmt-secret-0123456789abcdef";
  env["QUOTA_HMAC_SECRET"] = "test-quota-secret-0123456789abcdef";
  env["TEST_FIXTURE_TURNSTILE_TOKEN"] = "test-turnstile-ok";
  env["TURNSTILE_EXPECTED_HOSTNAME"] = "test-host";
  env["TURNSTILE_VERIFY_ACTION"] = "benchmark_publish";
  env["TURNSTILE_REPORT_ACTION"] = "benchmark_report";
}

export function freshStore(): InMemoryBenchmarkStore {
  const store = new InMemoryBenchmarkStore();
  __setTestStore(store);
  return store;
}

export function testHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({ "x-synthetic-test-ip": "10.0.0.7", ...extra });
}

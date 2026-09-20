import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as readiness } from "@/app/v1/readiness/route";
import type { InMemoryBenchmarkStore } from "@/server/memory-store";
import { READINESS_PROBE_TIMEOUT_MS, REQUIRED_MIGRATIONS } from "@/server/repository";
import type { BenchmarkStore } from "@/server/repository";
import { __setTestStore } from "@/server/store";
import { freshStore, setupTestEnv } from "./helpers";

setupTestEnv();

/**
 * The readiness endpoint exists so a deploy can be validated over HTTP. Three
 * properties matter and are all asserted here: it cannot report ready without a
 * fully migrated database, it settles the configuration question before it
 * spends a database connection, and it tells an anonymous caller nothing beyond
 * ready or not ready. Detail belongs to `npm run config:check` and the platform
 * logs.
 */

const savedEnv = { ...process.env } as Record<string, string | undefined>;

function restoreEnv(): void {
  const env = process.env as Record<string, string | undefined>;
  for (const key of Object.keys(env)) if (!(key in savedEnv)) delete env[key];
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

/** Put the process in production with a configuration that cannot validate. */
function brokenProductionConfig(): void {
  const env = process.env as Record<string, string | undefined>;
  env["NODE_ENV"] = "production";
  env["SERVICE_ORIGIN"] = "https://benchmarks.invalid";
  delete env["PROVISIONED_BYTES"];
  delete env["PROVISIONED_ROWS"];
}

describe("readiness endpoint", () => {
  let store: InMemoryBenchmarkStore;

  beforeEach(() => {
    store = freshStore();
  });
  afterEach(() => {
    restoreEnv();
    __setTestStore(null);
  });

  it("reports ready when every required migration is applied", async () => {
    expect(store.migrationLedger).toEqual([...REQUIRED_MIGRATIONS]);
    const res = await readiness();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("is not ready when any single required migration is missing", async () => {
    // A count cannot see this: the ledger below always holds six files, and six
    // of seven grants is a database the app cannot actually run against.
    for (const missing of REQUIRED_MIGRATIONS) {
      store.migrationLedger = REQUIRED_MIGRATIONS.filter((file) => file !== missing);
      const res = await readiness();
      expect(res.status, `expected 503 with ${missing} absent`).toBe(503);
    }
    store.migrationLedger = [...REQUIRED_MIGRATIONS];
    expect((await readiness()).status).toBe(200);
  });

  it("is not ready when the ledger holds the wrong files entirely", async () => {
    // Same count, none of them required.
    store.migrationLedger = REQUIRED_MIGRATIONS.map((file) => file.replace(/^0/, "9"));
    expect(store.migrationLedger).toHaveLength(REQUIRED_MIGRATIONS.length);
    expect((await readiness()).status).toBe(503);
  });

  it("stays ready when the ledger runs ahead of the required set", async () => {
    // A newer migration is not a reason to refuse traffic; a missing one is.
    store.migrationLedger = [...REQUIRED_MIGRATIONS, "008_future.sql"];
    expect((await readiness()).status).toBe(200);
  });

  it("is not ready when the database is unreachable", async () => {
    store.appliedMigrations = async (): Promise<never> => {
      throw new Error("could not connect to server: Connection refused");
    };
    const res = await readiness();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await res.json()).toEqual({ error: { code: "service_unavailable", message: "Service is not ready." } });
  });

  it("is not ready when the database has no migrations applied", async () => {
    // Reachable but empty: connectivity alone is not readiness.
    store.migrationLedger = [];
    expect((await readiness()).status).toBe(503);
  });

  it("is not ready when the store cannot be constructed", async () => {
    __setTestStore(null);
    delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
    expect((await readiness()).status).toBe(503);
  });

  it("passes the shared probe bound to the store", async () => {
    // The route does not race the read itself; the store bounds it inside
    // PostgreSQL so a probe that gives up does not leave a statement running.
    const seen: Array<number | undefined> = [];
    store.appliedMigrations = async (timeoutMs?: number): Promise<string[]> => {
      seen.push(timeoutMs);
      return [...REQUIRED_MIGRATIONS];
    };
    expect((await readiness()).status).toBe(200);
    expect(seen).toEqual([READINESS_PROBE_TIMEOUT_MS]);
  });

  it("refuses to report ready on an unconfigured production deployment", async () => {
    // The store answers fine; the configuration does not. A deployment that
    // cannot verify a human or accept an upload is not ready to serve.
    brokenProductionConfig();
    expect((await readiness()).status).toBe(503);
  });

  it("answers a configuration failure without touching the database at all", async () => {
    // Config is decided first and returns on its own. Probing anyway would
    // spend a pooled connection to learn something that cannot change the
    // answer, on every uptime check, while the deployment is already broken.
    let calls = 0;
    const counting = new Proxy({} as BenchmarkStore, {
      get: () => async (): Promise<never> => {
        calls += 1;
        throw new Error("the database must not be consulted here");
      },
    });
    __setTestStore(counting);
    brokenProductionConfig();
    expect((await readiness()).status).toBe(503);
    expect(calls).toBe(0);
  });

  it("never discloses which check failed", async () => {
    brokenProductionConfig();
    (process.env as Record<string, string | undefined>)["TURNSTILE_SECRET_KEY"] =
      "0xSyntheticTurnstileSecretForTestsOnly";
    const body = await (await readiness()).text();
    for (const leak of [
      "SERVICE_ORIGIN", "TURNSTILE", "PROVISIONED", "DATABASE", "capacity",
      "0xSyntheticTurnstileSecretForTestsOnly", "migration", "001_init",
    ]) {
      expect(body).not.toContain(leak);
    }
  });
});

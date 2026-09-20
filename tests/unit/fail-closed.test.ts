import { afterEach, describe, expect, it } from "vitest";
import { getServiceOrigin } from "@/lib/env";
import { sslOptionsFor } from "@/server/db";
import { verifyTurnstileToken } from "@/server/turnstile";

describe("deployment fail-closed behavior", () => {
  const saved = { ...process.env } as Record<string, string | undefined>;
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete (process.env as Record<string, string | undefined>)[key];
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
      else (process.env as Record<string, string | undefined>)[key] = value;
    }
  });

  it("refuses to emit localhost links when production has no SERVICE_ORIGIN", () => {
    const env = process.env as Record<string, string | undefined>;
    env["NODE_ENV"] = "production";
    delete env["SERVICE_ORIGIN"];
    expect(() => getServiceOrigin()).toThrow(/SERVICE_ORIGIN/);
  });

  it("validates the service origin as a root HTTPS origin (loopback http only)", () => {
    const env = process.env as Record<string, string | undefined>;
    env["NODE_ENV"] = "production";
    env["SERVICE_ORIGIN"] = "https://benchmarks.example.com/";
    expect(getServiceOrigin()).toBe("https://benchmarks.example.com");
    for (const bad of [
      "http://benchmarks.example.com",
      "https://benchmarks.example.com/with-path",
      "https://benchmarks.example.com/?q=1",
      "https://benchmarks.example.com/#f",
      "https://user@benchmarks.example.com",
    ]) {
      env["SERVICE_ORIGIN"] = bad;
      expect(() => getServiceOrigin()).toThrow();
    }
    env["NODE_ENV"] = "test";
    env["SERVICE_ORIGIN"] = "http://localhost:3000";
    expect(getServiceOrigin()).toBe("http://localhost:3000");
  });

  it("refuses siteverify when the expected hostname is not configured", async () => {
    const env = process.env as Record<string, string | undefined>;
    delete env["SYNTHETIC_TEST_MODE"];
    env["NODE_ENV"] = "production";
    env["TURNSTILE_SECRET_KEY"] = "secret";
    delete env["TURNSTILE_EXPECTED_HOSTNAME"];
    await expect(verifyTurnstileToken({ token: "whatever", expectedAction: "benchmark_publish" })).rejects.toThrow(
      /not configured/,
    );
  });
});

describe("database TLS is decided by the target, not by NODE_ENV", () => {
  const saved = { ...process.env } as Record<string, string | undefined>;
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete (process.env as Record<string, string | undefined>)[key];
    }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
      else (process.env as Record<string, string | undefined>)[key] = value;
    }
  });

  it("verifies TLS to a remote database even outside production", () => {
    // db:migrate and moderate are run from an operator shell or CI, where
    // NODE_ENV is not "production". Deciding on NODE_ENV alone offered the
    // managed database a plaintext connection it refuses, so those commands
    // could never reach it.
    const env = process.env as Record<string, string | undefined>;
    for (const mode of ["development", "test", "production"]) {
      env["NODE_ENV"] = mode;
      expect(sslOptionsFor("postgresql://u:p@db-pooler.invalid:6543/postgres")).toEqual({ rejectUnauthorized: true });
    }
  });

  it("keeps loopback development and synthetic test clusters on plaintext", () => {
    const env = process.env as Record<string, string | undefined>;
    for (const mode of ["development", "test"]) {
      env["NODE_ENV"] = mode;
      for (const url of [
        "postgresql://postgres:postgres@localhost:5432/aiolm_web",
        "postgresql://postgres:postgres@127.0.0.1:5432/aiolm_web",
      ]) {
        expect(sslOptionsFor(url)).toBe(false);
      }
    }
  });

  it("never drops TLS in production, whatever the host", () => {
    const env = process.env as Record<string, string | undefined>;
    env["NODE_ENV"] = "production";
    expect(sslOptionsFor("postgresql://postgres:postgres@localhost:5432/aiolm_web")).toEqual({ rejectUnauthorized: true });
  });

  it("pins a private CA when DATABASE_CA_CERT is set", () => {
    const env = process.env as Record<string, string | undefined>;
    env["NODE_ENV"] = "production";
    env["DATABASE_CA_CERT"] = "-----BEGIN CERTIFICATE-----synthetic-----END CERTIFICATE-----";
    expect(sslOptionsFor("postgresql://u:p@db-pooler.invalid:6543/postgres")).toEqual({
      rejectUnauthorized: true,
      ca: env["DATABASE_CA_CERT"],
    });
  });
});

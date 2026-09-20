import { afterEach, describe, expect, it } from "vitest";
import { randomBase64Url32, sha256HexUtf8 } from "@/lib/crypto";
import { syntheticSubmission } from "@/lib/fixtures";
import type { BenchmarkStore } from "@/server/repository";
import { __setTestStore } from "@/server/store";
import { GET as listRuns, POST as publishRun } from "@/app/v1/benchmark-runs/route";
import { GET as readRun, DELETE as deleteRun } from "@/app/v1/benchmark-runs/[id]/route";
import { PATCH as editDescription } from "@/app/v1/benchmark-runs/[id]/description/route";
import { GET as readMeasurements } from "@/app/v1/benchmark-runs/[id]/measurements/route";
import { POST as reportRun } from "@/app/v1/benchmark-runs/[id]/reports/route";
import { POST as createUploadSession } from "@/app/v1/upload-sessions/route";
import { GET as pollUploadSession } from "@/app/v1/upload-sessions/[id]/route";
import { POST as verifyUploadSession } from "@/app/v1/upload-sessions/[id]/verify/route";
import { POST as openMgmt } from "@/app/v1/management-sessions/route";
import { setupTestEnv, testHeaders } from "./helpers";

setupTestEnv();

/**
 * One outage, one answer, on every v1 route.
 *
 * A database that cannot be reached is an availability problem. The shared
 * contract carries a retryable `service_unavailable`, and the desktop client
 * decides whether to retry from that code - so an outage that surfaces as a
 * bare 500 (not a service error at all), or as a 404/403/204/202 that makes a
 * claim about the caller's data, takes a recoverable blip and turns it into a
 * dead end. These cases pin the uniform behaviour down route by route. The
 * management session GET and DELETE are pinned separately, against a real
 * signed session, in tests/unit/management-outage.test.ts.
 */

const ORIGIN = "http://localhost:3000";
const PUBLIC_ID = "abcdefghijkl";
const SUBMISSION = "00000000-0000-4000-8000-0000000000d7";
const OWNER = randomBase64Url32();

/** Every store method rejects, the way a severed connection behaves. */
function outageStore(): BenchmarkStore {
  const fail = async (): Promise<never> => {
    throw new Error("could not connect to server: Connection refused");
  };
  return new Proxy({} as BenchmarkStore, { get: () => fail });
}

const publicationBody = (): string =>
  JSON.stringify({ benchmark: syntheticSubmission({ submission_id: SUBMISSION }), description_md: "outage" });

interface RouteCase {
  name: string;
  call: () => Promise<Response>;
}

const CASES: RouteCase[] = [
  {
    name: "GET /v1/benchmark-runs",
    call: () => listRuns(new Request(`${ORIGIN}/v1/benchmark-runs`, { headers: testHeaders() })),
  },
  {
    name: "POST /v1/benchmark-runs",
    call: () =>
      publishRun(
        new Request(`${ORIGIN}/v1/benchmark-runs`, {
          method: "POST",
          headers: testHeaders({ authorization: `Bearer ${OWNER}`, "content-type": "application/json" }),
          body: publicationBody(),
        }),
      ),
  },
  {
    name: "GET /v1/benchmark-runs/[id]",
    call: () =>
      readRun(new Request(`${ORIGIN}/v1/benchmark-runs/${PUBLIC_ID}`, { headers: testHeaders() }), {
        params: Promise.resolve({ id: PUBLIC_ID }),
      }),
  },
  {
    name: "DELETE /v1/benchmark-runs/[id]",
    call: () =>
      deleteRun(
        new Request(`${ORIGIN}/v1/benchmark-runs/${PUBLIC_ID}`, {
          method: "DELETE",
          headers: testHeaders({ authorization: `Bearer ${OWNER}` }),
        }),
        { params: Promise.resolve({ id: PUBLIC_ID }) },
      ),
  },
  {
    name: "PATCH /v1/benchmark-runs/[id]/description",
    call: () =>
      editDescription(
        new Request(`${ORIGIN}/v1/benchmark-runs/${PUBLIC_ID}/description`, {
          method: "PATCH",
          headers: testHeaders({ authorization: `Bearer ${OWNER}`, "content-type": "application/json" }),
          body: JSON.stringify({ description_md: "outage", expected_revision: 1 }),
        }),
        { params: Promise.resolve({ id: PUBLIC_ID }) },
      ),
  },
  {
    name: "GET /v1/benchmark-runs/[id]/measurements",
    call: () =>
      readMeasurements(
        new Request(`${ORIGIN}/v1/benchmark-runs/${PUBLIC_ID}/measurements`, { headers: testHeaders() }),
        { params: Promise.resolve({ id: PUBLIC_ID }) },
      ),
  },
  {
    name: "POST /v1/benchmark-runs/[id]/reports",
    call: () =>
      reportRun(
        new Request(`${ORIGIN}/v1/benchmark-runs/${PUBLIC_ID}/reports`, {
          method: "POST",
          headers: testHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ reason: "spam", token: "test-turnstile-ok" }),
        }),
        { params: Promise.resolve({ id: PUBLIC_ID }) },
      ),
  },
  {
    name: "POST /v1/upload-sessions",
    call: () =>
      createUploadSession(
        new Request(`${ORIGIN}/v1/upload-sessions`, {
          method: "POST",
          headers: testHeaders({ authorization: `Bearer ${OWNER}`, "content-type": "application/json" }),
          body: JSON.stringify({ submission_id: SUBMISSION, body_sha256: sha256HexUtf8("outage") }),
        }),
      ),
  },
  {
    name: "GET /v1/upload-sessions/[id]",
    call: () =>
      pollUploadSession(
        new Request(`${ORIGIN}/v1/upload-sessions/${SUBMISSION}`, {
          headers: testHeaders({ authorization: `Bearer ${OWNER}` }),
        }),
        { params: Promise.resolve({ id: SUBMISSION }) },
      ),
  },
  {
    name: "POST /v1/upload-sessions/[id]/verify",
    call: () =>
      verifyUploadSession(
        new Request(`${ORIGIN}/v1/upload-sessions/${SUBMISSION}/verify`, {
          method: "POST",
          headers: testHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ token: "test-turnstile-ok" }),
        }),
        { params: Promise.resolve({ id: SUBMISSION }) },
      ),
  },
  {
    name: "POST /v1/management-sessions",
    call: () =>
      openMgmt(
        new Request(`${ORIGIN}/v1/management-sessions`, {
          method: "POST",
          headers: testHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ recovery_code: "aiolm-recovery-v1.whatever" }),
        }),
      ),
  },
];

describe("every v1 route answers a database outage with one retryable service error", () => {
  afterEach(() => {
    __setTestStore(null);
  });

  it.each(CASES)("$name", async ({ call }) => {
    __setTestStore(outageStore());
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    const payload = (await res.json()) as { error: { code: string; message: string } };
    expect(payload.error.code).toBe("service_unavailable");
    // A raw driver message would disclose hosts, roles, and schema names.
    expect(payload.error.message).not.toMatch(/connect|refused|postgres|DATABASE_URL|bench\./i);
  });

  it.each(CASES)("$name, when the store cannot even be constructed", async ({ call }) => {
    // No DATABASE_URL: getStore() throws while building the Postgres store,
    // which must not escape as an unhandled 500 either.
    __setTestStore(null);
    const saved = process.env["DATABASE_URL"];
    delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
    try {
      const res = await call();
      expect(res.status).toBe(503);
      const payload = (await res.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("service_unavailable");
    } finally {
      if (saved === undefined) delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
      else (process.env as Record<string, string | undefined>)["DATABASE_URL"] = saved;
    }
  });
});

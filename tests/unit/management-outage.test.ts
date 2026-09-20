import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBase64Url32, sha256HexUtf8 } from "@/lib/crypto";
import { syntheticSubmission } from "@/lib/fixtures";
import { encodeRecoveryCode } from "@/lib/recovery";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { POST as createUploadSession } from "@/app/v1/upload-sessions/route";
import { POST as verifyUploadSession } from "@/app/v1/upload-sessions/[id]/verify/route";
import { GET as pollUploadSession } from "@/app/v1/upload-sessions/[id]/route";
import { POST as submitRun } from "@/app/v1/benchmark-runs/route";
import { POST as openMgmt, GET as readMgmt, DELETE as closeMgmt } from "@/app/v1/management-sessions/route";
import { __setTestStore } from "@/server/store";
import { freshStore, setupTestEnv, testHeaders } from "./helpers";

setupTestEnv();

const ORIGIN = "http://localhost:3000";
const SUBMISSION = "00000000-0000-4000-8000-0000000000c4";

/**
 * A database outage on the management endpoints must answer a structured,
 * retryable 503. The two failure modes it replaces are both wrong in a way a
 * client cannot recover from: an unhandled 500 (the shared contract treats it
 * as terminal, so the app stops retrying) and - worse for GET/DELETE - a 401 or
 * a 204 that tells the caller their still-valid session is gone or revoked.
 */

async function publishRun(ownerSecret: string): Promise<void> {
  const benchmark = syntheticSubmission({ submission_id: SUBMISSION });
  const body = JSON.stringify({ benchmark, description_md: "Outage coverage." });
  const sha = sha256HexUtf8(body);

  const created = await createUploadSession(
    new Request(`${ORIGIN}/v1/upload-sessions`, {
      method: "POST",
      headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json" }),
      body: JSON.stringify({ submission_id: SUBMISSION, body_sha256: sha }),
    }),
  );
  expect(created.status).toBe(201);
  const { session_id: sessionId } = (await created.json()) as { session_id: string };
  const verified = await verifyUploadSession(
    new Request(`${ORIGIN}/v1/upload-sessions/${sessionId}/verify`, {
      method: "POST",
      headers: testHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ token: "test-turnstile-ok" }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
  expect(verified.status).toBe(200);
  const { permit } = (await (await pollUploadSession(
    new Request(`${ORIGIN}/v1/upload-sessions/${sessionId}`, {
      headers: testHeaders({ authorization: `Bearer ${ownerSecret}` }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  )).json()) as { permit: string };

  const accepted = await submitRun(
    new Request(`${ORIGIN}/v1/benchmark-runs`, {
      method: "POST",
      headers: testHeaders({
        authorization: `Bearer ${ownerSecret}`,
        "content-type": "application/json",
        "x-upload-permit": permit,
        "idempotency-key": SUBMISSION,
      }),
      body,
    }),
  );
  expect(accepted.status).toBe(201);
}

async function openSession(ownerSecret: string): Promise<{ cookie: string; csrf: string }> {
  const opened = await openMgmt(
    new Request(`${ORIGIN}/v1/management-sessions`, {
      method: "POST",
      headers: testHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        recovery_code: encodeRecoveryCode({ version: 1, origin: ORIGIN, submission_id: SUBMISSION, secret: ownerSecret }),
      }),
    }),
  );
  expect(opened.status).toBe(200);
  return {
    cookie: (opened.headers.get("set-cookie") ?? "").split(";")[0]!,
    csrf: ((await opened.json()) as { csrf_token: string }).csrf_token,
  };
}

/** Assert the shared 503 shape and that no store detail leaked into it. */
async function expectSafe503(res: Response): Promise<void> {
  expect(res.status).toBe(503);
  expect(res.headers.get("retry-after")).toBeTruthy();
  expect(res.headers.get("cache-control")).toBe("no-store");
  const payload = (await res.json()) as { error: { code: string; message: string } };
  expect(payload.error.code).toBe("service_unavailable");
  expect(payload.error.message).not.toMatch(/DATABASE_URL|postgres|connection|ECONN|relation/i);
}

describe("management session reads survive a database outage as 503", () => {
  let store: InMemoryBenchmarkStore;
  let ownerSecret: string;
  let cookie: string;

  beforeEach(async () => {
    store = freshStore();
    ownerSecret = randomBase64Url32();
    await publishRun(ownerSecret);
    ({ cookie } = await openSession(ownerSecret));
  });

  const read = (extra: Record<string, string> = {}): Promise<Response> =>
    readMgmt(new Request(`${ORIGIN}/v1/management-sessions`, { headers: testHeaders(extra) }));

  it("answers 503, not 401, when the session lookup fails", async () => {
    store.getManagementSession = async (): Promise<never> => {
      throw new Error("could not connect to server: Connection refused");
    };
    await expectSafe503(await read({ cookie }));
  });

  it("answers 503 when the record lookup behind a valid session fails", async () => {
    store.getRunBySubmission = async (): Promise<never> => {
      throw new Error('relation "bench.benchmark_runs" does not exist');
    };
    await expectSafe503(await read({ cookie }));
  });

  it("answers 503 when the store cannot be constructed at all", async () => {
    __setTestStore(null);
    const savedUrl = process.env["DATABASE_URL"];
    delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
    try {
      await expectSafe503(await read({ cookie }));
    } finally {
      if (savedUrl === undefined) delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
      else (process.env as Record<string, string | undefined>)["DATABASE_URL"] = savedUrl;
    }
  });

  it("still distinguishes a genuinely absent session from an outage", async () => {
    expect((await read()).status).toBe(401);
    const healthy = await read({ cookie });
    expect(healthy.status).toBe(200);
    expect((await healthy.json()) as { submission_id: string }).toMatchObject({ submission_id: SUBMISSION });
  });
});

describe("closing a management session survives a database outage as 503", () => {
  let store: InMemoryBenchmarkStore;
  let ownerSecret: string;
  let cookie: string;
  let csrf: string;

  beforeEach(async () => {
    store = freshStore();
    ownerSecret = randomBase64Url32();
    await publishRun(ownerSecret);
    ({ cookie, csrf } = await openSession(ownerSecret));
  });

  const close = (extra: Record<string, string>): Promise<Response> =>
    closeMgmt(new Request(`${ORIGIN}/v1/management-sessions`, { method: "DELETE", headers: testHeaders(extra) }));

  it("answers 503 instead of reporting a revocation that never happened", async () => {
    store.getManagementSession = async (): Promise<never> => {
      throw new Error("could not connect to server: Connection refused");
    };
    await expectSafe503(await close({ cookie, origin: ORIGIN, "x-csrf-token": csrf }));
  });

  it("answers 503 when the revocation write itself fails", async () => {
    let attempted = false;
    store.revokeManagementSession = async (): Promise<never> => {
      attempted = true;
      throw new Error("could not connect to server: Connection refused");
    };
    await expectSafe503(await close({ cookie, origin: ORIGIN, "x-csrf-token": csrf }));
    expect(attempted).toBe(true);
    // The session is still live, which is exactly what the 503 claimed.
    const stillOpen = await readMgmt(new Request(`${ORIGIN}/v1/management-sessions`, { headers: testHeaders({ cookie }) }));
    expect(stillOpen.status).toBe(200);
  });

  it("answers 503 when the store cannot be constructed at all", async () => {
    __setTestStore(null);
    const savedUrl = process.env["DATABASE_URL"];
    delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
    try {
      await expectSafe503(await close({ cookie, origin: ORIGIN, "x-csrf-token": csrf }));
    } finally {
      if (savedUrl === undefined) delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
      else (process.env as Record<string, string | undefined>)["DATABASE_URL"] = savedUrl;
    }
  });

  it("never touches the store when there is nothing to revoke", async () => {
    store.getManagementSession = async (): Promise<never> => {
      throw new Error("the store must not be consulted here");
    };
    // No cookie at all.
    expect((await close({})).status).toBe(204);
    // A cookie that is not validly signed.
    expect((await close({ cookie: "aiolm_mgmt=forged.value" })).status).toBe(204);
  });

  it("still revokes normally, and still refuses a cross-origin close", async () => {
    expect((await close({ cookie, origin: "https://evil.example", "x-csrf-token": csrf })).status).toBe(403);
    expect((await close({ cookie, origin: ORIGIN, "x-csrf-token": csrf })).status).toBe(204);
    const afterClose = await readMgmt(new Request(`${ORIGIN}/v1/management-sessions`, { headers: testHeaders({ cookie }) }));
    expect(afterClose.status).toBe(401);
  });
});

afterEach(() => {
  __setTestStore(null);
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBase64Url32, sha256HexUtf8 } from "@/lib/crypto";
import { getServiceOrigin } from "@/lib/env";
import { syntheticSubmission } from "@/lib/fixtures";
import { encodeRecoveryCode } from "@/lib/recovery";
import { MANAGEMENT_SESSION_TTL_MS, UPLOAD_SESSION_TTL_MS } from "@/lib/permits";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { SESSION_RETENTION_MS } from "@/server/repository";
import { POST as createSession } from "@/app/v1/upload-sessions/route";
import { POST as verifySession } from "@/app/v1/upload-sessions/[id]/verify/route";
import { GET as pollSession } from "@/app/v1/upload-sessions/[id]/route";
import { POST as submitRun } from "@/app/v1/benchmark-runs/route";
import { DELETE as deleteRun } from "@/app/v1/benchmark-runs/[id]/route";
import { PATCH as editDescription } from "@/app/v1/benchmark-runs/[id]/description/route";
import { POST as openMgmt, GET as readMgmt, DELETE as closeMgmt } from "@/app/v1/management-sessions/route";
import { __setTestStore } from "@/server/store";
import { freshStore, setupTestEnv, testHeaders } from "./helpers";

setupTestEnv();

const ORIGIN = "http://localhost:3000";
const SUBMISSION = "00000000-0000-4000-8000-0000000000b1";

function publicationBody(submissionId: string, description = "Hardening."): { body: string; sha: string } {
  const benchmark = syntheticSubmission({ submission_id: submissionId });
  const body = JSON.stringify({ benchmark, description_md: description });
  return { body, sha: sha256HexUtf8(body) };
}

async function permitFor(ownerSecret: string, submissionId: string, bodySha: string): Promise<string> {
  const createRes = await createSession(
    new Request(`${ORIGIN}/v1/upload-sessions`, {
      method: "POST",
      headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json" }),
      body: JSON.stringify({ submission_id: submissionId, body_sha256: bodySha }),
    }),
  );
  expect(createRes.status).toBe(201);
  const { session_id: sessionId } = (await createRes.json()) as { session_id: string };
  const verified = await verifySession(
    new Request(`${ORIGIN}/v1/upload-sessions/${sessionId}/verify`, {
      method: "POST",
      headers: testHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ token: "test-turnstile-ok" }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
  expect(verified.status).toBe(200);
  const poll = (await (await pollSession(
    new Request(`${ORIGIN}/v1/upload-sessions/${sessionId}`, {
      headers: testHeaders({ authorization: `Bearer ${ownerSecret}` }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  )).json()) as { permit: string };
  return poll.permit;
}

async function publishRun(ownerSecret: string, submissionId = SUBMISSION): Promise<string> {
  const { body, sha } = publicationBody(submissionId);
  const permit = await permitFor(ownerSecret, submissionId, sha);
  const created = await submitRun(
    new Request(`${ORIGIN}/v1/benchmark-runs`, {
      method: "POST",
      headers: testHeaders({
        authorization: `Bearer ${ownerSecret}`,
        "content-type": "application/json",
        "x-upload-permit": permit,
        "idempotency-key": submissionId,
      }),
      body,
    }),
  );
  expect(created.status).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/** Publish a run and open a management session for it. */
async function publishedWithSession(
  ownerSecret: string,
  submissionId = SUBMISSION,
): Promise<{ publicId: string; cookie: string; csrf: string }> {
  const publicId = await publishRun(ownerSecret, submissionId);
  const opened = await openMgmt(
    new Request(`${ORIGIN}/v1/management-sessions`, {
      method: "POST",
      headers: testHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        recovery_code: encodeRecoveryCode({ version: 1, origin: ORIGIN, submission_id: submissionId, secret: ownerSecret }),
      }),
    }),
  );
  expect(opened.status).toBe(200);
  const csrf = ((await opened.json()) as { csrf_token: string }).csrf_token;
  const cookie = (opened.headers.get("set-cookie") ?? "").split(";")[0]!;
  return { publicId, cookie, csrf };
}

describe("service origin policy", () => {
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

  it("rejects the HTTP debug loopback in production but keeps it in development/test", () => {
    const env = process.env as Record<string, string | undefined>;
    for (const loopback of ["http://localhost:3000", "http://127.0.0.1:3000"]) {
      env["SERVICE_ORIGIN"] = loopback;
      env["NODE_ENV"] = "production";
      expect(() => getServiceOrigin()).toThrow(/HTTPS/);
      env["NODE_ENV"] = "development";
      expect(getServiceOrigin()).toBe(loopback);
      env["NODE_ENV"] = "test";
      expect(getServiceOrigin()).toBe(loopback);
    }
  });

  it("accepts an HTTPS root origin in production", () => {
    const env = process.env as Record<string, string | undefined>;
    env["NODE_ENV"] = "production";
    env["SERVICE_ORIGIN"] = "https://benchmarks.example.com";
    expect(getServiceOrigin()).toBe("https://benchmarks.example.com");
  });
});

describe("management mutation Origin header", () => {
  let ownerSecret: string;
  beforeEach(() => {
    freshStore();
    ownerSecret = randomBase64Url32();
  });

  const edit = async (
    cookie: string,
    csrf: string,
    publicId: string,
    origin: string | null,
    revision: number,
  ): Promise<Response> => {
    const extra: Record<string, string> = { cookie, "x-csrf-token": csrf, "content-type": "application/json" };
    if (origin !== null) extra["origin"] = origin;
    return editDescription(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/description`, {
        method: "PATCH",
        headers: testHeaders(extra),
        body: JSON.stringify({ description_md: `edit-${revision}`, expected_revision: revision }),
      }),
      { params: Promise.resolve({ id: publicId }) },
    );
  };

  it("accepts the exact canonical origin with a valid CSRF token", async () => {
    const { publicId, cookie, csrf } = await publishedWithSession(ownerSecret);
    expect((await edit(cookie, csrf, publicId, ORIGIN, 1)).status).toBe(200);
  });

  it("rejects Origin values that are not the exact canonical origin", async () => {
    const { publicId, cookie, csrf } = await publishedWithSession(ownerSecret);
    // new URL(header).origin normalized every one of these back to the
    // configured origin and let them through.
    for (const origin of [
      `${ORIGIN}/`,
      `${ORIGIN}/evil`,
      `${ORIGIN}/?q=1`,
      `${ORIGIN}/#f`,
      "http://user:pass@localhost:3000",
      "http://attacker@localhost:3000",
      "https://localhost:3000",
      "http://localhost:3001",
      "https://evil.example",
      "null",
      "",
    ]) {
      const res = await edit(cookie, csrf, publicId, origin, 1);
      expect(res.status).toBe(403);
    }
    // A missing Origin header is rejected too.
    expect((await edit(cookie, csrf, publicId, null, 1)).status).toBe(403);
    // None of the above consumed the revision: the legitimate edit still applies.
    expect((await edit(cookie, csrf, publicId, ORIGIN, 1)).status).toBe(200);
  });

  it("rejects a valid origin without a CSRF token", async () => {
    const { publicId, cookie } = await publishedWithSession(ownerSecret);
    const res = await editDescription(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/description`, {
        method: "PATCH",
        headers: testHeaders({ cookie, origin: ORIGIN, "content-type": "application/json" }),
        body: JSON.stringify({ description_md: "no csrf", expected_revision: 1 }),
      }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(res.status).toBe(403);
  });
});

describe("management session creation fails closed", () => {
  let store: InMemoryBenchmarkStore;
  let ownerSecret: string;
  const savedQuotaSecret = process.env["QUOTA_HMAC_SECRET"];
  const savedMgmtSecret = process.env["MANAGEMENT_HMAC_SECRET"];

  beforeEach(() => {
    store = freshStore();
    ownerSecret = randomBase64Url32();
  });
  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    env["QUOTA_HMAC_SECRET"] = savedQuotaSecret;
    env["MANAGEMENT_HMAC_SECRET"] = savedMgmtSecret;
  });

  const open = (headers: Record<string, string>, body: string): Promise<Response> =>
    openMgmt(new Request(`${ORIGIN}/v1/management-sessions`, { method: "POST", headers: new Headers(headers), body }));

  const validCode = (submissionId = SUBMISSION): string =>
    JSON.stringify({
      recovery_code: encodeRecoveryCode({ version: 1, origin: ORIGIN, submission_id: submissionId, secret: ownerSecret }),
    });

  it("returns 503 when no trusted client IP is available", async () => {
    // No x-synthetic-test-ip / x-vercel-forwarded-for: the budget is unkeyable.
    const res = await open({ "content-type": "application/json" }, validCode());
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await res.json()).toMatchObject({ error: { code: "service_unavailable" } });
    expect(store.mgmt.size).toBe(0);
  });

  it("returns 503 when QUOTA_HMAC_SECRET is not configured", async () => {
    delete (process.env as Record<string, string | undefined>)["QUOTA_HMAC_SECRET"];
    const res = await open({ "content-type": "application/json", "x-synthetic-test-ip": "10.0.0.7" }, validCode());
    expect(res.status).toBe(503);
    expect(store.mgmt.size).toBe(0);
  });

  it("returns 503 when the store cannot be constructed (no DATABASE_URL)", async () => {
    // No test store injected: getStore() builds the real Postgres store, which
    // throws when DATABASE_URL is absent. That must be a structured 503, not an
    // unhandled 500, and must not echo the database error.
    __setTestStore(null);
    const savedDbUrl = process.env["DATABASE_URL"];
    delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
    try {
      const res = await open({ "content-type": "application/json", "x-synthetic-test-ip": "10.0.0.7" }, validCode());
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBeTruthy();
      const payload = (await res.json()) as { error: { code: string; message: string } };
      expect(payload.error.code).toBe("service_unavailable");
      expect(payload.error.message).not.toMatch(/DATABASE_URL|postgres/i);
    } finally {
      if (savedDbUrl === undefined) delete (process.env as Record<string, string | undefined>)["DATABASE_URL"];
      else (process.env as Record<string, string | undefined>)["DATABASE_URL"] = savedDbUrl;
    }
  });

  it("returns 503 when the quota probe fails", async () => {
    store.quotaProbe = async (): Promise<number> => {
      throw new Error("quota store down");
    };
    const res = await open({ "content-type": "application/json", "x-synthetic-test-ip": "10.0.0.7" }, validCode());
    expect(res.status).toBe(503);
    expect(store.mgmt.size).toBe(0);
  });

  it("returns 503 when the atomic budget charge fails instead of letting the attempt through", async () => {
    store.quotaGateAtomic = async (): Promise<{ allowed: boolean; retryAfterSec: number }> => {
      throw new Error("quota store down");
    };
    const res = await open(
      { "content-type": "application/json", "x-synthetic-test-ip": "10.0.0.7" },
      JSON.stringify({ recovery_code: "aiolm-recovery-v1.invalid" }),
    );
    expect(res.status).toBe(503);
  });

  it("refuses to create a session row when MANAGEMENT_HMAC_SECRET is missing", async () => {
    await publishRun(ownerSecret);
    delete (process.env as Record<string, string | undefined>)["MANAGEMENT_HMAC_SECRET"];
    const res = await open({ "content-type": "application/json", "x-synthetic-test-ip": "10.0.0.7" }, validCode());
    expect(res.status).toBe(503);
    // No orphan row: the signing key is checked before anything is written.
    expect(store.mgmt.size).toBe(0);
  });

  it("charges malformed JSON against the invalid budget", async () => {
    const headers = { "content-type": "application/json", "x-synthetic-test-ip": "10.9.9.9" };
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await open(headers, "{not json")).status);
    expect(statuses.filter((s) => s === 400)).toHaveLength(10);
    const limited = await open(headers, "{not json");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    // The budget is per IP: a different client is untouched.
    expect((await open({ ...headers, "x-synthetic-test-ip": "10.9.9.10" }, "{not json")).status).toBe(400);
  });

  it("keeps owner bearer edit and deletion usable while the budget is unavailable", async () => {
    const publicId = await publishRun(ownerSecret);

    // Abuse protection is now entirely unavailable.
    delete (process.env as Record<string, string | undefined>)["QUOTA_HMAC_SECRET"];
    expect(
      (await open({ "content-type": "application/json", "x-synthetic-test-ip": "10.0.0.7" }, validCode())).status,
    ).toBe(503);

    const edited = await editDescription(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/description`, {
        method: "PATCH",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json" }),
        body: JSON.stringify({ description_md: "still editable", expected_revision: 1 }),
      }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(edited.status).toBe(200);

    const deleted = await deleteRun(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}`, {
        method: "DELETE",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}` }),
      }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(deleted.status).toBe(204);
  });

  it("keeps GET/DELETE of an existing session usable while the budget is unavailable", async () => {
    const { cookie, csrf } = await publishedWithSession(ownerSecret);
    delete (process.env as Record<string, string | undefined>)["QUOTA_HMAC_SECRET"];
    expect(
      (await readMgmt(new Request(`${ORIGIN}/v1/management-sessions`, { headers: testHeaders({ cookie }) }))).status,
    ).toBe(200);
    const closed = await closeMgmt(
      new Request(`${ORIGIN}/v1/management-sessions`, {
        method: "DELETE",
        headers: testHeaders({ cookie, origin: ORIGIN, "x-csrf-token": csrf }),
      }),
    );
    expect(closed.status).toBe(204);
  });
});

describe("session retention", () => {
  let store: InMemoryBenchmarkStore;
  beforeEach(() => {
    store = freshStore();
  });

  it("removes upload sessions only once the retention window has passed", async () => {
    const now = Date.now();
    await store.createUploadSession({
      session_id: "00000000-0000-4000-8000-0000000000c1",
      submission_id: SUBMISSION,
      body_sha256: "a".repeat(64),
      owner_hash: "b".repeat(64),
      expires_at: new Date(now + UPLOAD_SESSION_TTL_MS).toISOString(),
    });
    // Expired, but still inside the retention grace.
    expect(await store.pruneUploadSessions(now + UPLOAD_SESSION_TTL_MS + 1_000)).toBe(0);
    expect(await store.pruneUploadSessions(now + UPLOAD_SESSION_TTL_MS + SESSION_RETENTION_MS + 1_000)).toBe(1);
    expect(store.sessions.size).toBe(0);
  });

  it("removes management sessions after expiry or revocation, not before", async () => {
    const now = Date.now();
    await store.createManagementSession({
      id: "00000000-0000-4000-8000-0000000000c2",
      submission_id: SUBMISSION,
      csrf_token_hash: "c".repeat(64),
      expires_at: new Date(now + MANAGEMENT_SESSION_TTL_MS).toISOString(),
    });
    await store.createManagementSession({
      id: "00000000-0000-4000-8000-0000000000c3",
      submission_id: SUBMISSION,
      csrf_token_hash: "d".repeat(64),
      expires_at: new Date(now + MANAGEMENT_SESSION_TTL_MS).toISOString(),
    });
    await store.revokeManagementSession("00000000-0000-4000-8000-0000000000c3");

    expect(await store.pruneManagementSessions(now)).toBe(0);
    // The revoked session goes a full retention window after revocation, which
    // is before the other one's expiry plus retention.
    expect(await store.pruneManagementSessions(now + SESSION_RETENTION_MS + 1_000)).toBe(1);
    expect(store.mgmt.size).toBe(1);
    expect(await store.pruneManagementSessions(now + MANAGEMENT_SESSION_TTL_MS + SESSION_RETENTION_MS + 1_000)).toBe(1);
    expect(store.mgmt.size).toBe(0);
  });

  it("never touches reports or the audit log", async () => {
    const now = Date.now();
    await store.createReport({ target_submission_id: SUBMISSION, reason: "spam", reporter_ip_hmac: "hmac" });
    await store.audit("moderator", "hide", SUBMISSION, "policy");
    await store.pruneManagementSessions(now + 10 * SESSION_RETENTION_MS);
    await store.pruneUploadSessions(now + 10 * SESSION_RETENTION_MS);
    expect(store.reports.size).toBe(1);
    expect(store.audits).toHaveLength(1);
  });
});

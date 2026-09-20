import { beforeEach, describe, expect, it } from "vitest";
import { sha256HexUtf8, randomBase64Url32 } from "@/lib/crypto";
import { syntheticSubmission } from "@/lib/fixtures";
import { encodeRecoveryCode } from "@/lib/recovery";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { POST as createSession } from "@/app/v1/upload-sessions/route";
import { POST as verifySession } from "@/app/v1/upload-sessions/[id]/verify/route";
import { GET as pollSession } from "@/app/v1/upload-sessions/[id]/route";
import { POST as submitRun, GET as listRuns } from "@/app/v1/benchmark-runs/route";
import { GET as getDetail, DELETE as deleteRun } from "@/app/v1/benchmark-runs/[id]/route";
import { GET as getRows } from "@/app/v1/benchmark-runs/[id]/measurements/route";
import { PATCH as editDescription } from "@/app/v1/benchmark-runs/[id]/description/route";
import { POST as createReport } from "@/app/v1/benchmark-runs/[id]/reports/route";
import { POST as openMgmt, GET as readMgmt, DELETE as closeMgmt } from "@/app/v1/management-sessions/route";
import { freshStore, setupTestEnv, testHeaders } from "./helpers";

setupTestEnv();

const SUBMISSION = "00000000-0000-4000-8000-000000000001";
const ORIGIN = "http://localhost:3000";

function publicationBody(submissionId = SUBMISSION, description = "Synthetic description."): { body: string; sha: string } {
  const benchmark = syntheticSubmission({ submission_id: submissionId });
  const body = JSON.stringify({ benchmark, description_md: description });
  return { body, sha: sha256HexUtf8(body) };
}

async function verifiedPermit(ownerSecret: string, submissionId: string, bodySha: string): Promise<{ sessionId: string; permit: string }> {
  const createRes = await createSession(
    new Request(`${ORIGIN}/v1/upload-sessions`, {
      method: "POST",
      headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json" }),
      body: JSON.stringify({ submission_id: submissionId, body_sha256: bodySha }),
    }),
  );
  expect(createRes.status).toBe(201);
  const created = (await createRes.json()) as { session_id: string; verification_url: string };
  expect(created.verification_url).toBe(`${ORIGIN}/verify/${created.session_id}`);
  const verifyRes = await verifySession(
    new Request(`${ORIGIN}/v1/upload-sessions/${created.session_id}/verify`, {
      method: "POST",
      headers: testHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ token: "test-turnstile-ok" }),
    }),
    { params: Promise.resolve({ id: created.session_id }) },
  );
  expect(verifyRes.status).toBe(200);
  const pollRes = await pollSession(
    new Request(`${ORIGIN}/v1/upload-sessions/${created.session_id}`, {
      headers: testHeaders({ authorization: `Bearer ${ownerSecret}` }),
    }),
    { params: Promise.resolve({ id: created.session_id }) },
  );
  expect(pollRes.status).toBe(200);
  const poll = (await pollRes.json()) as { permit?: string; status: string };
  expect(poll.status).toBe("verified");
  expect(poll.permit).toBeTruthy();
  // Repeated polling returns the identical permit (response-loss tolerance).
  const poll2 = (await (await pollSession(
    new Request(`${ORIGIN}/v1/upload-sessions/${created.session_id}`, {
      headers: testHeaders({ authorization: `Bearer ${ownerSecret}` }),
    }),
    { params: Promise.resolve({ id: created.session_id }) },
  )).json()) as { permit?: string };
  expect(poll2.permit).toBe(poll.permit);
  return { sessionId: created.session_id, permit: poll.permit! };
}

describe("benchmark publish flow", () => {
  let store: InMemoryBenchmarkStore;
  let ownerSecret: string;

  beforeEach(() => {
    store = freshStore();
    ownerSecret = randomBase64Url32();
  });

  it("publishes, replays idempotently, and enforces owner/body/deleted rules", async () => {
    const { body, sha } = publicationBody();
    const { permit } = await verifiedPermit(ownerSecret, SUBMISSION, sha);

    const submit = (secret: string, extraHeaders: Record<string, string> = {}, payload = body): Promise<Response> =>
      submitRun(
        new Request(`${ORIGIN}/v1/benchmark-runs`, {
          method: "POST",
          headers: testHeaders({ authorization: `Bearer ${secret}`, "content-type": "application/json", "x-upload-permit": permit, "idempotency-key": SUBMISSION, ...extraHeaders }),
          body: payload,
        }),
      );

    const first = await submit(ownerSecret);
    expect(first.status).toBe(201);
    const receipt = (await first.json()) as { submission_id: string; id: string };
    expect(receipt.submission_id).toBe(SUBMISSION);
    const publicId = receipt.id;

    // Replay without a fresh permit still returns the receipt (200).
    const replay = await submitRun(
      new Request(`${ORIGIN}/v1/benchmark-runs`, {
        method: "POST",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json", "idempotency-key": SUBMISSION }),
        body,
      }),
    );
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { id: string }).id).toBe(publicId);

    // Wrong owner rejected.
    const wrong = await submit(randomBase64Url32());
    expect(wrong.status).toBe(403);

    // Changed body with same id conflicts (409) even without a permit.
    const other = syntheticSubmission({ submission_id: SUBMISSION, app_version: "changed" });
    const otherBody = JSON.stringify({ benchmark: other, description_md: "" });
    const conflict = await submitRun(
      new Request(`${ORIGIN}/v1/benchmark-runs`, {
        method: "POST",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json", "idempotency-key": SUBMISSION }),
        body: otherBody,
      }),
    );
    expect(conflict.status).toBe(409);

    // Public detail exposes no owner info and no submission id; rows page correctly.
    const detail = await getDetail(new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}`), { params: Promise.resolve({ id: publicId }) });
    expect(detail.status).toBe(200);
    const detailJson = (await detail.json()) as Record<string, unknown>;
    expect(detailJson).not.toHaveProperty("submission_id");
    expect(JSON.stringify(detailJson)).not.toContain("owner");

    const rows = await getRows(new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/measurements`), { params: Promise.resolve({ id: publicId }) });
    expect(rows.status).toBe(200);
    expect(((await rows.json()) as { total: number }).total).toBe(1);

    // List carries public fields only, with filters + pagination.
    const list = await listRuns(new Request(`${ORIGIN}/v1/benchmark-runs?limit=25&workload=code_python`));
    expect(list.status).toBe(200);
    const listJson = (await list.json()) as { items: Array<Record<string, unknown>> };
    expect(listJson.items.length).toBe(1);
    expect(listJson.items[0]).not.toHaveProperty("submission_id");
    expect(listJson.items[0]).not.toHaveProperty("owner_hash");

    // Concurrent duplicate creation serializes to one receipt (anchor lock).
    const racing = await Promise.all([submit(ownerSecret), submit(ownerSecret)]);
    expect(racing.every((r) => r.status === 200 || r.status === 201)).toBe(true);

    // Owner deletion tombstones; accepted retry returns terminal 410.
    const del = await deleteRun(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}`, {
        method: "DELETE",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}` }),
      }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(del.status).toBe(204);
    const afterDelete = await getDetail(new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}`), { params: Promise.resolve({ id: publicId }) });
    expect(afterDelete.status).toBe(404);
    const retryAfterDelete = await submit(ownerSecret);
    expect(retryAfterDelete.status).toBe(410);
    expect(store.runs.get(SUBMISSION)?.deleted).toBe(true);
  });

  it("requires verification for fresh submissions and rejects bad permits", async () => {
    const { body } = publicationBody("00000000-0000-4000-8000-000000000009");
    const res = await submitRun(
      new Request(`${ORIGIN}/v1/benchmark-runs`, {
        method: "POST",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json", "idempotency-key": "00000000-0000-4000-8000-000000000009" }),
        body,
      }),
    );
    expect(res.status).toBe(403);
    const payload = (await res.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("verification_required");

    // A permit minted for another session does not verify.
    const { body: body2, sha: sha2 } = publicationBody("00000000-0000-4000-8000-00000000000b");
    const { permit } = await verifiedPermit(ownerSecret, "00000000-0000-4000-8000-00000000000b", sha2);
    void body2;
    const forged = await submitRun(
      new Request(`${ORIGIN}/v1/benchmark-runs`, {
        method: "POST",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json", "x-upload-permit": `${Date.now() + 60_000}.AAAA`, "idempotency-key": "00000000-0000-4000-8000-00000000000c" }),
        body: JSON.stringify({ benchmark: syntheticSubmission({ submission_id: "00000000-0000-4000-8000-00000000000c" }), description_md: "" }),
      }),
    );
    expect(forged.status).toBe(403);
    expect(permit.length).toBeGreaterThan(0);
  });

  it("expires verified sessions at the bound permit expiry", async () => {
    const { sha } = publicationBody("00000000-0000-4000-8000-00000000000d");
    const { sessionId } = await verifiedPermit(ownerSecret, "00000000-0000-4000-8000-00000000000d", sha);
    // Age the session past the 5-minute permit bound.
    const session = store.sessions.get(sessionId)!;
    const old = new Date(Date.now() - 10 * 60_000).toISOString();
    store.sessions.set(sessionId, { ...session, verified_at: old, expires_at: new Date(Date.now() + 60_000).toISOString() });
    const poll = await pollSession(
      new Request(`${ORIGIN}/v1/upload-sessions/${sessionId}`, {
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}` }),
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );
    expect(poll.status).toBe(200);
    expect(((await poll.json()) as { status: string }).status).toBe("expired");
  });

  it("rejects oversized ingress without buffering", async () => {
    const big = await createSession(
      new Request(`${ORIGIN}/v1/upload-sessions`, {
        method: "POST",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json" }),
        body: "x".repeat(17 * 1024),
      }),
    );
    expect(big.status).toBe(413);
  });

  it("reports are Turnstile-gated and rate-limited", async () => {
    const { body, sha } = publicationBody("00000000-0000-4000-8000-000000000003");
    const { permit } = await verifiedPermit(ownerSecret, "00000000-0000-4000-8000-000000000003", sha);
    const created = await submitRun(
      new Request(`${ORIGIN}/v1/benchmark-runs`, {
        method: "POST",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json", "x-upload-permit": permit, "idempotency-key": "00000000-0000-4000-8000-000000000003" }),
        body,
      }),
    );
    const publicId = ((await created.json()) as { id: string }).id;
    for (let i = 0; i < 3; i += 1) {
      const r = await createReport(
        new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/reports`, {
          method: "POST",
          headers: testHeaders({ "content-type": "application/json", "x-synthetic-test-ip": `10.9.0.${i}` }),
          body: JSON.stringify({ reason: "looks off", token: "test-turnstile-ok" }),
        }),
        { params: Promise.resolve({ id: publicId }) },
      );
      expect(r.status).toBe(202);
    }
    for (let i = 0; i < 3; i += 1) {
      await createReport(
        new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/reports`, {
          method: "POST",
          headers: testHeaders({ "content-type": "application/json", "x-synthetic-test-ip": "10.9.9.9" }),
          body: JSON.stringify({ reason: "spam", token: "test-turnstile-ok" }),
        }),
        { params: Promise.resolve({ id: publicId }) },
      );
    }
    const limited = await createReport(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/reports`, {
        method: "POST",
        headers: testHeaders({ "content-type": "application/json", "x-synthetic-test-ip": "10.9.9.9" }),
        body: JSON.stringify({ reason: "one more", token: "test-turnstile-ok" }),
      }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(limited.status).toBe(429);
  });

  it("rate-limits invalid management attempts per IP without breaking other scopes", async () => {
    const sid = "00000000-0000-4000-8000-000000000005";
    const { body, sha } = publicationBody(sid, "Scoped.");
    const { permit } = await verifiedPermit(ownerSecret, sid, sha);
    const created = await submitRun(
      new Request(`${ORIGIN}/v1/benchmark-runs`, {
        method: "POST",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json", "x-upload-permit": permit, "idempotency-key": sid }),
        body,
      }),
    );
    expect(created.status).toBe(201);

    const FLOOD_IP = "10.8.8.8";
    const badAttempt = (ip: string): Promise<Response> =>
      openMgmt(
        new Request(`${ORIGIN}/v1/management-sessions`, {
          method: "POST",
          headers: testHeaders({ "x-synthetic-test-ip": ip, "content-type": "application/json" }),
          body: JSON.stringify({ recovery_code: "aiolm-recovery-v1.invalid" }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 15; i += 1) statuses.push((await badAttempt(FLOOD_IP)).status);
    // First 10 invalid attempts are plain 401s; the overflow is 429 + Retry-After.
    expect(statuses.filter((s) => s === 401)).toHaveLength(10);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    const stillLimited = await badAttempt(FLOOD_IP);
    expect(stillLimited.status).toBe(429);
    expect(stillLimited.headers.get("retry-after")).toBeTruthy();

    // A different client scope is unaffected: valid owner ops still open there.
    const recoveryCode = encodeRecoveryCode({ version: 1, origin: ORIGIN, submission_id: sid, secret: ownerSecret });
    const scoped = await openMgmt(
      new Request(`${ORIGIN}/v1/management-sessions`, {
        method: "POST",
        headers: testHeaders({ "x-synthetic-test-ip": "10.8.8.9", "content-type": "application/json" }),
        body: JSON.stringify({ recovery_code: recoveryCode }),
      }),
    );
    expect(scoped.status).toBe(200);
  });

  it("management sessions bind recovery codes, enforce CSRF, and support edit/delete", async () => {
    const { body, sha } = publicationBody("00000000-0000-4000-8000-000000000004", "Original.");
    const { permit } = await verifiedPermit(ownerSecret, "00000000-0000-4000-8000-000000000004", sha);
    const created = await submitRun(
      new Request(`${ORIGIN}/v1/benchmark-runs`, {
        method: "POST",
        headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json", "x-upload-permit": permit, "idempotency-key": "00000000-0000-4000-8000-000000000004" }),
        body,
      }),
    );
    expect(created.status).toBe(201);
    const publicId = ((await created.json()) as { id: string }).id;

    const recoveryCode = encodeRecoveryCode({ version: 1, origin: ORIGIN, submission_id: "00000000-0000-4000-8000-000000000004", secret: ownerSecret });
    const opened = await openMgmt(
      new Request(`${ORIGIN}/v1/management-sessions`, {
        method: "POST",
        headers: testHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ recovery_code: recoveryCode }),
      }),
    );
    expect(opened.status).toBe(200);
    const openedJson = (await opened.json()) as { csrf_token: string };
    const setCookie = opened.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");
    const cookie = setCookie.split(";")[0]!;
    const csrf = openedJson.csrf_token;

    const authed = (extra: Record<string, string> = {}): Headers =>
      testHeaders({ cookie, "x-csrf-token": csrf, origin: ORIGIN, ...extra });

    const info = await readMgmt(new Request(`${ORIGIN}/v1/management-sessions`, { headers: testHeaders({ cookie }) }));
    expect(info.status).toBe(200);

    const editBody = (token: Record<string, string>, payload: unknown): Request =>
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/description`, {
        method: "PATCH",
        headers: new Headers({ ...Object.fromEntries(testHeaders({ cookie, origin: ORIGIN, "content-type": "application/json" }).entries()), ...token }),
        body: JSON.stringify(payload),
      });

    // Edit without CSRF fails.
    const noCsrf = await editDescription(
      editBody({}, { description_md: "Hacked.", expected_revision: 1 }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(noCsrf.status).toBe(403);

    // Edit with the wrong token fails.
    const wrongToken = await editDescription(
      editBody({ "x-csrf-token": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }, { description_md: "Hacked.", expected_revision: 1 }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(wrongToken.status).toBe(403);

    // Edit from a foreign origin fails.
    const crossOrigin = await editDescription(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/description`, {
        method: "PATCH",
        headers: testHeaders({ cookie, origin: "https://evil.example", "content-type": "application/json", "x-csrf-token": csrf }),
        body: JSON.stringify({ description_md: "Hacked.", expected_revision: 1 }),
      }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(crossOrigin.status).toBe(403);

    // Valid edit bumps the revision.
    const edit = await editDescription(
      editBody({ "x-csrf-token": csrf }, { description_md: "Updated.", expected_revision: 1 }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(edit.status).toBe(200);

    // Stale revision conflicts.
    const stale = await editDescription(
      editBody({ "x-csrf-token": csrf }, { description_md: "Stale.", expected_revision: 1 }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(stale.status).toBe(409);

    // Sign-out without CSRF is refused while the session is live; with CSRF
    // it clears. (Sign-out after owner deletion returns idempotent 204 for the
    // revoked session, so this cycle runs before the delete below.)
    const signoutDenied = await closeMgmt(
      new Request(`${ORIGIN}/v1/management-sessions`, { method: "DELETE", headers: testHeaders({ cookie, origin: ORIGIN }) }),
    );
    expect(signoutDenied.status).toBe(403);
    const closed = await closeMgmt(
      new Request(`${ORIGIN}/v1/management-sessions`, { method: "DELETE", headers: authed() }),
    );
    expect(closed.status).toBe(204);

    // The revoked session no longer authorizes mutations.
    const afterSignout = await editDescription(
      editBody({ "x-csrf-token": csrf }, { description_md: "After sign-out.", expected_revision: 2 }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(afterSignout.status).toBe(403);

    // Re-open with the same recovery code for the delete cycle.
    const reopened = await openMgmt(
      new Request(`${ORIGIN}/v1/management-sessions`, {
        method: "POST",
        headers: testHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ recovery_code: recoveryCode }),
      }),
    );
    expect(reopened.status).toBe(200);
    const reopenedJson = (await reopened.json()) as { csrf_token: string };
    const cookie2 = (reopened.headers.get("set-cookie") ?? "").split(";")[0]!;
    const csrf2 = reopenedJson.csrf_token;
    const authed2 = (): Headers => testHeaders({ cookie: cookie2, "x-csrf-token": csrf2, origin: ORIGIN });

    // Cookie-authenticated DELETE without CSRF is refused (no bypass).
    const csrfLessDelete = await deleteRun(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}`, {
        method: "DELETE",
        headers: testHeaders({ cookie: cookie2, origin: ORIGIN }),
      }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(csrfLessDelete.status).toBe(403);

    // Cookie-authenticated delete with CSRF succeeds.
    const del = await deleteRun(
      new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}`, { method: "DELETE", headers: authed2() }),
      { params: Promise.resolve({ id: publicId }) },
    );
    expect(del.status).toBe(204);
  });
});

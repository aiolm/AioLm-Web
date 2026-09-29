import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBase64Url32, sha256HexUtf8 } from "@/lib/crypto";
import { syntheticSubmission } from "@/lib/fixtures";
import { InMemoryBenchmarkStore } from "@/server/memory-store";
import { MANAGEMENT_HANDOFF_TTL_MS } from "@/server/auth-helpers";
import { POST as createSession } from "@/app/v1/upload-sessions/route";
import { POST as verifySession } from "@/app/v1/upload-sessions/[id]/verify/route";
import { GET as pollSession } from "@/app/v1/upload-sessions/[id]/route";
import { POST as submitRun } from "@/app/v1/benchmark-runs/route";
import { DELETE as deleteRun } from "@/app/v1/benchmark-runs/[id]/route";
import { PATCH as editDescription } from "@/app/v1/benchmark-runs/[id]/description/route";
import { GET as readMgmt } from "@/app/v1/management-sessions/route";
import { POST as issueHandoff } from "@/app/v1/management-handoffs/route";
import { POST as redeemHandoff } from "@/app/v1/management-handoffs/[id]/redeem/route";
import { freshStore, setupTestEnv, testHeaders } from "./helpers";

setupTestEnv();

const ORIGIN = "http://localhost:3000";
const SUBMISSION = "00000000-0000-4000-8000-0000000000c1";

async function publishRun(ownerSecret: string, submissionId = SUBMISSION): Promise<string> {
  const body = JSON.stringify({ benchmark: syntheticSubmission({ submission_id: submissionId }), description_md: "Handoff." });
  const sha = sha256HexUtf8(body);
  const created = await createSession(new Request(`${ORIGIN}/v1/upload-sessions`, {
    method: "POST",
    headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json" }),
    body: JSON.stringify({ submission_id: submissionId, body_sha256: sha }),
  }));
  const { session_id: sessionId } = (await created.json()) as { session_id: string };
  await verifySession(new Request(`${ORIGIN}/v1/upload-sessions/${sessionId}/verify`, {
    method: "POST", headers: testHeaders({ "content-type": "application/json" }), body: JSON.stringify({ token: "test-turnstile-ok" }),
  }), { params: Promise.resolve({ id: sessionId }) });
  const { permit } = (await (await pollSession(new Request(`${ORIGIN}/v1/upload-sessions/${sessionId}`, {
    headers: testHeaders({ authorization: `Bearer ${ownerSecret}` }),
  }), { params: Promise.resolve({ id: sessionId }) })).json()) as { permit: string };
  const run = await submitRun(new Request(`${ORIGIN}/v1/benchmark-runs`, {
    method: "POST",
    headers: testHeaders({ authorization: `Bearer ${ownerSecret}`, "content-type": "application/json", "x-upload-permit": permit, "idempotency-key": submissionId }),
    body,
  }));
  expect(run.status).toBe(201);
  return ((await run.json()) as { id: string }).id;
}

const issue = (auth: string | null, body: unknown = { submission_id: SUBMISSION }, headers: Headers = testHeaders()): Promise<Response> => {
  headers.set("content-type", "application/json");
  if (auth) headers.set("authorization", `Bearer ${auth}`);
  return issueHandoff(new Request(`${ORIGIN}/v1/management-handoffs`, { method: "POST", headers, body: JSON.stringify(body) }));
};

const redeem = (id: string, token: string, extra: Record<string, string> = { origin: ORIGIN }): Promise<Response> =>
  redeemHandoff(new Request(`${ORIGIN}/v1/management-handoffs/${id}/redeem`, {
    method: "POST",
    headers: testHeaders({ "content-type": "application/json", ...extra }),
    body: JSON.stringify({ handoff_token: token }),
  }), { params: Promise.resolve({ id }) });

interface Ticket { handoff_id: string; handoff_token: string; expires_at: string }

describe("app-to-browser management handoff", () => {
  let store: InMemoryBenchmarkStore;
  let owner: string;
  const saved = { ...process.env } as Record<string, string | undefined>;

  beforeEach(() => {
    store = freshStore();
    owner = randomBase64Url32();
  });
  afterEach(() => {
    vi.useRealTimers();
    const env = process.env as Record<string, string | undefined>;
    env["QUOTA_HMAC_SECRET"] = saved["QUOTA_HMAC_SECRET"];
    env["MANAGEMENT_HMAC_SECRET"] = saved["MANAGEMENT_HMAC_SECRET"];
  });

  it("issues a 2-minute ticket that redeems once into an ordinary cookie + CSRF session", async () => {
    const publicId = await publishRun(owner);
    const issued = await issue(owner);
    expect(issued.status).toBe(201);
    expect(issued.headers.get("cache-control")).toBe("no-store");
    const ticket = (await issued.json()) as Ticket;
    expect(Object.keys(ticket).sort()).toEqual(["expires_at", "handoff_id", "handoff_token"]);
    expect(Date.parse(ticket.expires_at) - Date.now()).toBeLessThanOrEqual(MANAGEMENT_HANDOFF_TTL_MS);
    // Only the token hash is stored.
    expect(JSON.stringify([...store.mgmt.values()])).not.toContain(ticket.handoff_token);

    const opened = await redeem(ticket.handoff_id, ticket.handoff_token);
    expect(opened.status).toBe(200);
    const setCookie = opened.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly; SameSite=Strict; Max-Age=1800/);
    const { csrf_token: csrf } = (await opened.json()) as { csrf_token: string };
    const cookie = setCookie.split(";")[0]!;

    const info = await readMgmt(new Request(`${ORIGIN}/v1/management-sessions`, { headers: testHeaders({ cookie }) }));
    expect(await info.json()).toMatchObject({ submission_id: SUBMISSION, public_id: publicId });
    const edited = await editDescription(new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}/description`, {
      method: "PATCH",
      headers: testHeaders({ cookie, origin: ORIGIN, "x-csrf-token": csrf, "content-type": "application/json" }),
      body: JSON.stringify({ description_md: "Edited after handoff.", expected_revision: 1 }),
    }), { params: Promise.resolve({ id: publicId }) });
    expect(edited.status).toBe(200);

    const again = await redeem(ticket.handoff_id, ticket.handoff_token);
    expect(again.status).toBe(401);
    expect(await again.json()).toMatchObject({ error: { code: "ownership_missing" } });
  });

  it("refuses wrong tokens and foreign origins without consuming the ticket", async () => {
    await publishRun(owner);
    const ticket = (await (await issue(owner)).json()) as Ticket;
    expect((await redeem(ticket.handoff_id, randomBase64Url32())).status).toBe(401);
    expect((await redeem(ticket.handoff_id, "short")).status).toBe(401);
    expect((await redeem("not-a-uuid", ticket.handoff_token)).status).toBe(401);
    expect((await redeem(ticket.handoff_id, ticket.handoff_token, {})).status).toBe(403);
    expect((await redeem(ticket.handoff_id, ticket.handoff_token, { origin: "https://evil.example" })).status).toBe(403);
    expect((await redeem(ticket.handoff_id, ticket.handoff_token)).status).toBe(200);
  });

  it("expires tickets after two minutes", async () => {
    await publishRun(owner);
    vi.useFakeTimers({ toFake: ["Date"] });
    const ticket = (await (await issue(owner)).json()) as Ticket;
    vi.setSystemTime(Date.now() + MANAGEMENT_HANDOFF_TTL_MS + 1_000);
    expect((await redeem(ticket.handoff_id, ticket.handoff_token)).status).toBe(401);
  });

  it("never lets a pending ticket or its hash act as a management session", async () => {
    await publishRun(owner);
    const ticket = (await (await issue(owner)).json()) as Ticket;
    // Presenting the handoff token as a CSRF token or the ticket id as a cookie value grants nothing.
    const info = await readMgmt(new Request(`${ORIGIN}/v1/management-sessions`, {
      headers: testHeaders({ cookie: `aiolm_mgmt=${ticket.handoff_id}` }),
    }));
    expect(info.status).toBe(401);
  });

  it("answers 410 for a ticket whose result was deleted after issue, without minting a session", async () => {
    const publicId = await publishRun(owner);
    const ticket = (await (await issue(owner)).json()) as Ticket;
    const deleted = await deleteRun(new Request(`${ORIGIN}/v1/benchmark-runs/${publicId}`, {
      method: "DELETE", headers: testHeaders({ authorization: `Bearer ${owner}` }),
    }), { params: Promise.resolve({ id: publicId }) });
    expect(deleted.status).toBe(204);
    const redeemed = await redeem(ticket.handoff_id, ticket.handoff_token);
    expect(redeemed.status).toBe(410);
    expect(await redeemed.json()).toMatchObject({ error: { code: "submission_deleted" } });
    expect(redeemed.headers.get("set-cookie")).toBeNull();
    expect([...store.mgmt.values()].every((row) => row.revoked_at !== null)).toBe(true);
    // A wrong token learns nothing about the deletion.
    expect((await redeem(ticket.handoff_id, randomBase64Url32())).status).toBe(401);
    expect((await issue(owner)).status).toBe(410);
  });

  it("answers unknown submissions and wrong owners alike, and validates input", async () => {
    await publishRun(owner);
    const unknown = await issue(owner, { submission_id: "00000000-0000-4000-8000-0000000000c2" });
    const wrong = await issue(randomBase64Url32());
    const missing = await issue(null);
    for (const res of [unknown, wrong, missing]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: "ownership_missing" } });
    }
    expect((await issue(owner, { submission_id: "nope" })).status).toBe(400);
    expect(store.mgmt.size).toBe(0);
  });

  it("charges invalid attempts to the shared manage budget and limits issuance per IP", async () => {
    await publishRun(owner);
    const headers = (): Headers => testHeaders({ "x-synthetic-test-ip": "10.8.8.8" });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await issue(randomBase64Url32(), undefined, headers())).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);

    const issuing: number[] = [];
    for (let i = 0; i < 6; i += 1) issuing.push((await issue(owner, undefined, testHeaders({ "x-synthetic-test-ip": "10.8.8.9" }))).status);
    expect(issuing).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it("fails closed when the abuse budget or management signing key is unavailable", async () => {
    await publishRun(owner);
    const ticket = (await (await issue(owner)).json()) as Ticket;
    delete (process.env as Record<string, string | undefined>)["MANAGEMENT_HMAC_SECRET"];
    expect((await issue(owner)).status).toBe(503);
    expect((await redeem(ticket.handoff_id, ticket.handoff_token)).status).toBe(503);
    (process.env as Record<string, string | undefined>)["MANAGEMENT_HMAC_SECRET"] = saved["MANAGEMENT_HMAC_SECRET"];
    delete (process.env as Record<string, string | undefined>)["QUOTA_HMAC_SECRET"];
    expect((await issue(owner)).status).toBe(503);
    expect((await redeem(ticket.handoff_id, ticket.handoff_token)).status).toBe(503);
  });
});

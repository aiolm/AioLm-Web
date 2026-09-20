import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBase64Url32, sha256HexUtf8 } from "@/lib/crypto";
import { syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark } from "@/lib/summary";
import { mintUploadPermit, ownerHashFor, permitExpiryForSession } from "@/lib/permits";
import { applyMigrations } from "@/server/migrations";
import { PostgresBenchmarkStore } from "@/server/postgres-store";
import type { AcceptArgs } from "@/server/repository";
import { REQUIRED_MIGRATIONS } from "@/server/repository";
import { __setTestStore } from "@/server/store";
import { POST as createUploadSession } from "@/app/v1/upload-sessions/route";
import { POST as verifyUploadSession } from "@/app/v1/upload-sessions/[id]/verify/route";
import { GET as pollUploadSession } from "@/app/v1/upload-sessions/[id]/route";
import { POST as submitBenchmarkRun } from "@/app/v1/benchmark-runs/route";

/**
 * Live-Postgres integration on an isolated database. The connection comes from
 * PG_VALIDATION_CONNECTION_FILE (an explicitly provisioned scratch cluster) or
 * DATABASE_URL (the CI service).
 *
 * When neither is configured the whole suite is reported as SKIPPED by Vitest —
 * never as passing, so an unconfigured run can't be mistaken for a green one.
 * When PG_VALIDATION_CONNECTION_FILE *is* set, a missing, unreadable, or
 * malformed file is a hard failure: an explicit request for a real database
 * must never silently downgrade to a skip.
 *
 * Never touches production; the scratch databases and login roles are dropped
 * afterwards. Connection credentials are read but never logged.
 */

const PERMIT_SECRET = "it-permit-secret-0123456789abcdef";
const QUOTA_SECRET = "it-quota-secret-0123456789abcdef";
const MGMT_SECRET = "it-mgmt-secret-0123456789abcdef";
void MGMT_SECRET;

function resolveAdminUrl(): string | null {
  const file = process.env["PG_VALIDATION_CONNECTION_FILE"];
  if (file) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch (err) {
      throw new Error(
        `PG_VALIDATION_CONNECTION_FILE is set but could not be read: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    let parsed: { url?: unknown };
    try {
      parsed = JSON.parse(raw) as { url?: unknown };
    } catch {
      throw new Error("PG_VALIDATION_CONNECTION_FILE is set but does not contain valid JSON.");
    }
    if (typeof parsed.url !== "string" || parsed.url.length === 0) {
      throw new Error('PG_VALIDATION_CONNECTION_FILE is set but has no usable "url" field.');
    }
    return parsed.url;
  }
  return process.env["DATABASE_URL"] ?? null;
}

const ADMIN_URL = resolveAdminUrl();
if (!ADMIN_URL) {
  console.warn("SKIP postgres integration: set PG_VALIDATION_CONNECTION_FILE or DATABASE_URL.");
}

function acceptArgs(submissionId: string, ownerSecret: string, permit: string, quota: AcceptArgs["quota"]): AcceptArgs {
  const benchmark = syntheticSubmission({ submission_id: submissionId });
  const body = JSON.stringify({ benchmark, description_md: "integration" });
  return {
    submission_id: submissionId,
    public_id: `b${randomUUID().replace(/-/g, "").slice(0, 11)}`,
    owner_hash: ownerHashFor(ownerSecret),
    body_sha256: sha256HexUtf8(body),
    benchmarkMeta: { ...benchmark, measurements: { ...benchmark.measurements, rows: [] } },
    rows: benchmark.measurements.rows,
    description_md: "integration",
    summary: summarizeBenchmark(benchmark),
    byte_size: Buffer.byteLength(body),
    row_count: benchmark.measurements.rows.length,
    permit,
    permitSecret: PERMIT_SECRET,
    quotaSecret: QUOTA_SECRET,
    ip: "10.20.30.40",
    nowMs: Date.now(),
    quota,
    capacity: { bytes: null, rows: null, strictMissing: false },
  };
}

const GENEROUS_QUOTA: AcceptArgs["quota"] = {
  perIpHour: 1000, perIpDay: 1000, globalDay: 1000,
  globalBytesDay: 1_000_000_000, globalRowsDay: 10_000_000,
  sessionCreatePerMinIp: 1000, invalidManagePerMinIp: 1000, reportPerHourIp: 1000,
};

// Reported as SKIPPED by Vitest when no database is configured; never passed.
describe.skipIf(ADMIN_URL === null)("postgres integration", () => {
  let admin: postgres.Sql | null = null;
  let db: postgres.Sql | null = null;
  let store: PostgresBenchmarkStore | null = null;
  let dbName = "";
  let ownerUrl = "";
  let runtimeUrl = "";
  let moderationUrl = "";
  const users: string[] = [];

  beforeAll(async () => {
    const adminUrl = ADMIN_URL!;
    admin = postgres(adminUrl, { max: 1, prepare: false, ssl: false });
    dbName = `aiolm_web_it_${Date.now().toString(36)}`;
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    const dbUrl = new URL(adminUrl);
    dbUrl.pathname = `/${dbName}`;
    ownerUrl = dbUrl.toString();
    db = postgres(ownerUrl, { max: 4, prepare: false, ssl: false });
    await applyMigrations(db);
    // Least-privilege login roles inheriting the NOLOGIN privilege roles.
    const mkUser = async (grant: string): Promise<string> => {
      const name = `it_${grant}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/-/g, "");
      const password = randomBase64Url32();
      await admin!.unsafe(`CREATE USER "${name}" PASSWORD '${password}'`);
      await admin!.unsafe(`GRANT "${grant}" TO "${name}"`);
      users.push(name);
      const userUrl = new URL(adminUrl);
      userUrl.username = name;
      userUrl.password = password;
      userUrl.pathname = `/${dbName}`;
      return userUrl.toString();
    };
    runtimeUrl = await mkUser("aiolm_web_runtime");
    moderationUrl = await mkUser("aiolm_web_moderation");
    store = new PostgresBenchmarkStore(db);
  }, 120_000);

  afterAll(async () => {
    if (db) await db.end({ timeout: 5 });
    if (admin) {
      try {
        if (dbName) {
          await admin.unsafe(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
          );
          await admin.unsafe(`DROP DATABASE "${dbName}"`);
        }
        for (const user of users) await admin.unsafe(`DROP USER "${user}"`);
      } finally {
        await admin.end({ timeout: 5 });
      }
    }
    admin = null;
    db = null;
    store = null;
  }, 120_000);

  // Inside this describe the database is always configured (the suite is
  // skipped outright otherwise); need() exists only to narrow the nullable
  // handle that beforeAll assigns.
  const need = (): PostgresBenchmarkStore | null => store;

  async function verifiedSession(submissionId: string, ownerSecret: string, bodySha: string): Promise<string> {
    const s = need();
    if (!s) throw new Error("integration database unavailable");
    const sessionId = randomUUID();
    const ownerHash = ownerHashFor(ownerSecret);
    await s.createUploadSession({
      session_id: sessionId, submission_id: submissionId, body_sha256: bodySha,
      owner_hash: ownerHash, expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    const verified = await s.markSessionVerified(sessionId);
    expect(verified?.status).toBe("verified");
    const permitExpiry = permitExpiryForSession(Date.parse(verified!.expires_at), Date.parse(verified!.verified_at!));
    return mintUploadPermit({
      permitSecret: PERMIT_SECRET, sessionId, submissionId, bodySha256: bodySha,
      ownerHash, expiresAtMs: permitExpiry,
    }).permit;
  }

  it("applies migrations exactly once", async () => {
    if (!db) return;
    expect(await applyMigrations(db)).toEqual([]);
    const rows = await db`select filename from bench.schema_migrations order by filename`;
    expect(rows.map((r) => r.filename)).toEqual([
      "001_init.sql", "002_roles.sql", "003_least_privilege.sql",
      "004_filter_indexes.sql", "005_retention_grants.sql", "006_trgm_filter_indexes.sql",
      "007_readiness_grant.sql",
    ]);
  });

  it("backs list filters and pagination with indexes", async () => {
    if (!db) return;
    const idx = await db`select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`;
    const names = idx.map((r) => r.indexname as string);
    // Keyset pagination ordering is index-backed.
    expect(names).toContain("benchmark_runs_created_idx");
    const ext = await db`select count(*)::text as n from pg_extension where extname = 'pg_trgm'`;
    if ((ext[0]!.n as string) !== "0") {
      for (const name of [
        "benchmark_runs_model_trgm",
        "benchmark_runs_hardware_trgm",
        "benchmark_runs_method_trgm",
        "benchmark_runs_workload_trgm",
      ]) {
        expect(names).toContain(name);
      }
    }
    // Planner evidence: with scans disabled the list query shape is served by
    // the pagination index (honest usability proof on a small table; at scale
    // the planner picks it without the hint).
    const plan = await db.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      return tx`explain select public_id from bench.benchmark_runs
        where deleted = false and hidden = false
        order by created_at desc, public_id desc limit 25`;
    });
    expect(JSON.stringify(plan)).toMatch(/benchmark_runs_created_idx/);
  });

  it("serializes concurrent acceptance to one receipt", async () => {
    const s = need();
    if (!s) return;
    const submissionId = randomUUID();
    const ownerSecret = randomBase64Url32();
    const benchmark = syntheticSubmission({ submission_id: submissionId });
    const body = JSON.stringify({ benchmark, description_md: "integration" });
    const permit = await verifiedSession(submissionId, ownerSecret, sha256HexUtf8(body));
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => s.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))),
    );
    expect(outcomes.filter((o) => o.outcome === "created")).toHaveLength(1);
    expect(outcomes.filter((o) => o.outcome === "replay")).toHaveLength(7);

    const wrongOwner = await s.acceptRunAtomic(acceptArgs(submissionId, randomBase64Url32(), permit, GENEROUS_QUOTA));
    expect(wrongOwner.outcome).toBe("conflict-owner");
    const otherBody = { ...acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA), body_sha256: "c".repeat(64) };
    expect((await s.acceptRunAtomic(otherBody)).outcome).toBe("conflict-body");
  });

  it("keeps delete+upload races terminal", async () => {
    const s = need();
    if (!s) return;
    const submissionId = randomUUID();
    const ownerSecret = randomBase64Url32();
    const benchmark = syntheticSubmission({ submission_id: submissionId });
    const body = JSON.stringify({ benchmark, description_md: "integration" });
    const permit = await verifiedSession(submissionId, ownerSecret, sha256HexUtf8(body));
    const first = await s.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA));
    expect(first.outcome).toBe("created");
    await s.deleteRun(submissionId);
    const racing = await Promise.all(
      Array.from({ length: 4 }, () => s.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))),
    );
    expect(racing.every((o) => o.outcome === "deleted")).toBe(true);
  });

  it("enforces quotas atomically under concurrency", async () => {
    const s = need();
    if (!s) return;
    const tight = { ...GENEROUS_QUOTA, perIpHour: 3 };
    const setups = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const submissionId = randomUUID();
        const ownerSecret = randomBase64Url32();
        const benchmark = syntheticSubmission({ submission_id: submissionId });
        const body = JSON.stringify({ benchmark, description_md: "integration" });
        const permit = await verifiedSession(submissionId, ownerSecret, sha256HexUtf8(body));
        return acceptArgs(submissionId, ownerSecret, permit, tight);
      }),
    );
    // Same IP across all six: exactly three win, three hit the quota.
    const withSameIp = setups.map((a) => ({ ...a, ip: "10.99.99.99" }));
    const outcomes = await Promise.all(withSameIp.map((a) => s.acceptRunAtomic(a)));
    expect(outcomes.filter((o) => o.outcome === "created")).toHaveLength(3);
    expect(outcomes.filter((o) => o.outcome === "quota")).toHaveLength(3);
  });

  it("stores metadata once and reads only requested chunks", async () => {
    const s = need();
    if (!s || !db) return;
    const submissionId = randomUUID();
    const ownerSecret = randomBase64Url32();
    const row = syntheticSubmission().measurements.rows[0]!;
    const benchmark = syntheticSubmission({
      submission_id: submissionId,
      measurements: { status: "complete", rows: Array.from({ length: 2500 }, () => ({ ...row })) },
    });
    const body = JSON.stringify({ benchmark, description_md: "integration" });
    const bodySha = sha256HexUtf8(body);
    const permit = await verifiedSession(submissionId, ownerSecret, bodySha);
    const created = await s.acceptRunAtomic({ ...acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA),
      // The permit binds the EXACT 2500-row body: override the 1-row
      // acceptArgs hash/summary to match the minted session binding.
      body_sha256: bodySha,
      summary: summarizeBenchmark(benchmark),
      benchmarkMeta: { ...benchmark, measurements: { ...benchmark.measurements, rows: [] } },
      rows: benchmark.measurements.rows, byte_size: Buffer.byteLength(body), row_count: 2500 });
    expect(created.outcome).toBe("created");
    const stored = await db!`select benchmark from bench.benchmark_runs where submission_id = ${submissionId}`;
    expect((stored[0]!.benchmark as { measurements: { rows: unknown[] } }).measurements.rows).toEqual([]);
    const page = await s.getRowSlice(submissionId, 1000, 1000);
    expect(page.rows).toHaveLength(1000);
    expect(page.total).toBe(2500);
    expect(page.nextOffset).toBe(2000);
    const listed = await s.listRuns({}, 25, null);
    const item = listed.items.find((i) => i.public_id === (created as { run: { public_id: string } }).run.public_id);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty("submission_id");
  });

  it("enforces least-privilege roles", async () => {
    if (!db) return;
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    const modSql = postgres(moderationUrl, { max: 1, prepare: false, ssl: false });
    const rt = new PostgresBenchmarkStore(rtSql);
    const mod = new PostgresBenchmarkStore(modSql);
    try {
      // Runtime serves the API: session + acceptance + owner delete work.
      const submissionId = randomUUID();
      const ownerSecret = randomBase64Url32();
      const benchmark = syntheticSubmission({ submission_id: submissionId });
      const body = JSON.stringify({ benchmark, description_md: "integration" });
      const sessionId = randomUUID();
      await rt.createUploadSession({
        session_id: sessionId, submission_id: submissionId, body_sha256: sha256HexUtf8(body),
        owner_hash: ownerHashFor(ownerSecret), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      await rt.markSessionVerified(sessionId);
      const session = (await rt.getUploadSession(sessionId))!;
      const permit = mintUploadPermit({
        permitSecret: PERMIT_SECRET, sessionId, submissionId, bodySha256: sha256HexUtf8(body),
        ownerHash: ownerHashFor(ownerSecret),
        expiresAtMs: permitExpiryForSession(Date.parse(session.expires_at), Date.parse(session.verified_at!)),
      }).permit;
      const created = await rt.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA));
      expect(created.outcome).toBe("created");
      // Runtime audit inserts work (sequence usage granted).
      await rt.audit("runtime", "publish", submissionId, null);
      // Runtime column grants exclude moderation writes: hidden stays operator-only.
      await expect(rt.setHidden(submissionId, true)).rejects.toThrow(/permission denied/);
      expect(await rt.deleteRun(submissionId)).not.toBeNull();

      // Runtime cannot read the audit log, run DDL, or dismiss reports.
      await expect(rtSql`select * from bench.audit_log limit 1`).rejects.toThrow();
      await expect(rtSql.unsafe("CREATE TABLE bench.it_probe (id int)")).rejects.toThrow();
      await expect(rt.deleteReport(randomUUID())).rejects.toThrow();

      // Reports enter through the public path; moderation triages but cannot create runs.
      const target = randomUUID();
      const reporter = await rt.createReport({ target_submission_id: target, reason: "triage", reporter_ip_hmac: null });
      expect((await mod.listReports(10)).some((r) => r.id === reporter.id)).toBe(true);
      await mod.setHidden(submissionId, true);
      await mod.audit("moderation-cli", "hide", submissionId, "test");
      await mod.deleteReport(reporter.id);
      await expect(mod.createUploadSession({
        session_id: randomUUID(), submission_id: randomUUID(), body_sha256: "a".repeat(64),
        owner_hash: "b".repeat(64), expires_at: new Date().toISOString(),
      })).rejects.toThrow();
      // Moderation cannot create runs or quota state either (direct SQL, least privilege).
      await expect(modSql`
        insert into bench.benchmark_runs (submission_id, public_id, owner_hash, body_sha256)
        values (${randomUUID()}, 'bxxxxxxxxxxx', ${"c".repeat(64)}, ${"d".repeat(64)})
      `).rejects.toThrow(/permission denied/);
      await expect(modSql`
        insert into bench.quota_buckets (key, count, bytes, rows, window_start, expires_at)
        values ('it:probe', 1, 0, 0, now(), now() + interval '1 hour')
      `).rejects.toThrow(/permission denied/);
    } finally {
      await rtSql.end({ timeout: 5 });
      await modSql.end({ timeout: 5 });
    }
  });

  it("prunes dead session rows under the runtime role, keeping the ledger intact", async () => {
    if (!db) return;
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    const rt = new PostgresBenchmarkStore(rtSql);
    try {
      // A run + its sessions, aged past the retention window in the database.
      const submissionId = randomUUID();
      const ownerSecret = randomBase64Url32();
      const benchmark = syntheticSubmission({ submission_id: submissionId });
      // acceptArgs() hashes this exact body; the upload session must bind it.
      const body = JSON.stringify({ benchmark, description_md: "integration" });
      const uploadId = randomUUID();
      await rt.createUploadSession({
        session_id: uploadId, submission_id: submissionId, body_sha256: sha256HexUtf8(body),
        owner_hash: ownerHashFor(ownerSecret), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
      await rt.markSessionVerified(uploadId);
      const verifiedUpload = (await rt.getUploadSession(uploadId))!;
      const permit = mintUploadPermit({
        permitSecret: PERMIT_SECRET, sessionId: uploadId, submissionId, bodySha256: sha256HexUtf8(body),
        ownerHash: ownerHashFor(ownerSecret),
        expiresAtMs: permitExpiryForSession(Date.parse(verifiedUpload.expires_at), Date.parse(verifiedUpload.verified_at!)),
      }).permit;
      expect((await rt.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))).outcome).toBe("created");
      await rt.audit("runtime", "publish", submissionId, null);
      const report = await rt.createReport({ target_submission_id: submissionId, reason: "retention", reporter_ip_hmac: "hmac" });

      const expiredMgmt = randomUUID();
      const revokedMgmt = randomUUID();
      for (const id of [expiredMgmt, revokedMgmt]) {
        await rt.createManagementSession({
          id, submission_id: submissionId, csrf_token_hash: "e".repeat(64),
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        });
      }
      await rt.revokeManagementSession(revokedMgmt);
      // A live session that must survive the prune.
      const liveMgmt = randomUUID();
      await rt.createManagementSession({
        id: liveMgmt, submission_id: submissionId, csrf_token_hash: "f".repeat(64),
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      });

      await db!`update bench.upload_sessions set expires_at = now() - interval '26 hours' where session_id = ${uploadId}`;
      await db!`update bench.management_sessions set expires_at = now() - interval '26 hours' where id = ${expiredMgmt}`;
      await db!`update bench.management_sessions set revoked_at = now() - interval '26 hours' where id = ${revokedMgmt}`;

      // Runtime holds exactly the DELETE grants the retention job needs (005).
      expect(await rt.pruneUploadSessions()).toBeGreaterThanOrEqual(1);
      expect(await rt.pruneManagementSessions()).toBe(2);
      expect(await rt.getUploadSession(uploadId)).toBeNull();
      expect(await rt.getManagementSession(expiredMgmt)).toBeNull();
      expect(await rt.getManagementSession(revokedMgmt)).toBeNull();
      // Still inside its TTL: untouched.
      expect(await rt.getManagementSession(liveMgmt)).not.toBeNull();

      // The ledger survives: run row, audit entries, and the report itself.
      expect(await rt.getRunBySubmission(submissionId)).not.toBeNull();
      expect((await db!`select count(*)::int as n from bench.audit_log where target = ${submissionId}`)[0]!.n).toBeGreaterThanOrEqual(1);
      expect((await db!`select count(*)::int as n from bench.reports where id = ${report.id}`)[0]!.n).toBe(1);

      // Tombstones stay after an owner delete, and the retention job cannot
      // remove runs, reports, or audit rows under the runtime role.
      expect(await rt.deleteRun(submissionId)).not.toBeNull();
      await expect(rtSql`delete from bench.benchmark_runs where submission_id = ${submissionId}`).rejects.toThrow(/permission denied/);
      await expect(rtSql`delete from bench.reports where id = ${report.id}`).rejects.toThrow(/permission denied/);
      await expect(rtSql`delete from bench.audit_log where target = ${submissionId}`).rejects.toThrow(/permission denied/);
      expect((await db!`select count(*)::int as n from bench.benchmark_runs where submission_id = ${submissionId}`)[0]!.n).toBe(1);
    } finally {
      await rtSql.end({ timeout: 5 });
    }
  });

  it("creates trigram filter indexes when pg_trgm lives outside the default search_path", async () => {
    if (!admin) return;
    // A managed cluster commonly installs pg_trgm into a dedicated `extensions`
    // schema. CREATE EXTENSION IF NOT EXISTS leaves it there, so an unqualified
    // gin_trgm_ops would not resolve. Clean isolated database, nothing shared.
    const scratchName = `aiolm_web_trgm_${Date.now().toString(36)}`;
    await admin.unsafe(`CREATE DATABASE "${scratchName}"`);
    const scratchUrl = new URL(ADMIN_URL!);
    scratchUrl.pathname = `/${scratchName}`;
    const scratch = postgres(scratchUrl.toString(), { max: 1, prepare: false, ssl: false });
    try {
      await scratch.unsafe("CREATE SCHEMA extensions");
      await scratch.unsafe("CREATE EXTENSION pg_trgm WITH SCHEMA extensions");
      const where = await scratch<Array<{ nspname: string }>>`
        select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
        where e.extname = 'pg_trgm'`;
      expect(where[0]!.nspname).toBe("extensions");
      // Sanity: the unqualified spelling really is unresolvable here.
      await expect(scratch.unsafe(
        "create index it_unqualified_probe on pg_catalog.pg_class using gin ((relname) gin_trgm_ops)",
      )).rejects.toThrow();

      expect(await applyMigrations(scratch)).toContain("006_trgm_filter_indexes.sql");
      const idx = await scratch<Array<{ indexname: string }>>`
        select indexname from pg_indexes where schemaname = 'bench' and tablename = 'benchmark_runs'`;
      const names = idx.map((r) => r.indexname);
      for (const name of [
        "benchmark_runs_model_trgm",
        "benchmark_runs_hardware_trgm",
        "benchmark_runs_method_trgm",
        "benchmark_runs_workload_trgm",
      ]) {
        expect(names).toContain(name);
      }
      // The operator class actually used comes from the non-default schema.
      const opc = await scratch<Array<{ nspname: string }>>`
        select distinct n.nspname
        from pg_index i
        join pg_class c on c.oid = i.indexrelid
        join pg_opclass o on o.oid = any (i.indclass::oid[])
        join pg_namespace n on n.oid = o.opcnamespace
        where c.relname = 'benchmark_runs_model_trgm'`;
      expect(opc.map((r) => r.nspname)).toContain("extensions");
    } finally {
      await scratch.end({ timeout: 5 });
      await admin.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${scratchName}' AND pid <> pg_backend_pid()`,
      );
      await admin.unsafe(`DROP DATABASE "${scratchName}"`);
    }
  }, 120_000);

  it("prunes expired quotas and clears old report IP HMACs", async () => {
    const s = need();
    if (!s || !db) return;
    await s.quotaGateAtomic("it:prune", 60_000, 10, 1_000);
    expect(await s.quotaPrune(2_000)).toBe(0);
    expect(await s.quotaPrune(61_001)).toBeGreaterThanOrEqual(1);

    const report = await s.createReport({ target_submission_id: randomUUID(), reason: "old", reporter_ip_hmac: "hmac" });
    await db!`update bench.reports set created_at = now() - interval '25 hours' where id = ${report.id}`;
    expect(await s.clearExpiredReportIpHmacs()).toBeGreaterThanOrEqual(1);
    const rows = await db!`select reporter_ip_hmac from bench.reports where id = ${report.id}`;
    expect(rows[0]!.reporter_ip_hmac).toBeNull();
  });

  it("answers the readiness probe under the least-privilege runtime role", async () => {
    if (!db) return;
    // GET /v1/readiness reads the migration ledger to prove the schema is
    // really there AND that every required file was applied. The web function
    // only ever holds the runtime role, so the probe is worthless unless 007
    // granted it SELECT on that table.
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    try {
      const rt = new PostgresBenchmarkStore(rtSql);
      const applied = await rt.appliedMigrations();
      expect([...applied].sort()).toEqual([...REQUIRED_MIGRATIONS]);
      // The grant is SELECT and nothing more: the ledger stays immutable.
      await expect(rtSql`delete from bench.schema_migrations where filename = '001_init.sql'`)
        .rejects.toThrow(/permission denied/);
      await expect(rtSql`insert into bench.schema_migrations (filename, sha256) values ('x', 'y')`)
        .rejects.toThrow(/permission denied/);
    } finally {
      await rtSql.end({ timeout: 5 });
    }
  });

  it("bounds the readiness read inside PostgreSQL and leaves no timeout behind", async () => {
    if (!db) return;
    // A client-side promise race only stops the caller waiting; the statement
    // keeps running and keeps a pooled backend busy. The probe sets
    // statement_timeout so the SERVER aborts it - including while it is blocked
    // on a lock, which is exactly what a migration in flight looks like.
    const rtSql = postgres(runtimeUrl, { max: 1, prepare: false, ssl: false });
    const locker = postgres(ownerUrl, { max: 1, prepare: false, ssl: false });
    let releaseLock: () => void = () => {};
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let lockAcquired: () => void = () => {};
    const lockHeld = new Promise<void>((resolve) => {
      lockAcquired = resolve;
    });
    const holding = locker.begin(async (tx) => {
      await tx`lock table bench.schema_migrations in access exclusive mode`;
      lockAcquired();
      await lockReleased;
    });
    try {
      await lockHeld;
      const rt = new PostgresBenchmarkStore(rtSql);
      const started = Date.now();
      // The message, not just the SQLSTATE, is the assertion that matters.
      // postgres.js raises 57014 for its own client-side cancel too ("due to
      // user request"), so matching the code alone would still pass with the
      // server-side bound removed. "due to statement timeout" can only come
      // from PostgreSQL ending the statement itself.
      await expect(rt.appliedMigrations(250)).rejects.toMatchObject({
        code: "57014",
        message: expect.stringContaining("statement timeout") as unknown as string,
      });
      // Bounded by the server at ~250ms, not by the 750ms client backstop and
      // not by a client that simply walked away.
      expect(Date.now() - started).toBeLessThan(700);
    } finally {
      releaseLock();
      await holding;
      await locker.end({ timeout: 5 });
    }

    try {
      const rt = new PostgresBenchmarkStore(rtSql);
      // The connection is immediately reusable - nothing was left running.
      expect([...(await rt.appliedMigrations())].sort()).toEqual([...REQUIRED_MIGRATIONS]);
      // set_config(..., is_local => true) scoped the timeout to the probe's own
      // transaction. A transaction pooler hands this same backend to the next
      // client the moment that transaction commits, so a session-level SET
      // would silently become somebody else's statement_timeout.
      const leaked = await rtSql<Array<{ setting: string }>>`
        select current_setting('statement_timeout') as setting`;
      expect(leaked[0]!.setting).toBe("0");
    } finally {
      await rtSql.end({ timeout: 5 });
    }
  }, 60_000);

  it("installs the scheduled retention job and matches the TypeScript prune semantics", async () => {
    if (!db) return;
    const script = readFileSync(join(process.cwd(), "sql", "operations", "retention-pg_cron.sql"), "utf8");
    // The script wraps the function install in BEGIN/COMMIT, exactly as
    // `psql -f` will run it, so it needs a reserved single connection.
    const owner = postgres(ownerUrl, { max: 1, prepare: false, ssl: false });
    try {
      // This cluster has no pg_cron, which is the point: the operational script
      // must still install bench.run_retention() and only skip the scheduling.
      await owner.unsafe(script);
      const cron = await owner`select count(*)::int as n from pg_extension where extname = 'pg_cron'`;
      expect(cron[0]!.n).toBe(0);
      // Re-runnable: create-or-replace plus the same job name, no duplicates.
      await owner.unsafe(script);
    } finally {
      await owner.end({ timeout: 5 });
    }

    const submissionId = randomUUID();
    const ownerSecret = randomBase64Url32();
    const benchmark = syntheticSubmission({ submission_id: submissionId });
    // acceptArgs() hashes this exact body; the upload session must bind it.
    const body = JSON.stringify({ benchmark, description_md: "integration" });
    const bodySha = sha256HexUtf8(body);
    const s2 = need();
    if (!s2) return;
    const permit = await verifiedSession(submissionId, ownerSecret, bodySha);
    expect((await s2.acceptRunAtomic(acceptArgs(submissionId, ownerSecret, permit, GENEROUS_QUOTA))).outcome).toBe("created");
    await s2.audit("moderation-cli", "hide", submissionId, "cron-retention");
    const report = await s2.createReport({ target_submission_id: submissionId, reason: "cron", reporter_ip_hmac: "hmac" });

    const deadUpload = randomUUID();
    await s2.createUploadSession({
      session_id: deadUpload, submission_id: submissionId, body_sha256: bodySha,
      owner_hash: ownerHashFor(ownerSecret), expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    const expiredMgmt = randomUUID();
    const revokedMgmt = randomUUID();
    const liveMgmt = randomUUID();
    for (const id of [expiredMgmt, revokedMgmt, liveMgmt]) {
      await s2.createManagementSession({
        id, submission_id: submissionId, csrf_token_hash: "a".repeat(64),
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
    }
    await s2.revokeManagementSession(revokedMgmt);
    await db!`update bench.upload_sessions set expires_at = now() - interval '26 hours' where session_id = ${deadUpload}`;
    await db!`update bench.management_sessions set expires_at = now() - interval '26 hours' where id = ${expiredMgmt}`;
    await db!`update bench.management_sessions set revoked_at = now() - interval '26 hours' where id = ${revokedMgmt}`;
    await db!`update bench.reports set created_at = now() - interval '26 hours' where id = ${report.id}`;
    await db!`insert into bench.quota_buckets (key, count, bytes, rows, window_start, expires_at)
      values ('cron-retention-bucket', 1, 0, 0, now() - interval '2 hours', now() - interval '1 hour')`;

    const pass = await db!`select bench.run_retention() as counters`;
    const counters = pass[0]!.counters as Record<string, number>;
    expect(counters["prunedQuotaBuckets"]).toBeGreaterThanOrEqual(1);
    expect(counters["clearedReportIpHmacs"]).toBeGreaterThanOrEqual(1);
    expect(counters["prunedManagementSessions"]).toBe(2);
    expect(counters["prunedUploadSessions"]).toBeGreaterThanOrEqual(1);

    expect(await s2.getUploadSession(deadUpload)).toBeNull();
    expect(await s2.getManagementSession(expiredMgmt)).toBeNull();
    expect(await s2.getManagementSession(revokedMgmt)).toBeNull();
    // Inside its TTL, so the pass leaves it alone.
    expect(await s2.getManagementSession(liveMgmt)).not.toBeNull();
    // The ledgers survive: the run row, the audit trail and the report itself.
    expect(await s2.getRunBySubmission(submissionId)).not.toBeNull();
    expect((await db!`select count(*)::int as n from bench.audit_log where target = ${submissionId}`)[0]!.n)
      .toBeGreaterThanOrEqual(1);
    const survivingReport = await db!`select reporter_ip_hmac from bench.reports where id = ${report.id}`;
    expect(survivingReport).toHaveLength(1);
    expect(survivingReport[0]!.reporter_ip_hmac).toBeNull();

    // A second pass with nothing eligible removes nothing.
    const idle = (await db!`select bench.run_retention() as counters`)[0]!.counters as Record<string, number>;
    expect(idle["prunedManagementSessions"]).toBe(0);
    expect(idle["prunedUploadSessions"]).toBe(0);

    // Least privilege: the roles that serve traffic and moderate cannot start
    // a retention pass, even though the runtime role holds the DELETE grants.
    for (const url of [runtimeUrl, moderationUrl]) {
      const restricted = postgres(url, { max: 1, prepare: false, ssl: false });
      try {
        await expect(restricted`select bench.run_retention()`).rejects.toThrow(/permission denied/);
      } finally {
        await restricted.end({ timeout: 5 });
      }
    }
  }, 120_000);

  it("measures a real storage footprint", async () => {
    const s = need();
    if (!s) return;
    const footprint = await s.storageFootprint();
    expect(footprint.bytes).toBeGreaterThan(0);
    expect(footprint.rows).toBeGreaterThan(0);
  });

  it("serves the authenticated HTTP publish flow against the real database", async () => {
    const s = need();
    if (!s || !db) return;
    // Route handlers read deployment config from the environment; point them
    // at this test's secrets/origin for the duration of the flow.
    const saved = new Map<string, string | undefined>();
    const setEnv = (key: string, value: string): void => {
      if (!saved.has(key)) saved.set(key, process.env[key]);
      process.env[key] = value;
    };
    setEnv("NODE_ENV", "test");
    setEnv("SYNTHETIC_TEST_MODE", "1");
    setEnv("SERVICE_ORIGIN", "http://localhost:3000");
    setEnv("PERMIT_HMAC_SECRET", PERMIT_SECRET);
    setEnv("QUOTA_HMAC_SECRET", QUOTA_SECRET);
    setEnv("MANAGEMENT_HMAC_SECRET", MGMT_SECRET);
    setEnv("TEST_FIXTURE_TURNSTILE_TOKEN", "test-turnstile-ok");
    __setTestStore(s);
    try {
      const submissionId = randomUUID();
      const ownerSecret = randomBase64Url32();
      const benchmark = syntheticSubmission({ submission_id: submissionId });
      const body = JSON.stringify({ benchmark, description_md: "http-flow" });
      const bodySha = sha256HexUtf8(body);
      const headers = (extra: Record<string, string> = {}): Headers =>
        new Headers({ "x-synthetic-test-ip": "10.30.30.30", ...extra });
      const auth = { authorization: `Bearer ${ownerSecret}` };

      const created = await createUploadSession(
        new Request("http://localhost:3000/v1/upload-sessions", {
          method: "POST",
          headers: headers({ ...auth, "content-type": "application/json" }),
          body: JSON.stringify({ submission_id: submissionId, body_sha256: bodySha }),
        }),
      );
      expect(created.status).toBe(201);
      const { session_id: sessionId } = (await created.json()) as { session_id: string };

      const verified = await verifyUploadSession(
        new Request(`http://localhost:3000/v1/upload-sessions/${sessionId}/verify`, {
          method: "POST",
          headers: headers({ "content-type": "application/json" }),
          body: JSON.stringify({ token: "test-turnstile-ok" }),
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(verified.status).toBe(200);

      const polled = await pollUploadSession(
        new Request(`http://localhost:3000/v1/upload-sessions/${sessionId}`, { headers: headers(auth) }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      expect(polled.status).toBe(200);
      const { permit, status } = (await polled.json()) as { permit?: string; status: string };
      expect(status).toBe("verified");
      expect(permit).toBeTruthy();

      const submit = (secret: string, withPermit: boolean): Promise<Response> =>
        submitBenchmarkRun(
          new Request("http://localhost:3000/v1/benchmark-runs", {
            method: "POST",
            headers: headers({
              authorization: `Bearer ${secret}`,
              "content-type": "application/json",
              "idempotency-key": submissionId,
              ...(withPermit ? { "x-upload-permit": permit! } : {}),
            }),
            body,
          }),
        );
      const first = await submit(ownerSecret, true);
      expect(first.status).toBe(201);
      const receipt = (await first.json()) as { id: string };
      // Accepted replay without a fresh permit returns the same receipt.
      const replay = await submit(ownerSecret, false);
      expect(replay.status).toBe(200);
      expect(((await replay.json()) as { id: string }).id).toBe(receipt.id);
      // Wrong owner is rejected against real stored hashes.
      expect((await submit(randomBase64Url32(), true)).status).toBe(403);
    } finally {
      __setTestStore(null);
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

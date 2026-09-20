import type postgres from "postgres";
import { encodeDiscoveryCursor, type ListCursor } from "../lib/pagination";
import { sortValue, type OptionField, type BenchmarkOptions } from "../lib/benchmark-discovery";
import { listSql, optionsSql } from "./benchmark-discovery-sql";
import { permitExpiryForSession, verifyUploadPermit } from "../lib/permits";import { quotaKeyForIp, quotaWindowDay, quotaWindowHour } from "../lib/ip";
import type { BenchmarkFilters } from "../lib/summary";
import { getDb } from "./db";
import type {
  AcceptArgs, AcceptOutcome, BenchmarkStore, ListResult, ManagementSessionRow, PublicListItem, ReportRow, StoredRun, UploadSessionRow,
} from "./repository";
import { READINESS_PROBE_TIMEOUT_MS, REPORT_IP_RETENTION_MS, SESSION_RETENTION_MS, csrfTokenHash } from "./repository";

/**
 * Postgres implementation. All SQL is parameterized and bounded.
 * Acceptance (permit verify + consume, replay/conflict/deleted checks, quota
 * check + charge, capacity guard, insert) runs in ONE transaction under a
 * per-submission advisory lock plus quota-key advisory locks, so concurrent
 * duplicates serialize and separate calls cannot break atomicity.
 */
export class PostgresBenchmarkStore implements BenchmarkStore {
  constructor(private sql: postgres.Sql = getDb()) {}

  async createUploadSession(row: Omit<UploadSessionRow, "status" | "verified_at" | "permit_consumed_at" | "created_at">): Promise<UploadSessionRow> {
    const rows = await this.sql<UploadSessionRow[]>`
      insert into bench.upload_sessions (session_id, submission_id, body_sha256, owner_hash, status, expires_at)
      values (${row.session_id}, ${row.submission_id}, ${row.body_sha256}, ${row.owner_hash}, 'pending', ${row.expires_at})
      returning session_id, submission_id, body_sha256, owner_hash, status,
        expires_at::text as expires_at, verified_at::text as verified_at,
        permit_consumed_at::text as permit_consumed_at, created_at::text as created_at`;
    return rows[0]!;
  }

  async getUploadSession(sessionId: string, nowMs = Date.now()): Promise<UploadSessionRow | null> {
    const rows = await this.sql<UploadSessionRow[]>`
      select session_id, submission_id, body_sha256, owner_hash, status,
        expires_at::text as expires_at, verified_at::text as verified_at,
        permit_consumed_at::text as permit_consumed_at, created_at::text as created_at
      from bench.upload_sessions where session_id = ${sessionId} limit 1`;
    const row = rows[0] ?? null;
    if (!row || row.status === "expired") return row;
    // Effective expiry: pending sessions expire at expires_at; verified
    // sessions additionally expire at verified_at + 5min (the permit bound),
    // so verified sessions cannot mint permits forever.
    const effectiveExpiry =
      row.status === "verified" && row.verified_at
        ? permitExpiryForSession(Date.parse(row.expires_at), Date.parse(row.verified_at))
        : Date.parse(row.expires_at);
    if (effectiveExpiry <= nowMs) {
      await this.sql`update bench.upload_sessions set status = 'expired' where session_id = ${sessionId} and status <> 'expired'`;
      return { ...row, status: "expired" };
    }
    return row;
  }

  async markSessionVerified(sessionId: string): Promise<UploadSessionRow | null> {
    const rows = await this.sql<UploadSessionRow[]>`
      update bench.upload_sessions set status = 'verified', verified_at = now()
      where session_id = ${sessionId} and status = 'pending' and expires_at > now()
      returning session_id, submission_id, body_sha256, owner_hash, status,
        expires_at::text as expires_at, verified_at::text as verified_at,
        permit_consumed_at::text as permit_consumed_at, created_at::text as created_at`;
    return rows[0] ?? null;
  }

  async revokeSessionsForSubmission(submissionId: string): Promise<void> {
    await this.sql`update bench.upload_sessions set status = 'expired' where submission_id = ${submissionId} and status <> 'expired'`;
    await this.sql`update bench.management_sessions set revoked_at = now() where submission_id = ${submissionId} and revoked_at is null`;
  }

  async getRunBySubmission(submissionId: string): Promise<StoredRun | null> {
    const rows = await this.sql<StoredRun[]>`
      select submission_id, public_id, owner_hash, body_sha256, benchmark, description_md, revision,
        hidden, deleted, summary, byte_size, row_count,
        created_at::text as created_at, updated_at::text as updated_at
      from bench.benchmark_runs where submission_id = ${submissionId} limit 1`;
    return rows[0] ?? null;
  }

  async getRunByPublicId(publicId: string): Promise<StoredRun | null> {
    const rows = await this.sql<StoredRun[]>`
      select submission_id, public_id, owner_hash, body_sha256, benchmark, description_md, revision,
        hidden, deleted, summary, byte_size, row_count,
        created_at::text as created_at, updated_at::text as updated_at
      from bench.benchmark_runs where public_id = ${publicId} limit 1`;
    return rows[0] ?? null;
  }

  async acceptRunAtomic(args: AcceptArgs): Promise<AcceptOutcome> {
    const now = args.nowMs;
    const ipHourKey = quotaKeyForIp(args.quotaSecret, args.ip, "new-upload", quotaWindowHour(now));
    const ipDayKey = quotaKeyForIp(args.quotaSecret, args.ip, "new-upload", quotaWindowDay(now));
    const globalKey = `global:new-upload:${quotaWindowDay(now)}`;
    // Plain objects serialize to JSONB automatically; the detach step keeps
    // concurrent transactions from observing shared-reference mutation.
    const json = (value: unknown): postgres.Parameter =>
      this.sql.json(JSON.parse(JSON.stringify(value)) as postgres.JSONValue);

    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${args.submission_id}))`;
      await tx`select pg_advisory_xact_lock(hashtext(${ipHourKey}))`;
      await tx`select pg_advisory_xact_lock(hashtext(${ipDayKey}))`;
      await tx`select pg_advisory_xact_lock(hashtext(${globalKey}))`;

      const existing = await tx<StoredRun[]>`
        select submission_id, public_id, owner_hash, body_sha256, benchmark, description_md, revision,
          hidden, deleted, summary, byte_size, row_count,
          created_at::text as created_at, updated_at::text as updated_at
        from bench.benchmark_runs where submission_id = ${args.submission_id} limit 1 for update`;
      if (existing[0]) {
        const run = existing[0];
        if (run.owner_hash.toLowerCase() !== args.owner_hash.toLowerCase()) return { outcome: "conflict-owner" } as AcceptOutcome;
        if (run.body_sha256 !== args.body_sha256) return { outcome: "conflict-body" } as AcceptOutcome;
        if (run.deleted) return { outcome: "deleted" } as AcceptOutcome;
        return { outcome: "replay", run } as AcceptOutcome;
      }

      if (!args.permit) return { outcome: "no-session" } as AcceptOutcome;
      const candidates = await tx<UploadSessionRow[]>`
        select session_id, submission_id, body_sha256, owner_hash, status,
          expires_at::text as expires_at, verified_at::text as verified_at,
          permit_consumed_at::text as permit_consumed_at, created_at::text as created_at
        from bench.upload_sessions
        where submission_id = ${args.submission_id} and lower(owner_hash) = lower(${args.owner_hash})
          and body_sha256 = ${args.body_sha256} and status = 'verified'
          and verified_at is not null and permit_consumed_at is null and expires_at > now()
        order by created_at desc limit 5 for update`;
      if (candidates.length === 0) return { outcome: "no-session" } as AcceptOutcome;
      let session: UploadSessionRow | null = null;
      for (const candidate of candidates) {
        const candidateVerifiedAt = candidate.verified_at!;
        const permitExpiry = permitExpiryForSession(Date.parse(candidate.expires_at), Date.parse(candidateVerifiedAt));
        if (permitExpiry <= now) continue;
        const ok = verifyUploadPermit({
          permitSecret: args.permitSecret, permit: args.permit, sessionId: candidate.session_id,
          submissionId: args.submission_id, bodySha256: args.body_sha256, ownerHash: args.owner_hash,
          maxExpiresAtMs: Date.parse(candidate.expires_at), nowMs: now,
        });
        if (ok) {
          session = candidate;
          break;
        }
      }
      if (!session) return { outcome: "bad-permit" } as AcceptOutcome;

      const q = args.quota;
      const buckets = await tx<Array<{ key: string; count: number; bytes: string; rows: string }>>`
        select key, count, bytes::text as bytes, rows::text as rows from bench.quota_buckets
        where key in (${ipHourKey}, ${ipDayKey}, ${globalKey}) for update`;
      const bucket = (key: string): { count: number; bytes: number; rows: number } => {
        const row = buckets.find((b) => b.key === key);
        return row ? { count: row.count, bytes: Number(row.bytes), rows: Number(row.rows) } : { count: 0, bytes: 0, rows: 0 };
      };
      const ipHour = bucket(ipHourKey);
      if (ipHour.count >= q.perIpHour) return { outcome: "quota", limit: "per-ip-hour", retryAfterSec: 3600 } as AcceptOutcome;
      const ipDay = bucket(ipDayKey);
      if (ipDay.count >= q.perIpDay) return { outcome: "quota", limit: "per-ip-day", retryAfterSec: 3600 } as AcceptOutcome;
      const global = bucket(globalKey);
      if (global.count >= q.globalDay) return { outcome: "quota", limit: "global-day", retryAfterSec: 3600 } as AcceptOutcome;
      if (global.bytes + args.byte_size > q.globalBytesDay) return { outcome: "quota", limit: "global-bytes", retryAfterSec: 3600 } as AcceptOutcome;
      if (global.rows + args.row_count > q.globalRowsDay) return { outcome: "quota", limit: "global-rows", retryAfterSec: 3600 } as AcceptOutcome;

      const usage = await this.footprintIn(tx);
      const cap = args.capacity;
      if (cap.bytes === null && cap.rows === null) {
        if (cap.strictMissing) {
          return { outcome: "capacity", message: "Publishing paused: storage capacity is not configured." } as AcceptOutcome;
        }
      } else {
        if (cap.bytes !== null && usage.bytes >= cap.bytes * 0.8) {
          return { outcome: "capacity", message: "Publishing paused: storage capacity reached." } as AcceptOutcome;
        }
        if (cap.rows !== null && usage.rows >= cap.rows * 0.8) {
          return { outcome: "capacity", message: "Publishing paused: row capacity reached." } as AcceptOutcome;
        }
      }
      const capacityWarn =
        (cap.bytes !== null && usage.bytes >= cap.bytes * 0.7) || (cap.rows !== null && usage.rows >= cap.rows * 0.7);

      const consumed = await tx`
        update bench.upload_sessions set permit_consumed_at = now()
        where session_id = ${session.session_id} and permit_consumed_at is null`;
      if (consumed.count !== 1) return { outcome: "no-session" } as AcceptOutcome;

      const hourMs = 3600_000;
      const dayMs = 24 * 3600_000;
      await tx`
        insert into bench.quota_buckets (key, count, bytes, rows, window_start, expires_at)
        values (${ipHourKey}, 1, ${args.byte_size}, ${args.row_count}, now(), now() + (${hourMs} * interval '1 millisecond')),
               (${ipDayKey}, 1, ${args.byte_size}, ${args.row_count}, now(), now() + (${dayMs} * interval '1 millisecond')),
               (${globalKey}, 1, ${args.byte_size}, ${args.row_count}, now(), now() + (${dayMs} * interval '1 millisecond'))
        on conflict (key) do update set count = bench.quota_buckets.count + 1,
          bytes = bench.quota_buckets.bytes + excluded.bytes, rows = bench.quota_buckets.rows + excluded.rows`;

      const inserted = await tx<StoredRun[]>`
        insert into bench.benchmark_runs
          (submission_id, public_id, owner_hash, body_sha256, benchmark, description_md, revision, hidden, deleted, summary, byte_size, row_count)
        values (${args.submission_id}, ${args.public_id}, ${args.owner_hash}, ${args.body_sha256},
          ${json(args.benchmarkMeta)}, ${args.description_md}, 1, false, false,
          ${json(args.summary)}, ${args.byte_size}, ${args.row_count})
        returning submission_id, public_id, owner_hash, body_sha256, benchmark, description_md, revision,
          hidden, deleted, summary, byte_size, row_count,
          created_at::text as created_at, updated_at::text as updated_at`;
      const run = inserted[0]!;
      for (let i = 0; i < args.rows.length; i += 1000) {
        const chunk = args.rows.slice(i, i + 1000);
        await tx`insert into bench.benchmark_chunks (submission_id, chunk_index, rows) values (${args.submission_id}, ${i / 1000}, ${json(chunk)})`;
      }
      return { outcome: "created", run, capacityWarn } as AcceptOutcome;
    });
  }

  private async footprintIn(tx: postgres.TransactionSql): Promise<{ bytes: number; rows: number }> {
    // Measured scope: every table in the private bench schema (runs, chunks,
    // sessions, reports, quota buckets, audit log), each counted with its
    // indexes and TOAST via pg_total_relation_size. PROVISIONED_BYTES must be
    // sized against this same scope (see docs/operations.md).
    const rows = await tx<Array<{ bytes: string; rows: string }>>`
      select coalesce((select sum(pg_total_relation_size(oid)) from pg_class
        where relnamespace = 'bench'::regnamespace and relkind = 'r'), 0)::text as bytes,
              (select coalesce(sum(row_count), 0) from bench.benchmark_runs where deleted = false)::text as rows`;
    return { bytes: Number(rows[0]!.bytes), rows: Number(rows[0]!.rows) };
  }

  async updateDescription(submissionId: string, descriptionMd: string, expectedRevision: number): Promise<StoredRun | null> {
    const rows = await this.sql<StoredRun[]>`
      update bench.benchmark_runs
      set description_md = ${descriptionMd}, revision = revision + 1, updated_at = now()
      where submission_id = ${submissionId} and revision = ${expectedRevision} and deleted = false
      returning submission_id, public_id, owner_hash, body_sha256, benchmark, description_md, revision,
        hidden, deleted, summary, byte_size, row_count,
        created_at::text as created_at, updated_at::text as updated_at`;
    return rows[0] ?? null;
  }

  async deleteRun(submissionId: string): Promise<StoredRun | null> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${submissionId}))`;
      const rows = await tx<StoredRun[]>`
        update bench.benchmark_runs
        set deleted = true, benchmark = null, description_md = '', summary = null, updated_at = now()
        where submission_id = ${submissionId} and deleted = false
        returning submission_id, public_id, owner_hash, body_sha256, benchmark, description_md, revision,
          hidden, deleted, summary, byte_size, row_count,
          created_at::text as created_at, updated_at::text as updated_at`;
      if (!rows[0]) return null;
      await tx`delete from bench.benchmark_chunks where submission_id = ${submissionId}`;
      await tx`update bench.upload_sessions set status = 'expired' where submission_id = ${submissionId} and status <> 'expired'`;
      await tx`update bench.management_sessions set revoked_at = now() where submission_id = ${submissionId} and revoked_at is null`;
      return rows[0];
    });
  }

  async setHidden(submissionId: string, hidden: boolean): Promise<void> {
    await this.sql`update bench.benchmark_runs set hidden = ${hidden}, updated_at = now() where submission_id = ${submissionId}`;
  }

  async listRuns(filters: BenchmarkFilters, limit: number, cursor: ListCursor | null): Promise<ListResult> {
    const statement = listSql(filters, limit, cursor);
    const rows = await this.sql.unsafe<PublicListItem[]>(statement.query, statement.values);
    const page = rows.slice(0, limit), last = page.at(-1);
    return { items: page, next_cursor: rows.length > limit && last ? encodeDiscoveryCursor(last.created_at, last.public_id, filters, sortValue(last.summary, filters.sort ?? "newest")) : null };
  }

  async listOptions(field: OptionField, query: string, filters: BenchmarkFilters): Promise<BenchmarkOptions> {
    const statement = optionsSql(field, query, filters);
    const options = await this.sql.unsafe<Array<{ value: string; count: number }>>(statement.query, statement.values);
    return { options: options.slice(0, 30), has_more: options.length > 30 };
  }

  async getRowSlice(submissionId: string, offset: number, limit: number): Promise<{ rows: unknown[]; nextOffset: number | null; total: number }> {
    const runs = await this.sql<Array<{ row_count: number; deleted: boolean }>>`
      select row_count, deleted from bench.benchmark_runs where submission_id = ${submissionId} limit 1`;
    const run = runs[0];
    if (!run || run.deleted) return { rows: [], nextOffset: null, total: 0 };
    const firstChunk = Math.floor(offset / 1000);
    const lastChunk = Math.floor((offset + limit - 1) / 1000);
    const chunks = await this.sql<Array<{ chunk_index: number; rows: unknown[] }>>`
      select chunk_index, rows from bench.benchmark_chunks
      where submission_id = ${submissionId} and chunk_index between ${firstChunk} and ${lastChunk}
      order by chunk_index`;
    const window = chunks.flatMap((c) => c.rows);
    const slice = window.slice(offset - firstChunk * 1000, offset - firstChunk * 1000 + limit);
    const total = run.row_count;
    return { rows: slice, nextOffset: offset + slice.length < total ? offset + slice.length : null, total };
  }

  async createManagementSession(row: Omit<ManagementSessionRow, "revoked_at" | "created_at">): Promise<ManagementSessionRow> {
    const rows = await this.sql<ManagementSessionRow[]>`
      insert into bench.management_sessions (id, submission_id, csrf_token_hash, expires_at)
      values (${row.id}, ${row.submission_id}, ${row.csrf_token_hash}, ${row.expires_at})
      returning id, submission_id, csrf_token_hash, expires_at::text as expires_at,
        revoked_at::text as revoked_at, created_at::text as created_at`;
    return rows[0]!;
  }

  async getManagementSession(id: string): Promise<ManagementSessionRow | null> {
    const rows = await this.sql<ManagementSessionRow[]>`
      select id, submission_id, csrf_token_hash, expires_at::text as expires_at,
        revoked_at::text as revoked_at, created_at::text as created_at
      from bench.management_sessions where id = ${id} limit 1`;
    return rows[0] ?? null;
  }

  async revokeManagementSession(id: string): Promise<void> {
    await this.sql`update bench.management_sessions set revoked_at = now() where id = ${id}`;
  }

  async createReport(row: Omit<ReportRow, "id" | "created_at"> & { id?: string }): Promise<ReportRow> {
    const id = row.id ?? crypto.randomUUID();
    const rows = await this.sql<ReportRow[]>`
      insert into bench.reports (id, target_submission_id, reason, reporter_ip_hmac)
      values (${id}, ${row.target_submission_id}, ${row.reason}, ${row.reporter_ip_hmac})
      returning id, target_submission_id, reason, reporter_ip_hmac, created_at::text as created_at`;
    return rows[0]!;
  }

  async listReports(limit: number): Promise<ReportRow[]> {
    return this.sql<ReportRow[]>`
      select id, target_submission_id, reason, reporter_ip_hmac, created_at::text as created_at
      from bench.reports order by created_at desc limit ${limit}`;
  }

  async deleteReport(id: string): Promise<void> {
    await this.sql`delete from bench.reports where id = ${id}`;
  }

  async audit(actor: string, action: string, target: string | null, reason: string | null): Promise<void> {
    await this.sql`insert into bench.audit_log (actor, action, target, reason) values (${actor}, ${action}, ${target}, ${reason})`;
  }

  async quotaGateAtomic(key: string, windowMs: number, limit: number, nowMs = Date.now()): Promise<{ allowed: boolean; retryAfterSec: number }> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${"gate:" + key}))`;
      const rows = await tx<Array<{ count: number; expires_at: string }>>`
        select count, expires_at::text as expires_at from bench.quota_buckets where key = ${key} limit 1 for update`;
      const row = rows[0];
      if (!row || Date.parse(row.expires_at) <= nowMs) {
        const expiresAt = new Date(nowMs + windowMs).toISOString();
        await tx`
          insert into bench.quota_buckets (key, count, bytes, rows, window_start, expires_at)
          values (${key}, 1, 0, 0, ${new Date(nowMs).toISOString()}, ${expiresAt})
          on conflict (key) do update set count = 1, bytes = 0, rows = 0,
            window_start = ${new Date(nowMs).toISOString()}, expires_at = ${expiresAt}`;
        return { allowed: true, retryAfterSec: 0 };
      }
      if (row.count >= limit) {
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)) };
      }
      await tx`update bench.quota_buckets set count = count + 1 where key = ${key}`;
      return { allowed: true, retryAfterSec: 0 };
    });
  }

  async quotaProbe(key: string, nowMs = Date.now()): Promise<number> {
    const rows = await this.sql<Array<{ count: number }>>`
      select count from bench.quota_buckets
      where key = ${key} and expires_at > ${new Date(nowMs).toISOString()} limit 1`;
    return rows[0]?.count ?? 0;
  }

  async quotaPrune(nowMs = Date.now()): Promise<number> {
    const rows = await this.sql`
      delete from bench.quota_buckets where expires_at <= ${new Date(nowMs).toISOString()}`;
    return rows.count;
  }

  async clearExpiredReportIpHmacs(nowMs = Date.now()): Promise<number> {
    const cutoff = new Date(nowMs - REPORT_IP_RETENTION_MS).toISOString();
    const rows = await this.sql`
      update bench.reports set reporter_ip_hmac = null
      where created_at < ${cutoff} and reporter_ip_hmac is not null`;
    return rows.count;
  }

  async pruneManagementSessions(nowMs = Date.now()): Promise<number> {
    const cutoff = new Date(nowMs - SESSION_RETENTION_MS).toISOString();
    const rows = await this.sql`
      delete from bench.management_sessions
      where expires_at <= ${cutoff}
         or (revoked_at is not null and revoked_at <= ${cutoff})`;
    return rows.count;
  }

  async pruneUploadSessions(nowMs = Date.now()): Promise<number> {
    const cutoff = new Date(nowMs - SESSION_RETENTION_MS).toISOString();
    const rows = await this.sql`
      delete from bench.upload_sessions where expires_at <= ${cutoff}`;
    return rows.count;
  }

  /** Real footprint: whole private bench schema (tables + indexes + TOAST; tombstones included). */
  async storageFootprint(): Promise<{ bytes: number; rows: number }> {
    const rows = await this.sql<Array<{ bytes: string; rows: string }>>`
      select coalesce((select sum(pg_total_relation_size(oid)) from pg_class
        where relnamespace = 'bench'::regnamespace and relkind = 'r'), 0)::text as bytes,
              (select coalesce(sum(row_count), 0) from bench.benchmark_runs where deleted = false)::text as rows`;
    return { bytes: Number(rows[0]!.bytes), rows: Number(rows[0]!.rows) };
  }

  /**
   * Readiness probe. Reading the migration ledger touches one tiny table and
   * fails loudly when the database is unreachable, when the private schema is
   * missing, or when the runtime role has not been granted SELECT on it
   * (sql/migrations/007_readiness_grant.sql) - each of which really does mean
   * the deployment is not ready to serve.
   *
   * The bound is enforced by PostgreSQL, not by the caller. A client-side
   * promise race only stops the caller waiting: the statement keeps running and
   * keeps a pooled backend busy, which is the opposite of what a probe that
   * gave up should do. `statement_timeout` makes the server abort the statement
   * and release the backend, and it covers a lock wait as well as a slow read.
   *
   * It is set with `set_config(..., is_local => true)`, so it lives exactly as
   * long as this transaction. That matters on a transaction pooler, which hands
   * the same server connection to the next client the moment this transaction
   * commits: a session-level SET would silently become that client's timeout.
   * The transaction is the pooler's own unit of pooling, so wrapping the two
   * statements is compatible with transaction mode (and with `prepare: false`,
   * which this client already uses for it).
   *
   * The client-side timer is only a backstop, deliberately slack so the server
   * bound wins in the normal case. When it does fire it calls `cancel()`, which
   * sends a real PostgreSQL CancelRequest rather than abandoning the query.
   */
  async appliedMigrations(timeoutMs: number = READINESS_PROBE_TIMEOUT_MS): Promise<string[]> {
    const bound = Math.max(1, Math.trunc(timeoutMs));
    let backstop: ReturnType<typeof setTimeout> | undefined;
    try {
      const filenames = await this.sql.begin(async (tx) => {
        await tx`select set_config('statement_timeout', ${String(bound)}, true)`;
        const read = tx<Array<{ filename: string }>>`select filename from bench.schema_migrations`;
        backstop = setTimeout(() => {
          read.cancel();
        }, bound + 500);
        const rows = await read;
        return rows.map((row) => row.filename);
      });
      return filenames as unknown as string[];
    } finally {
      if (backstop !== undefined) clearTimeout(backstop);
    }
  }
}

export function hashCsrf(token: string): string {
  return csrfTokenHash(token);
}

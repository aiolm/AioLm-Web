import { encodeDiscoveryCursor, comparePosition, type ListCursor } from "../lib/pagination";
import { matchesFilters, textValues, sortValue, type BenchmarkOptions, type OptionField } from "../lib/benchmark-discovery";
import { UPLOAD_PERMIT_TTL_MS, permitExpiryForSession, verifyUploadPermit } from "../lib/permits";
import { quotaKeyForIp, quotaWindowDay, quotaWindowHour } from "../lib/ip";
import type { BenchmarkFilters } from "../lib/summary";
import type {
  AcceptArgs, AcceptOutcome, BenchmarkStore, ListResult, ManagementSessionRow, ReportRow, StoredRun, UploadSessionRow,
} from "./repository";
import { REPORT_IP_RETENTION_MS, REQUIRED_MIGRATIONS, SESSION_RETENTION_MS, csrfTokenHash } from "./repository";

/**
 * In-memory BenchmarkStore for unit tests ONLY. Never used in production.
 * Mirrors the Postgres atomicity semantics (per-submission serialization plus
 * ordered multi-key locks for shared quota keys) so duplicate/replay/delete
 * races are covered without a live database.
 */
export class InMemoryBenchmarkStore implements BenchmarkStore {
  runs = new Map<string, StoredRun>();
  chunks = new Map<string, unknown[][]>();
  byPublic = new Map<string, string>();
  sessions = new Map<string, UploadSessionRow>();
  mgmt = new Map<string, ManagementSessionRow>();
  reports = new Map<string, ReportRow & { createdMs: number }>();
  audits: Array<{ actor: string; action: string; target: string | null; reason: string | null }> = [];
  quotas = new Map<string, { count: number; bytes: number; rows: number; expiresMs: number }>();
  private locks = new Map<string, Promise<void>>();

  private async withLocks<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    const ordered = [...new Set(keys)].sort();
    const releases: Array<() => void> = [];
    try {
      for (const key of ordered) {
        const prev = this.locks.get(key) ?? Promise.resolve();
        let release!: () => void;
        const cur = new Promise<void>((r) => (release = r));
        this.locks.set(key, prev.then(() => cur));
        await prev;
        releases.push(release);
      }
      return await fn();
    } finally {
      for (const release of releases.reverse()) release();
    }
  }

  async createUploadSession(row: Omit<UploadSessionRow, "status" | "verified_at" | "permit_consumed_at" | "created_at">): Promise<UploadSessionRow> {
    const full: UploadSessionRow = { ...row, status: "pending", verified_at: null, permit_consumed_at: null, created_at: new Date().toISOString() };
    this.sessions.set(row.session_id, full);
    return full;
  }

  async getUploadSession(sessionId: string, nowMs = Date.now()): Promise<UploadSessionRow | null> {
    const row = this.sessions.get(sessionId) ?? null;
    if (!row || row.status === "expired") return row;
    const effectiveExpiry =
      row.status === "verified" && row.verified_at
        ? permitExpiryForSession(Date.parse(row.expires_at), Date.parse(row.verified_at))
        : Date.parse(row.expires_at);
    if (effectiveExpiry <= nowMs) {
      const expired = { ...row, status: "expired" as const };
      this.sessions.set(sessionId, expired);
      return expired;
    }
    return row;
  }

  async markSessionVerified(sessionId: string): Promise<UploadSessionRow | null> {
    const row = await this.getUploadSession(sessionId);
    if (!row || row.status !== "pending") return null;
    const next = { ...row, status: "verified" as const, verified_at: new Date().toISOString() };
    this.sessions.set(sessionId, next);
    return next;
  }

  async revokeSessionsForSubmission(submissionId: string): Promise<void> {
    for (const [id, s] of this.sessions) {
      if (s.submission_id === submissionId && s.status !== "expired") {
        this.sessions.set(id, { ...s, status: "expired" });
      }
    }
    for (const [id, m] of this.mgmt) {
      if (m.submission_id === submissionId && !m.revoked_at) this.mgmt.set(id, { ...m, revoked_at: new Date().toISOString() });
    }
  }

  async getRunBySubmission(submissionId: string): Promise<StoredRun | null> {
    return this.runs.get(submissionId) ?? null;
  }

  async getRunByPublicId(publicId: string): Promise<StoredRun | null> {
    const sub = this.byPublic.get(publicId);
    return sub ? (this.runs.get(sub) ?? null) : null;
  }

  async acceptRunAtomic(args: AcceptArgs): Promise<AcceptOutcome> {
    const now = args.nowMs;
    const ipHourKey = quotaKeyForIp(args.quotaSecret, args.ip, "new-upload", quotaWindowHour(now));
    const ipDayKey = quotaKeyForIp(args.quotaSecret, args.ip, "new-upload", quotaWindowDay(now));
    const globalKey = `global:new-upload:${quotaWindowDay(now)}`;
    return this.withLocks([`sub:${args.submission_id}`, `q:${ipHourKey}`, `q:${ipDayKey}`, `q:${globalKey}`], async () => {
      const existing = this.runs.get(args.submission_id);
      if (existing) {
        if (existing.owner_hash.toLowerCase() !== args.owner_hash.toLowerCase()) return { outcome: "conflict-owner" };
        if (existing.body_sha256 !== args.body_sha256) return { outcome: "conflict-body" };
        if (existing.deleted) return { outcome: "deleted" };
        return { outcome: "replay", run: existing };
      }
      const candidates = [...this.sessions.values()].filter(
        (s) =>
          s.submission_id === args.submission_id &&
          s.owner_hash.toLowerCase() === args.owner_hash.toLowerCase() &&
          s.body_sha256 === args.body_sha256 &&
          s.status === "verified" &&
          s.verified_at !== null &&
          s.permit_consumed_at === null &&
          Date.parse(s.expires_at) > now,
      );
      if (candidates.length === 0) return { outcome: "no-session" };
      if (!args.permit) return { outcome: "bad-permit" };
      let session: UploadSessionRow | null = null;
      for (const candidate of candidates) {
        const permitExpiry = permitExpiryForSession(Date.parse(candidate.expires_at), Date.parse(candidate.verified_at!));
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
      if (!session) return { outcome: "bad-permit" };

      const q = args.quota;
      const ipHour = this.quotaCount(ipHourKey, now);
      if (ipHour >= q.perIpHour) return { outcome: "quota", limit: "per-ip-hour", retryAfterSec: 3600 };
      const ipDay = this.quotaCount(ipDayKey, now);
      if (ipDay >= q.perIpDay) return { outcome: "quota", limit: "per-ip-day", retryAfterSec: 3600 };
      const global = this.quotas.get(globalKey);
      const gCount = global && global.expiresMs > now ? global.count : 0;
      const gBytes = global && global.expiresMs > now ? global.bytes : 0;
      const gRows = global && global.expiresMs > now ? global.rows : 0;
      if (gCount >= q.globalDay) return { outcome: "quota", limit: "global-day", retryAfterSec: 3600 };
      if (gBytes + args.byte_size > q.globalBytesDay) return { outcome: "quota", limit: "global-bytes", retryAfterSec: 3600 };
      if (gRows + args.row_count > q.globalRowsDay) return { outcome: "quota", limit: "global-rows", retryAfterSec: 3600 };

      const usage = await this.storageFootprint();
      const cap = args.capacity;
      if (cap.bytes === null && cap.rows === null) {
        if (cap.strictMissing) return { outcome: "capacity", message: "Publishing paused: storage capacity is not configured." };
      } else {
        if (cap.bytes !== null && usage.bytes >= cap.bytes * 0.8) {
          return { outcome: "capacity", message: "Publishing paused: storage capacity reached." };
        }
        if (cap.rows !== null && usage.rows >= cap.rows * 0.8) {
          return { outcome: "capacity", message: "Publishing paused: row capacity reached." };
        }
      }
      const capacityWarn =
        (cap.bytes !== null && usage.bytes >= cap.bytes * 0.7) || (cap.rows !== null && usage.rows >= cap.rows * 0.7);

      this.sessions.set(session.session_id, { ...session, permit_consumed_at: new Date(now).toISOString() });
      this.quotaCharge(ipHourKey, args.byte_size, args.row_count, 3600_000, now);
      this.quotaCharge(ipDayKey, args.byte_size, args.row_count, 24 * 3600_000, now);
      this.quotaCharge(globalKey, args.byte_size, args.row_count, 24 * 3600_000, now);

      const stamp = new Date(now).toISOString();
      const run: StoredRun = {
        submission_id: args.submission_id, public_id: args.public_id, owner_hash: args.owner_hash,
        body_sha256: args.body_sha256, benchmark: args.benchmarkMeta, description_md: args.description_md,
        revision: 1, hidden: false, deleted: false, summary: args.summary,
        byte_size: args.byte_size, row_count: args.row_count, created_at: stamp, updated_at: stamp,
      };
      this.runs.set(args.submission_id, run);
      this.byPublic.set(args.public_id, args.submission_id);
      const chunked: unknown[][] = [];
      for (let i = 0; i < args.rows.length; i += 1000) chunked.push(args.rows.slice(i, i + 1000));
      this.chunks.set(args.submission_id, chunked);
      return { outcome: "created", run, capacityWarn };
    });
  }

  private quotaCount(key: string, now: number): number {
    const cur = this.quotas.get(key);
    return cur && cur.expiresMs > now ? cur.count : 0;
  }

  private quotaCharge(key: string, bytes: number, rows: number, windowMs: number, now: number): void {
    const cur = this.quotas.get(key);
    if (!cur || cur.expiresMs <= now) {
      this.quotas.set(key, { count: 1, bytes, rows, expiresMs: now + windowMs });
    } else {
      this.quotas.set(key, { count: cur.count + 1, bytes: cur.bytes + bytes, rows: cur.rows + rows, expiresMs: cur.expiresMs });
    }
  }

  async updateDescription(submissionId: string, descriptionMd: string, expectedRevision: number): Promise<StoredRun | null> {
    return this.withLocks([`sub:${submissionId}`], async () => {
      const run = this.runs.get(submissionId);
      if (!run || run.deleted || run.revision !== expectedRevision) return null;
      const next = { ...run, description_md: descriptionMd, revision: run.revision + 1, updated_at: new Date().toISOString() };
      this.runs.set(submissionId, next);
      return next;
    });
  }

  async deleteRun(submissionId: string): Promise<StoredRun | null> {
    return this.withLocks([`sub:${submissionId}`], async () => {
      const run = this.runs.get(submissionId);
      if (!run || run.deleted) return null;
      const tombstone: StoredRun = {
        ...run, deleted: true, benchmark: null as unknown as StoredRun["benchmark"],
        description_md: "", summary: null as unknown as StoredRun["summary"], updated_at: new Date().toISOString(),
      };
      this.runs.set(submissionId, tombstone);
      this.chunks.delete(submissionId);
      await this.revokeSessionsForSubmission(submissionId);
      return tombstone;
    });
  }

  async setHidden(submissionId: string, hidden: boolean): Promise<void> {
    const run = this.runs.get(submissionId);
    if (run) this.runs.set(submissionId, { ...run, hidden, updated_at: new Date().toISOString() });
  }

  async listRuns(filters: BenchmarkFilters, limit: number, cursor: ListCursor | null): Promise<ListResult> {
    const sort = filters.sort ?? "newest";
    const position = (r: StoredRun): ListCursor => ({ createdAt: r.created_at, publicId: r.public_id, value: sortValue(r.summary, sort) });
    const rows = [...this.runs.values()].filter(r => !r.deleted && !r.hidden && matchesFilters(r.summary, filters))
      .filter(r => !cursor || comparePosition(position(r), cursor, sort) > 0)
      .sort((a, b) => comparePosition(position(a), position(b), sort));
    const page = rows.slice(0, limit), last = page.at(-1);
    return { items: page.map(r => ({ public_id: r.public_id, summary: r.summary, description_md: r.description_md, revision: r.revision, created_at: r.created_at, updated_at: r.updated_at })),
      next_cursor: rows.length > limit && last ? encodeDiscoveryCursor(last.created_at, last.public_id, filters, sortValue(last.summary, sort)) : null };
  }

  async listOptions(field: OptionField, query: string, filters: BenchmarkFilters): Promise<BenchmarkOptions> {
    const remaining = { ...filters }; delete remaining[field];
    const counts = new Map<string, number>();
    for (const r of this.runs.values()) {
      if (r.deleted || r.hidden || !matchesFilters(r.summary, remaining)) continue;
      const candidates = field === "gpu" && remaining.vendor
        ? (r.benchmark.environment?.execution.selected_gpus ?? []).filter(g => g.vendor?.toLowerCase().includes(remaining.vendor!.toLowerCase())).flatMap(g => g.name ? [g.name] : [])
        : textValues(r.summary, field);
      for (const value of new Set(candidates)) {
        if (value && value.toLowerCase().includes(query.toLowerCase())) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    const options = [...counts].map(([value, count]) => ({ value, count })).sort((a,b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
    return { options: options.slice(0, 30), has_more: options.length > 30 };
  }

  async getRowSlice(submissionId: string, offset: number, limit: number): Promise<{ rows: unknown[]; nextOffset: number | null; total: number }> {
    const run = this.runs.get(submissionId);
    if (!run || run.deleted) return { rows: [], nextOffset: null, total: 0 };
    // Bounded: read only overlapping 1000-row chunks.
    const firstChunk = Math.floor(offset / 1000);
    const lastChunk = Math.floor((offset + limit - 1) / 1000);
    const stored = this.chunks.get(submissionId) ?? [];
    const window: unknown[] = [];
    for (let c = firstChunk; c <= lastChunk; c += 1) window.push(...(stored[c] ?? []));
    const startInWindow = offset - firstChunk * 1000;
    const slice = window.slice(startInWindow, startInWindow + limit);
    const total = run.row_count;
    const next = offset + slice.length < total ? offset + slice.length : null;
    return { rows: slice, nextOffset: next, total };
  }

  async createManagementSession(row: Omit<ManagementSessionRow, "revoked_at" | "created_at">): Promise<ManagementSessionRow> {
    const full: ManagementSessionRow = { ...row, revoked_at: null, created_at: new Date().toISOString() };
    this.mgmt.set(row.id, full);
    return full;
  }

  async getManagementSession(id: string): Promise<ManagementSessionRow | null> {
    return this.mgmt.get(id) ?? null;
  }

  async revokeManagementSession(id: string): Promise<void> {
    const m = this.mgmt.get(id);
    if (m) this.mgmt.set(id, { ...m, revoked_at: new Date().toISOString() });
  }

  async createReport(row: Omit<ReportRow, "id" | "created_at"> & { id?: string }): Promise<ReportRow> {
    const id = row.id ?? crypto.randomUUID();
    const full: ReportRow = { id, target_submission_id: row.target_submission_id, reason: row.reason, reporter_ip_hmac: row.reporter_ip_hmac, created_at: new Date().toISOString() };
    this.reports.set(id, { ...full, createdMs: Date.now() });
    return full;
  }

  async listReports(limit: number): Promise<ReportRow[]> {
    return [...this.reports.values()]
      .sort((a, b) => b.createdMs - a.createdMs)
      .slice(0, limit)
      .map((r) => ({ id: r.id, target_submission_id: r.target_submission_id, reason: r.reason, reporter_ip_hmac: r.reporter_ip_hmac, created_at: r.created_at }));
  }

  async deleteReport(id: string): Promise<void> {
    this.reports.delete(id);
  }

  async audit(actor: string, action: string, target: string | null, reason: string | null): Promise<void> {
    this.audits.push({ actor, action, target, reason });
  }

  async quotaGateAtomic(key: string, windowMs: number, limit: number, nowMs = Date.now()): Promise<{ allowed: boolean; retryAfterSec: number }> {
    return this.withLocks([`q:${key}`], async () => {
      const cur = this.quotas.get(key);
      if (!cur || cur.expiresMs <= nowMs) {
        this.quotas.set(key, { count: 1, bytes: 0, rows: 0, expiresMs: nowMs + windowMs });
        return { allowed: true, retryAfterSec: 0 };
      }
      if (cur.count >= limit) {
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(windowMs / 1000)) };
      }
      this.quotas.set(key, { ...cur, count: cur.count + 1 });
      return { allowed: true, retryAfterSec: 0 };
    });
  }

  async quotaProbe(key: string, nowMs = Date.now()): Promise<number> {
    const cur = this.quotas.get(key);
    return cur && cur.expiresMs > nowMs ? cur.count : 0;
  }

  async quotaPrune(nowMs = Date.now()): Promise<number> {
    let removed = 0;
    for (const [k, v] of this.quotas) {
      if (v.expiresMs <= nowMs) {
        this.quotas.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  async clearExpiredReportIpHmacs(nowMs = Date.now()): Promise<number> {
    const cutoff = nowMs - REPORT_IP_RETENTION_MS;
    let cleared = 0;
    for (const [id, r] of this.reports) {
      if (r.createdMs <= cutoff && r.reporter_ip_hmac !== null) {
        this.reports.set(id, { ...r, reporter_ip_hmac: null });
        cleared += 1;
      }
    }
    return cleared;
  }

  async pruneManagementSessions(nowMs = Date.now()): Promise<number> {
    const cutoff = nowMs - SESSION_RETENTION_MS;
    let removed = 0;
    for (const [id, s] of this.mgmt) {
      const revokedMs = s.revoked_at ? Date.parse(s.revoked_at) : null;
      if (Date.parse(s.expires_at) <= cutoff || (revokedMs !== null && revokedMs <= cutoff)) {
        this.mgmt.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async pruneUploadSessions(nowMs = Date.now()): Promise<number> {
    const cutoff = nowMs - SESSION_RETENTION_MS;
    let removed = 0;
    for (const [id, s] of this.sessions) {
      if (Date.parse(s.expires_at) <= cutoff) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Approximation for the test fake (accepted payload bytes/rows only). The
   * Postgres implementation measures the whole bench schema including
   * indexes/TOAST/auxiliary tables; provisioned limits are sized to that scope.
   */
  async storageFootprint(): Promise<{ bytes: number; rows: number }> {
    let bytes = 0, rows = 0;
    for (const r of this.runs.values()) if (!r.deleted) { bytes += r.byte_size; rows += r.row_count; }
    return { bytes, rows };
  }

  /**
   * The fake has no schema ledger, so it reports whatever a test set here; it
   * starts fully migrated. This store is only ever reachable through
   * __setTestStore, never from a deployment, so it cannot make a real readiness
   * check pass.
   */
  migrationLedger: string[] = [...REQUIRED_MIGRATIONS];

  async appliedMigrations(): Promise<string[]> {
    return [...this.migrationLedger];
  }
}

export function hashCsrfForTest(token: string): string {
  return csrfTokenHash(token);
}

export { UPLOAD_PERMIT_TTL_MS };

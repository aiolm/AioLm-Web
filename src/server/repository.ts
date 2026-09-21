import type { ListCursor } from "../lib/pagination";
import type { BenchmarkOptions, OptionField } from "../lib/benchmark-discovery";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";
import { sha256HexUtf8 } from "../lib/crypto";
import type { QuotaConfig } from "../lib/env";
import type { BenchmarkFilters, BenchmarkSummary } from "../lib/summary";

export interface StoredRun {
  submission_id: string;
  public_id: string;
  owner_hash: string;
  body_sha256: string;
  /** Acceptance metadata WITHOUT measurement rows (rows live in chunks). */
  benchmark: PublicBenchmarkSubmission;
  description_md: string;
  revision: number;
  hidden: boolean;
  deleted: boolean;
  summary: BenchmarkSummary;
  byte_size: number;
  row_count: number;
  created_at: string;
  updated_at: string;
}

export interface UploadSessionRow {
  session_id: string;
  submission_id: string;
  body_sha256: string;
  owner_hash: string;
  status: "pending" | "verified" | "expired";
  expires_at: string;
  verified_at: string | null;
  permit_consumed_at: string | null;
  created_at: string;
}

export interface ManagementSessionRow {
  id: string;
  submission_id: string;
  csrf_token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface ReportRow {
  id: string;
  target_submission_id: string;
  reason: string;
  reporter_ip_hmac: string | null;
  created_at: string;
}

export interface PublicListItem {
  public_id: string;
  summary: BenchmarkSummary;
  description_md: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ListResult {
  items: PublicListItem[];
  next_cursor: string | null;
}

export interface AcceptArgs {
  submission_id: string;
  public_id: string;
  owner_hash: string;
  body_sha256: string;
  /** Benchmark metadata with measurements.rows emptied; rows passed separately. */
  benchmarkMeta: PublicBenchmarkSubmission;
  rows: unknown[];
  description_md: string;
  summary: BenchmarkSummary;
  byte_size: number;
  row_count: number;
  permit: string | null;
  permitSecret: string;
  quotaSecret: string;
  ip: string;
  nowMs: number;
  quota: QuotaConfig;
  capacity: { bytes: number | null; rows: number | null; strictMissing: boolean };
}

export type AcceptOutcome =
  | { outcome: "created"; run: StoredRun; capacityWarn: boolean }
  | { outcome: "replay"; run: StoredRun }
  | { outcome: "conflict-owner" }
  | { outcome: "conflict-body" }
  | { outcome: "deleted" }
  | { outcome: "no-session" }
  | { outcome: "bad-permit" }
  | { outcome: "quota"; limit: string; retryAfterSec: number }
  | { outcome: "capacity"; message: string };

export interface BenchmarkStore {
  // Upload sessions
  createUploadSession(row: Omit<UploadSessionRow, "status" | "verified_at" | "permit_consumed_at" | "created_at">): Promise<UploadSessionRow>;
  /** Effective status: expired when now passes expires_at, for pending AND verified. */
  getUploadSession(sessionId: string, nowMs?: number): Promise<UploadSessionRow | null>;
  markSessionVerified(sessionId: string): Promise<UploadSessionRow | null>;
  revokeSessionsForSubmission(submissionId: string): Promise<void>;

  // Runs. Acceptance (permit verify + consume, replay/conflict/deleted checks,
  // quota check + charge, capacity guard, insert) happens in ONE atomic unit.
  getRunBySubmission(submissionId: string): Promise<StoredRun | null>;
  getRunByPublicId(publicId: string): Promise<StoredRun | null>;
  acceptRunAtomic(args: AcceptArgs): Promise<AcceptOutcome>;
  updateDescription(submissionId: string, descriptionMd: string, expectedRevision: number): Promise<StoredRun | null>;
  deleteRun(submissionId: string): Promise<StoredRun | null>;
  setHidden(submissionId: string, hidden: boolean): Promise<void>;
  /** Public columns only: never benchmark payloads or owner hashes. */
  listRuns(filters: BenchmarkFilters, limit: number, cursor: ListCursor | null): Promise<ListResult>;
  listOptions(field: OptionField, query: string, filters: BenchmarkFilters): Promise<BenchmarkOptions>;
  /** Bounded slice: reads only the overlapping 1000-row chunk(s). */
  getRowSlice(submissionId: string, offset: number, limit: number): Promise<{ rows: unknown[]; nextOffset: number | null; total: number }>;

  // Management
  createManagementSession(row: Omit<ManagementSessionRow, "revoked_at" | "created_at">): Promise<ManagementSessionRow>;
  getManagementSession(id: string): Promise<ManagementSessionRow | null>;
  revokeManagementSession(id: string): Promise<void>;

  // Reports + audit
  createReport(row: Omit<ReportRow, "id" | "created_at"> & { id?: string }): Promise<ReportRow>;
  listReports(limit: number): Promise<ReportRow[]>;
  deleteReport(id: string): Promise<void>;
  audit(actor: string, action: string, target: string | null, reason: string | null): Promise<void>;

  // Atomic fixed-window gate (check + increment in one unit; no get/add race).
  quotaGateAtomic(key: string, windowMs: number, limit: number, nowMs?: number): Promise<{ allowed: boolean; retryAfterSec: number }>;
  /** Non-mutating peek at the current window count (0 when expired/absent). Never increments. */
  quotaProbe(key: string, nowMs?: number): Promise<number>;
  /** Remove expired quota buckets (honor 24h retention: expired means expired). */
  quotaPrune(nowMs?: number): Promise<number>;
  /** Clear reporter IP HMACs older than 24h. Returns cleared count. */
  clearExpiredReportIpHmacs(nowMs?: number): Promise<number>;
  /**
   * Remove management sessions that have been dead for longer than
   * SESSION_RETENTION_MS (expired or revoked). Tombstones, audit rows and the
   * deletion ledger are never touched. Returns removed count.
   */
  pruneManagementSessions(nowMs?: number): Promise<number>;
  /**
   * Remove upload sessions whose expiry is older than SESSION_RETENTION_MS, so
   * no still-mintable permit can outlive its row. Returns removed count.
   */
  pruneUploadSessions(nowMs?: number): Promise<number>;

  /** Actual storage footprint including indexes/chunks/tombstones. */
  storageFootprint(): Promise<{ bytes: number; rows: number }>;

  /**
   * Filenames recorded in the migration ledger. A bounded read that proves
   * connectivity, that the private `bench` schema exists, which migrations have
   * actually been applied, and that the runtime role holds its SELECT grant -
   * the readiness signal. Throws when the database is unreachable, the schema is
   * absent, or the read exceeds `timeoutMs`.
   *
   * Implementations must bound the read in the DATABASE, not only in the
   * caller: a promise that stops waiting still leaves the query running, still
   * holding a pooled backend. The bound must also not outlive the read, because
   * a transaction pooler hands the same backend to the next client.
   */
  appliedMigrations(timeoutMs?: number): Promise<string[]>;
}

/**
 * Migrations that must be present in the ledger before the deployment is ready
 * to serve. A count is not coverage: a database carrying 001-004 and two
 * unrelated files has "some" migrations while missing the least-privilege
 * grants, the retention grants, and the readiness grant this app depends on.
 *
 * Adding a file to sql/migrations/ means adding it here. Nothing enumerates the
 * directory at runtime - a serverless bundle is not a checkout - so
 * tests/unit/migrations-manifest.test.ts asserts this list is exactly the
 * directory contents and fails the build when the two drift.
 */
export const REQUIRED_MIGRATIONS: readonly string[] = [
  "001_init.sql",
  "002_roles.sql",
  "003_least_privilege.sql",
  "004_filter_indexes.sql",
  "005_retention_grants.sql",
  "006_trgm_filter_indexes.sql",
  "007_readiness_grant.sql",
  "008_benchmark_discovery.sql",
  "009_input_context.sql",
  "010_model_metadata.sql",
];

/**
 * How long the readiness ledger read may take. Short on purpose: the probe runs
 * on every uptime check, and a database that cannot answer this in three
 * seconds is not ready by any useful definition.
 */
export const READINESS_PROBE_TIMEOUT_MS = 3000;

/**
 * Retention grace kept after a session row is already unusable. Upload
 * sessions and their permits live at most 5 minutes and management sessions 30
 * minutes, so a full day past expiry is far beyond any replay window while
 * still leaving room for incident inspection.
 */
export const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Reporter IP HMACs are cleared this long after the report row was created. */
export const REPORT_IP_RETENTION_MS = 24 * 60 * 60 * 1000;

export function csrfTokenHash(token: string): string {
  return sha256HexUtf8(`csrf-v1|${token}`);
}

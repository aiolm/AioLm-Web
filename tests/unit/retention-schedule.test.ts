import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_IP_RETENTION_MS, SESSION_RETENTION_MS } from "@/server/repository";

/**
 * The scheduled retention pass lives in SQL (pg_cron runs it inside the
 * database) while the manual pass lives in TypeScript (`npm run prune`). Two
 * implementations of one policy drift silently, and the drift is invisible
 * until someone audits what was actually deleted months later. These checks
 * hold the SQL job to the same window constants, the same target tables, and
 * the same hourly schedule that docs/operations.md publishes.
 */

const SQL = readFileSync(join(process.cwd(), "sql", "operations", "retention-pg_cron.sql"), "utf8");

/** Statement text only: the file is mostly comments explaining the policy. */
const STATEMENTS = SQL.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("scheduled retention job", () => {
  it("is scheduled hourly under one stable job name", () => {
    // Hourly is what docs/operations.md commits to (target cutoff + one
    // interval = up to 25h). A daily schedule would nearly double that.
    expect(STATEMENTS).toContain("'0 * * * *'");
    expect(STATEMENTS).toContain("'aiolm-web-retention'");
    // cron.schedule(name, schedule, command) replaces a job of the same name,
    // so re-running the file cannot stack up duplicate jobs.
    expect(STATEMENTS).toMatch(/\.schedule\(%L, %L, %L\)|schedule\(\s*'aiolm-web-retention'/);
  });

  it("uses the same retention windows as the TypeScript job", () => {
    expect(SESSION_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
    expect(REPORT_IP_RETENTION_MS).toBe(24 * 60 * 60 * 1000);
    const intervals = STATEMENTS.match(/interval '(\d+) hours'/g) ?? [];
    expect(intervals.length).toBeGreaterThanOrEqual(2);
    for (const found of intervals) expect(found).toBe("interval '24 hours'");
  });

  it("reports the same counter names the CLI prints", () => {
    for (const key of [
      "prunedQuotaBuckets", "clearedReportIpHmacs", "prunedManagementSessions", "prunedUploadSessions",
    ]) {
      expect(STATEMENTS).toContain(`'${key}'`);
    }
  });

  it("deletes only from the two session tables and the quota buckets", () => {
    const deletes = [...STATEMENTS.matchAll(/delete\s+from\s+([\w.]+)/gi)].map((m) => m[1]);
    expect(new Set(deletes)).toEqual(
      new Set(["bench.quota_buckets", "bench.management_sessions", "bench.upload_sessions"]),
    );
    // The deletion ledger, the moderation ledger and the report rows themselves
    // are never removed by retention.
    for (const ledger of ["bench.benchmark_runs", "bench.audit_log"]) {
      expect(deletes).not.toContain(ledger);
    }
  });

  it("touches reports only to blank the reporter IP HMAC", () => {
    const updates = [...STATEMENTS.matchAll(/update\s+([\w.]+)\s+set\s+([\w]+)\s*=\s*null/gi)]
      .map((m) => `${m[1]}.${m[2]}`);
    expect(updates).toEqual(["bench.reports.reporter_ip_hmac"]);
  });

  it("keeps the retention function off PUBLIC", () => {
    // Postgres grants EXECUTE on new functions to PUBLIC, which would let the
    // least-privilege runtime and moderation roles trigger a retention pass.
    expect(STATEMENTS).toMatch(/revoke\s+all\s+on\s+function\s+bench\.run_retention\(\)\s+from\s+public/i);
  });

  it("pins the function's search_path and keeps invoker rights", () => {
    expect(STATEMENTS).toMatch(/set\s+search_path\s*=\s*pg_catalog,\s*bench/i);
    expect(STATEMENTS).not.toMatch(/security\s+definer/i);
  });

  it("degrades to a notice when pg_cron is not installed", () => {
    // Synthetic test clusters have no pg_cron; installing the function must
    // still succeed so the manual `npm run prune` path stays usable.
    expect(STATEMENTS).toMatch(/pg_extension\s+where\s+extname\s*=\s*'pg_cron'/i);
    expect(STATEMENTS).toMatch(/raise notice/i);
  });

  it("calls the schema that owns schedule(), not the extension's registered schema", () => {
    // A managed pg_cron registers the extension against pg_catalog while its
    // functions live in the cron schema. Deriving the call from
    // pg_extension.extnamespace therefore produced pg_catalog.schedule(...),
    // and the install failed on the real Supabase project with 42883
    // "function pg_catalog.schedule(unknown, unknown, unknown) does not exist".
    // No cluster in this suite has pg_cron, so the branch is unreachable here:
    // the guard is the catalog rule itself. pg_depend.deptype 'e' is the
    // extension-membership edge, and pg_proc.pronamespace is the schema the
    // function can actually be called in.
    expect(STATEMENTS).not.toMatch(/extnamespace/i);
    expect(STATEMENTS).toMatch(/join\s+pg_proc\s+p\s+on\s+p\.oid\s*=\s*d\.objid/i);
    expect(STATEMENTS).toMatch(/join\s+pg_namespace\s+n\s+on\s+n\.oid\s*=\s*p\.pronamespace/i);
    expect(STATEMENTS).toMatch(/d\.deptype\s*=\s*'e'/i);
    expect(STATEMENTS).toMatch(/p\.proname\s*=\s*'schedule'/i);
    // schedule(name, schedule, command) is the three-argument form; pg_cron
    // also ships a two-argument schedule(schedule, command) with no job name,
    // which would stack a duplicate job on every re-run.
    expect(STATEMENTS).toMatch(/p\.pronargs\s*=\s*3/i);
    // Installed but unusable is a failure, not a silent skip: without a job
    // nothing ever prunes, and the notice path is reserved for "no pg_cron".
    expect(STATEMENTS).toMatch(/raise exception/i);
  });
});

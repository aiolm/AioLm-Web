import { getDb } from "../src/server/db";
import { PostgresBenchmarkStore } from "../src/server/postgres-store";

/**
 * Retention job. Removes state that is already unusable:
 *
 * - expired quota buckets,
 * - reporter IP HMACs older than 24h (the report row itself survives),
 * - management sessions expired or revoked more than 24h ago,
 * - upload sessions whose 5-minute expiry passed more than 24h ago.
 *
 * Tombstones, the moderation audit log, and report rows are never deleted.
 *
 * Runnable from any scheduler (`npm run prune`, CI schedule, pg_cron); see
 * docs/operations.md for the schedule and the resulting upper bounds. Uses the
 * runtime role, which holds exactly the grants this job needs: quota-bucket
 * delete, `reporter_ip_hmac` column update, and session-row delete.
 */
async function main(): Promise<void> {
  const sql = getDb();
  const store = new PostgresBenchmarkStore(sql);
  try {
    const prunedQuotaBuckets = await store.quotaPrune();
    const clearedReportIpHmacs = await store.clearExpiredReportIpHmacs();
    const prunedManagementSessions = await store.pruneManagementSessions();
    const prunedUploadSessions = await store.pruneUploadSessions();
    console.log(
      JSON.stringify({ prunedQuotaBuckets, clearedReportIpHmacs, prunedManagementSessions, prunedUploadSessions }),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

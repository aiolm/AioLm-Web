import { PostgresBenchmarkStore } from "../src/server/postgres-store";
import { getModerationDb } from "../src/server/db";

/**
 * Private operator CLI: list reports / hide / delete, with a protected DB role
 * and an audit reason. Description edits never unhide.
 *
 * Usage:
 *   npm run moderate -- reports [--limit 50]
 *   npm run moderate -- hide <submission-id> --reason "..."
 *   npm run moderate -- unhide <submission-id> --reason "..."
 *   npm run moderate -- delete <submission-id> --reason "..."
 *   npm run moderate -- dismiss-report <report-id> --reason "..."
 */
async function main(): Promise<void> {
  const [command, target, ...rest] = process.argv.slice(2);
  const reasonFlag = rest.indexOf("--reason");
  const reason = reasonFlag >= 0 ? rest.slice(reasonFlag + 1).join(" ").trim() : "";
  const limitFlag = rest.indexOf("--limit");
  const limit = limitFlag >= 0 ? Number(rest[limitFlag + 1]) : 50;
  const sql = getModerationDb();
  const store = new PostgresBenchmarkStore(sql);
  try {
    if (command === "reports") {
      const rows = await store.listReports(Number.isSafeInteger(limit) ? Math.min(limit, 200) : 50);
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    if (!command || !target) {
      console.error("Usage: moderate <reports|hide|unhide|delete|dismiss-report> <id> --reason \"...\"");
      process.exit(2);
    }
    if (!reason && command !== "reports") {
      console.error("An audit --reason is required.");
      process.exit(2);
    }
    if (command === "hide" || command === "unhide") {
      await store.setHidden(target, command === "hide");
      await store.audit("moderation-cli", command, target, reason);
      console.log(`${command}d ${target}`);
      return;
    }
    if (command === "delete") {
      const run = await store.getRunBySubmission(target);
      if (!run) {
        console.error("No such submission.");
        process.exit(1);
      }
      await store.deleteRun(target);
      await store.audit("moderation-cli", "delete", target, reason);
      console.log(`deleted ${target}`);
      return;
    }
    if (command === "dismiss-report") {
      await store.deleteReport(target);
      await store.audit("moderation-cli", "dismiss-report", target, reason);
      console.log(`dismissed ${target}`);
      return;
    }
    console.error(`Unknown command: ${command}`);
    process.exit(2);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

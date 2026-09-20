import { getMigrationDb } from "../src/server/db";
import { applyMigrations } from "../src/server/migrations";

/** Apply sql/migrations/*.sql in order using the migration role URL. */
async function main(): Promise<void> {
  const sql = getMigrationDb();
  try {
    const applied = await applyMigrations(sql);
    for (const file of applied) console.log(`applied ${file}`);
    console.log(applied.length === 0 ? "migrations up to date" : "migrations complete");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

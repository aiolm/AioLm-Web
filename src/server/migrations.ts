import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type postgres from "postgres";

/**
 * Ordered migration runner. Runs inside ONE transaction holding a
 * transaction-scoped advisory lock (pg_advisory_xact_lock), so the whole
 * apply is race-safe on any pool size: concurrent runners serialize and the
 * loser blocks until the winner commits, then sees every file applied and
 * does nothing. Each applied file (name + sha256) is recorded in
 * bench.schema_migrations; applied files are skipped after checksum
 * verification. Never edit an applied migration; add a new one instead.
 *
 * Callers must supply a reserved single-connection client (see getMigrationDb:
 * max:1) so the lock and the transaction share one session.
 */
export async function applyMigrations(sql: postgres.Sql, dir?: string): Promise<string[]> {
  const migrationsDir = dir ?? join(process.cwd(), "sql", "migrations");
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const bodies = new Map<string, string>();
  for (const file of files) {
    bodies.set(file, await readFile(join(migrationsDir, file), "utf8"));
  }
  const digests = new Map<string, string>();
  for (const [file, body] of bodies) {
    digests.set(file, createHash("sha256").update(body, "utf8").digest("hex"));
  }
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('aiolm-web-migrations'))`;
    // Extensions are not always installed into a schema that is already on the
    // search_path: managed Postgres commonly puts pg_trgm into a dedicated
    // `extensions` schema, and CREATE EXTENSION IF NOT EXISTS leaves it there.
    // 004_filter_indexes.sql spells the gin_trgm_ops operator class
    // unqualified, so it would not resolve there. Append pg_trgm's own schema —
    // and nothing else — to the transaction-local search_path, and only when it
    // is not already reachable (current_schemas). The name is catalog-derived,
    // never user input, and quoted with quote_ident; appending leaves the
    // resolution order of existing names unchanged, so migrations that have
    // already been applied keep their recorded checksums.
    await tx`
      select set_config('search_path',
        current_setting('search_path') || coalesce((
          select ', ' || quote_ident(n.nspname)
          from pg_extension e join pg_namespace n on n.oid = e.extnamespace
          where e.extname = 'pg_trgm' and n.nspname <> all (current_schemas(true))
        ), ''),
        true)`;
    await tx`create schema if not exists bench`;
    await tx`
      create table if not exists bench.schema_migrations (
        filename text primary key,
        sha256 text not null,
        applied_at timestamptz not null default now()
      )`;
    const recorded = await tx<Array<{ filename: string; sha256: string }>>`
      select filename, sha256 from bench.schema_migrations`;
    const seen = new Map(recorded.map((r) => [r.filename, r.sha256]));
    const applied: string[] = [];
    for (const file of files) {
      const digest = digests.get(file)!;
      const prior = seen.get(file);
      if (prior !== undefined) {
        if (prior !== digest) {
          throw new Error(`Migration ${file} was modified after being applied; add a new migration instead.`);
        }
        continue;
      }
      await tx.unsafe(bodies.get(file)!);
      await tx`insert into bench.schema_migrations (filename, sha256) values (${file}, ${digest})`;
      applied.push(file);
    }
    return applied;
  });
}

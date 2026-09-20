# Backup and restore

**There is no provider-managed backup on the Supabase free plan.** Automated
daily backups with point-in-time recovery are a paid-plan feature; a free
project has no scheduled backup, no retention window, and no self-serve restore
in the dashboard. Treat the database as unbacked until a dump exists somewhere
else. Do not write a policy — here or anywhere else — that assumes a provider
restore point.

What the free plan does give you, and the honest fallback, is a manual logical
dump. It is a point-in-time copy taken when you run it, and nothing more.

## Backup

Take a dump before every migration, every moderation sweep, and every
dependency or platform upgrade, and on whatever ordinary cadence you can
actually keep.

`$BACKUP_DIR` and `$DATABASE_DIRECT_URL` below are shell variables for these
commands, not application configuration: the app reads neither. Supabase shows
the direct connection string next to the pooler one in Project Settings ->
Database.

```sh
# Private, restricted directory; the dump contains every published benchmark,
# every owner hash, and every session row.
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"

# Dump the private schema only. Use the MIGRATION-OWNER URL: the runtime role
# cannot read every table. The DIRECT (non-pooler) connection string is
# required - pg_dump does not work through the transaction pooler.
pg_dump "$DATABASE_DIRECT_URL" \
  --schema=bench --no-owner --no-privileges \
  --format=custom --file="$BACKUP_DIR/aiolm-web-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Use a `pg_dump` from the same major version as the server (Supabase is
PostgreSQL 15+); an older client refuses to dump a newer server.

Also export the deletion ledger separately, and keep it **outside** the dump:

```sh
psql "$DATABASE_DIRECT_URL" -At -c \
  "SELECT submission_id, body_sha256, owner_hash, public_id
     FROM bench.benchmark_runs WHERE deleted = true" \
  > "$BACKUP_DIR/deletion-ledger-$(date -u +%Y%m%dT%H%M%SZ).tsv"
```

The ledger is the source of truth for what must stay deleted. A dump taken
before a deletion still contains the payload; the ledger is what tells you to
remove it again after a restore.

Verify a dump is readable before trusting it:

```sh
pg_restore --list "$BACKUP_DIR/<file>.dump" | head
```

Retention is whatever you enforce yourself: keep the last N dumps in a private
location off the database host, and delete older ones deliberately. Nothing
expires them for you.

## Restore (private first, verify, then reopen)

1. Restore into a NEW isolated project or database, never over production.
   ```sh
   createdb -T template0 aiolm_web_restore     # or a new Supabase project
   pg_restore --dbname "$RESTORE_URL" --no-owner --no-privileges "$BACKUP_DIR/<file>.dump"
   ```
2. Run `npm run db:migrate` against the restored copy with a migration-owner URL
   so the schema, the least-privilege roles and the grants are current, then
   re-run `sql/operations/retention-pg_cron.sql` if that copy becomes the live
   database.
3. Apply the deletion ledger you exported: re-delete everything deleted after
   the backup point.
   ```sh
   npx tsx scripts/moderate.ts delete <submission-id> --reason "post-restore ledger"
   ```
4. Verify: `npm run config:check` against the new environment, `GET /v1/readiness`,
   spot-check public list/detail/rows, confirm hidden and deleted records stay
   hidden, run `npm test`.
5. Point production at the verified copy, then reopen publicly.

Never reopen a restored copy publicly before steps 2–4: a stale backup
resurrects deleted and moderated content, and a restored database has none of
the least-privilege grants until migrations run again.

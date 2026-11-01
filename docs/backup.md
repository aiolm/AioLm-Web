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

`$BACKUP_DIR` and `$DATABASE_BACKUP_URL` below are shell variables for these
commands, not application configuration: the app reads neither. Copy the
migration-owner connection string from the project's **Connect** dialog.
Prefer a direct connection. On an IPv4-only network, Supabase also supports
the **Session pooler** (port 5432) for backups; never use the transaction
pooler (port 6543). See the [provider's backup guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
Keep certificate and hostname verification enabled (`sslmode=verify-full`)
with the CA from the project's Database Settings; do not disable verification.

```sh
# Private, restricted directory; the dump contains every published benchmark,
# every owner hash, and every session row.
mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR"

# Dump the private schema only. Use the MIGRATION-OWNER URL: the runtime role
# cannot read every table. Use direct or Session pooler, never transaction mode.
pg_dump "$DATABASE_BACKUP_URL" \
  --schema=bench --no-owner --no-privileges \
  --format=custom --file="$BACKUP_DIR/aiolm-web-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Use a `pg_dump` from the same major version as the server (Supabase is
PostgreSQL 15+); an older client refuses to dump a newer server.

Also export the deletion ledger separately, and keep it **outside** the dump:

```sh
psql "$DATABASE_BACKUP_URL" -At -c \
  "SELECT submission_id, body_sha256, owner_hash, public_id
     FROM bench.benchmark_runs WHERE deleted = true" \
  > "$BACKUP_DIR/deletion-ledger-$(date -u +%Y%m%dT%H%M%SZ).tsv"
```

Export the ledger again after deletions, including moderation sweeps that delete
runs, and keep the newest copy off the database host. A dump taken before a
deletion still contains
the payload; only a ledger that records that deletion can tell you to remove it
again. If production is lost, deletions after the newest ledger export cannot
be recovered from these files. If production is still available, export a fresh
ledger before restoring. This ledger covers deletions only, not hide/unhide
changes; those require a separate, trustworthy record of moderation state.

Verify a dump is readable before trusting it:

```sh
pg_restore --list "$BACKUP_DIR/<file>.dump"
```

Retention is whatever you enforce yourself: keep the last N dumps in a private
location off the database host, and delete older ones deliberately. Keep deletion
ledgers separately from dump rotation, at least as long as the oldest retained
dump. The existing retention job preserves benchmark tombstones; do not remove
those records while older recoverable dumps can still contain their payloads.
Nothing expires these backup files for you.

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
3. Apply the newest available deletion ledger, not necessarily the one exported
   with the dump. Re-delete each entry that exists and is not already deleted in
   the restored copy; skip entries absent from that copy.
   ```sh
   npx tsx scripts/moderate.ts delete <submission-id> --reason "post-restore ledger"
   ```
4. Reconcile hide/unhide changes using the latest trustworthy moderation state,
   separately from the deletion ledger. Keep the restored copy private if that
   state cannot be established. Then verify: `npm run config:check` against the
   new environment, `GET /v1/readiness`, spot-check public list/detail/rows,
   confirm hidden and deleted records stay hidden, and run `npm test`.
5. Point production at the verified copy, then reopen publicly.

Never reopen a restored copy publicly before steps 2–4: a stale backup
resurrects deleted and moderated content, and a restored database has none of
the least-privilege grants until migrations run again.

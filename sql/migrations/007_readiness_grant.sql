-- Readiness grant. The public web function needs to prove, without elevated
-- credentials, that it is talking to a database whose `bench` schema exists and
-- whose migrations have been applied. Reading the migration ledger is the only
-- honest way to answer that, so the runtime role gets SELECT on it and nothing
-- else: the ledger holds filenames and checksums that are already in the
-- repository, no data and no credentials.
--
-- Additive and idempotent; existing migrations keep their recorded checksums.

grant select on bench.schema_migrations to aiolm_web_runtime;

import postgres from "postgres";

/**
 * Module-global Postgres.js client: max:1, prepare:false (required by the
 * Supabase transaction pooler), verified TLS to every remote server,
 * DB + functions in the same region.
 *
 * TLS is decided by the TARGET, not by NODE_ENV. The managed database requires
 * TLS on every connection, including the operator commands (`npm run db:migrate`,
 * `npm run moderate`) that are run from a workstation or CI where NODE_ENV is
 * not "production": deciding on NODE_ENV alone made those commands offer a
 * plaintext connection the server refuses. Only a non-production loopback
 * target - a local development database or an isolated synthetic test cluster,
 * neither of which terminates TLS - connects without it. Production always
 * verifies, whatever the host.
 *
 * postgres.js lets an explicit `ssl` option win over any `sslmode` in the
 * connection string, so these rules cannot be weakened by the URL.
 */

function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

let client: postgres.Sql | null = null;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** True for a local target that terminates no TLS (dev database, test cluster). */
function isLoopbackTarget(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    // An unparseable URL is not demonstrably local, so it gets verified TLS.
    return false;
  }
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

export function sslOptionsFor(url: string): false | { rejectUnauthorized: boolean; ca?: string } {
  if (!isProduction() && isLoopbackTarget(url)) return false;
  const ca = process.env["DATABASE_CA_CERT"];
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

function clientOptions(url: string): postgres.Options<Record<string, postgres.PostgresType>> {
  return {
    max: 1,
    prepare: false,
    ssl: sslOptionsFor(url),
    connect_timeout: 10,
    idle_timeout: 20,
  };
}

export function getDb(): postgres.Sql {
  if (client) return client;
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not configured. Publishing is disabled until it is set.");
  client = postgres(url, clientOptions(url));
  return client;
}

/**
 * Reserved single-connection client for migrations (max:1), so the
 * transaction-scoped advisory lock in applyMigrations shares one session.
 * Production requires an explicit migration-owner URL: falling back to the
 * least-privilege runtime URL there would fail closed on missing grants
 * instead of silently running DDL as the wrong role.
 */
export function getMigrationDb(): postgres.Sql {
  const url = process.env["DATABASE_MIGRATION_URL"];
  if (!url) {
    if (isProduction()) throw new Error("DATABASE_MIGRATION_URL is not configured.");
    const fallback = process.env["DATABASE_URL"];
    if (!fallback) throw new Error("DATABASE_MIGRATION_URL is not configured.");
    return postgres(fallback, clientOptions(fallback));
  }
  return postgres(url, clientOptions(url));
}

/**
 * Moderation-role client. Production requires the explicit moderation URL;
 * local/test environments may fall back to DATABASE_URL.
 */
export function getModerationDb(): postgres.Sql {
  const url = process.env["DATABASE_MODERATION_URL"];
  if (!url) {
    if (isProduction()) throw new Error("DATABASE_MODERATION_URL is not configured.");
    const fallback = process.env["DATABASE_URL"];
    if (!fallback) throw new Error("DATABASE_MODERATION_URL is not configured.");
    return postgres(fallback, clientOptions(fallback));
  }
  return postgres(url, clientOptions(url));
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
  }
}

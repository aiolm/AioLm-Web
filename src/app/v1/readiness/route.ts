import { checkProductionConfig } from "@/lib/config-check";
import { serviceError } from "@/lib/errors";
import { isProduction } from "@/lib/env";
import { READINESS_PROBE_TIMEOUT_MS, REQUIRED_MIGRATIONS } from "@/server/repository";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/**
 * GET /v1/readiness — deployment validation for an anonymous caller.
 *
 * The answer is earned, never assumed. 200 requires both of:
 *
 * 1. The production configuration validates. This is checked FIRST and returns
 *    on its own: a deployment missing its capacity guard or its Turnstile keys
 *    is not ready whatever the database says, and probing anyway would spend a
 *    pooled connection to learn nothing.
 * 2. A real ledger read, bounded inside PostgreSQL, shows that EVERY migration
 *    in REQUIRED_MIGRATIONS has been applied. A count would have accepted a
 *    database carrying the wrong seven files, or carrying 001-006 without the
 *    runtime SELECT grant this probe itself depends on.
 *
 * Anything else is 503. There is no way to report ready without a working,
 * fully migrated database.
 *
 * The response is deliberately shapeless: `{status}` and nothing more. Which
 * check failed, which variable is missing, which migration is absent, and how
 * the database answered are all operator information, available from
 * `npm run config:check` and the platform logs, and are never disclosed to an
 * unauthenticated caller.
 */
export async function GET(): Promise<Response> {
  // Outside production the config rules do not apply (no HTTPS origin, no
  // provisioned capacity), so readiness reduces to the database probe.
  if (isProduction() && !checkProductionConfig({ scope: "runtime" }).ok) {
    return notReady();
  }

  let applied: Set<string>;
  try {
    applied = new Set(await getStore().appliedMigrations(READINESS_PROBE_TIMEOUT_MS));
  } catch {
    return notReady();
  }
  if (!REQUIRED_MIGRATIONS.every((filename) => applied.has(filename))) {
    return notReady();
  }
  return Response.json({ status: "ready" }, { headers: { "cache-control": "no-store" } });
}

function notReady(): Response {
  return serviceError(503, "service_unavailable", "Service is not ready.", 30);
}

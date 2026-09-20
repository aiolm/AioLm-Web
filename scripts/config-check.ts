import { checkProductionConfig, type ConfigScope } from "../src/lib/config-check";

/**
 * Operator-only production configuration report.
 *
 * `GET /v1/readiness` answers an anonymous caller with a bare ready/not-ready.
 * This is where the detail lives: run it in the operator shell with the
 * approved values loaded from the secret store that holds them, to see exactly
 * which variable is wrong. A production value cannot be pulled back out of
 * Vercel - it is stored as a Secret, and `vercel env pull` / `vercel env run`
 * only return values the platform may still decrypt (docs/deployment.md). This
 * reads configuration only - no database connection, no network call - so
 * nothing leaves the shell it runs in.
 *
 *   npm run config:check              # web-runtime scope (default)
 *   npm run config:check -- --operator  # allow the elevated database URLs
 *
 * Exits 1 when any check failed. Warnings are printed but do not fail the run.
 * Configured secret values are never printed.
 */
function main(): void {
  const args = process.argv.slice(2);
  const scope: ConfigScope = args.includes("--operator") ? "operator" : "runtime";
  const report = checkProductionConfig({ scope });

  const width = Math.max(...report.checks.map((c) => c.name.length));
  for (const check of report.checks) {
    const mark = check.status === "ok" ? "ok  " : check.status === "warning" ? "warn" : "FAIL";
    console.log(`${mark}  ${check.name.padEnd(width)}  ${check.detail}`);
  }
  console.log(
    `\n${scope} scope: ${report.checks.length} checks, ${report.failed} failed, ${report.warnings} warnings`,
  );
  if (!report.ok) {
    console.error("\nProduction configuration is incomplete. Fix the FAIL lines before deploying.");
    process.exit(1);
  }
}

main();

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationSha256, normalizeMigrationSql } from "@/server/migrations";
import { REQUIRED_MIGRATIONS } from "@/server/repository";

/**
 * REQUIRED_MIGRATIONS is what `GET /v1/readiness` demands before it reports a
 * deployment ready. It is a literal list because nothing can enumerate
 * sql/migrations/ at runtime - a serverless bundle is not a checkout - and a
 * hand-kept list is only trustworthy while something keeps it honest.
 *
 * That is this file. Adding a migration without adding it here fails the suite,
 * with the difference named, rather than shipping a readiness probe that would
 * report ready against a database missing the new file.
 */

const MIGRATIONS_DIR = join(process.cwd(), "sql", "migrations");

function migrationFilesOnDisk(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

describe("required migration manifest", () => {
  it("lists exactly the migrations in sql/migrations/", () => {
    expect([...REQUIRED_MIGRATIONS]).toEqual(migrationFilesOnDisk());
  });
});

describe("migration checksum normalization", () => {
  it("normalizes CRLF line endings to LF without changing LF text", () => {
    expect(normalizeMigrationSql("select 1;\r\nselect 2;\r\n")).toBe("select 1;\nselect 2;\n");
    expect(normalizeMigrationSql("select 1;\nselect 2;\n")).toBe("select 1;\nselect 2;\n");
  });

  it("computes identical SHA-256 digests for CRLF and LF SQL variants", () => {
    const lfSql = "create table bench.example (\n  id int primary key\n);\n";
    const crlfSql = lfSql.replace(/\n/g, "\r\n");

    expect(migrationSha256(crlfSql)).toBe(migrationSha256(lfSql));
    expect(migrationSha256(`${lfSql}-- extra\n`)).not.toBe(migrationSha256(lfSql));
  });
});

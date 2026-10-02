import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * The Markdown stack (react-markdown, remark-gfm, rehype-sanitize) is the
 * largest client dependency. A page that renders no description must not reach
 * it through a shared helper module, or every visitor downloads it anyway.
 * This walks the static, value-level import graph of each page module.
 */
const root = resolve(__dirname, "../..");
const MARKDOWN_PACKAGES = ["react-markdown", "remark-gfm", "rehype-sanitize"];
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/g;

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? join(root, "src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

function reachablePackages(entry: string): Set<string> {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const pending = [join(root, entry)];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const local = resolveLocal(file, specifier);
      if (local) pending.push(local);
      else if (!specifier.startsWith(".") && !specifier.startsWith("@/")) packages.add(specifier);
    }
  }
  return packages;
}

describe("client bundle boundaries", () => {
  it.each([
    "src/app/[locale]/benchmarks/page.tsx",
    "src/app/[locale]/verify/[sessionId]/page.tsx",
    "src/app/[locale]/page.tsx",
  ])("%s does not reach the Markdown renderer", (entry) => {
    const reached = reachablePackages(entry);
    expect(MARKDOWN_PACKAGES.filter((name) => reached.has(name))).toEqual([]);
  });

  it.each([
    "src/app/[locale]/benchmarks/[id]/page.tsx",
    "src/app/[locale]/manage/page.tsx",
  ])("%s still renders descriptions with it", (entry) => {
    expect(reachablePackages(entry).has("react-markdown")).toBe(true);
  });
});

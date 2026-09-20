import { PostgresBenchmarkStore } from "./postgres-store";
import type { BenchmarkStore } from "./repository";

/** Test override hook: unit tests inject InMemoryBenchmarkStore via __setTestStore. */
let testStore: BenchmarkStore | null = null;

/**
 * Nothing in the application calls this, but it is exported from a module the
 * server bundle contains, and an in-memory store in production would silently
 * serve and discard real submissions. Refusing it here makes that structural
 * instead of a property of the current call graph.
 */
export function __setTestStore(store: BenchmarkStore | null): void {
  if (store !== null && process.env["NODE_ENV"] === "production") {
    throw new Error("The in-memory test store cannot be installed in production.");
  }
  testStore = store;
}

let prodStore: PostgresBenchmarkStore | null = null;

export function getStore(): BenchmarkStore {
  if (testStore) return testStore;
  if (!prodStore) prodStore = new PostgresBenchmarkStore();
  return prodStore;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function optionalEnv(name: string): string | null {
  return process.env[name] ?? null;
}

import { createHash } from "node:crypto";
import { DiscoveryQueryError, type BenchmarkFilters, type BenchmarkSort } from "./benchmark-discovery";
/** Keyset pagination helpers. Lists use opaque cursors; rows page in chunks of 1000. */

export const LIST_DEFAULT_LIMIT = 25;
export const LIST_MAX_LIMIT = 100;
export const ROWS_PAGE_SIZE = 1000;
export const ROWS_MAX_TOTAL = 10000;

export function clampListLimit(raw: string | null): number {
  const n = raw === null ? LIST_DEFAULT_LIMIT : Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(n) || n <= 0) return LIST_DEFAULT_LIMIT;
  return Math.min(n, LIST_MAX_LIMIT);
}

/** Cursor is base64url(JSON {created_at, public_id}). Opaque to clients. */
export function encodeCursor(createdAtIso: string, publicId: string): string {
  return Buffer.from(JSON.stringify({ c: createdAtIso, p: publicId }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | null): { createdAt: string; publicId: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { c?: unknown; p?: unknown };
    if (typeof parsed.c !== "string" || typeof parsed.p !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.c))) return null;
    return { createdAt: parsed.c, publicId: parsed.p };
  } catch {
    return null;
  }
}

export function encodeRowsCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

export function decodeRowsCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    if (typeof parsed.o !== "number" || !Number.isSafeInteger(parsed.o) || parsed.o < 0) return 0;
    return Math.min(parsed.o, ROWS_MAX_TOTAL);
  } catch {
    return 0;
  }
}

/** Discovery cursors bind all normalized filters and sorting to their position. */
export interface ListCursor { createdAt: string; publicId: string; value?: number | null }
export function discoveryBinding(filters: BenchmarkFilters): string {
  const normalized = Object.entries(filters).filter(([key]) => key !== "sort").sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify([filters.sort ?? "newest", normalized])).digest("hex");
}
export function encodeDiscoveryCursor(createdAt: string, publicId: string, filters: BenchmarkFilters, value: number | null): string {
  return Buffer.from(JSON.stringify({ c: createdAt, p: publicId, v: value, b: discoveryBinding(filters) })).toString("base64url");
}
export function decodeDiscoveryCursor(raw: string | null, filters: BenchmarkFilters): ListCursor | null {
  if (!raw) return null;
  if (raw.length > 2048) throw new DiscoveryQueryError("Invalid cursor.");
  const base = decodeCursor(raw);
  if (!base || !base.publicId || base.publicId.length > 200) throw new DiscoveryQueryError("Invalid cursor.");
  let parsed: { b?: unknown; v?: unknown };
  try { parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); } catch { throw new DiscoveryQueryError("Invalid cursor."); }
  if (parsed.b === undefined && Object.keys(filters).length === 0) return base;
  if (parsed.b !== discoveryBinding(filters) || !(parsed.v === null || (typeof parsed.v === "number" && Number.isFinite(parsed.v)))) throw new DiscoveryQueryError("Cursor does not match this query.");
  return { ...base, value: parsed.v as number | null };
}
export function comparePosition(a: ListCursor, b: ListCursor, sort: BenchmarkSort): number {
  if (sort !== "newest" && sort !== "oldest") {
    const av = a.value ?? null, bv = b.value ?? null;
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    if (av !== null && bv !== null && av !== bv) return (av < bv ? -1 : 1) * (sort.endsWith("desc") ? -1 : 1);
  }
  const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  const id = a.publicId < b.publicId ? -1 : a.publicId > b.publicId ? 1 : 0;
  return (time || id) * (sort === "oldest" ? 1 : -1);
}

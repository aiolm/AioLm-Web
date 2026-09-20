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

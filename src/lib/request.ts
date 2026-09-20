/** Bounded ingress: streaming raw-byte reader with a hard cap, fatal UTF-8 decode,
 * and exact raw-byte SHA-256. Never trust Content-Length alone; bodies larger
 * than the cap are rejected (413) without being buffered. */

export class BoundedBodyError extends Error {
  readonly status = 413;
  constructor(message = "Request body is too large.") {
    super(message);
  }
}

export async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isSafeInteger(n) && n > maxBytes) throw new BoundedBodyError();
  }
  const body = request.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BoundedBodyError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function decodeUtf8Fatal(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Request body is not valid UTF-8.");
  }
}

/** Read a bounded JSON body, preserving the exact raw text for byte hashing. */
export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<{ raw: string; bytes: Uint8Array; parsed: unknown }> {
  const bytes = await readBoundedBytes(request, maxBytes);
  const raw = decodeUtf8Fatal(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body.");
  }
  return { raw, bytes, parsed };
}

/** Small JSON ingress cap for auth/session/report/management bodies. */
export const SMALL_JSON_MAX_BYTES = 16 * 1024;

/** Publication ingress cap: 4MiB, rejected (never truncated) when exceeded. */
export const PUBLICATION_MAX_BYTES = 4 * 1024 * 1024;

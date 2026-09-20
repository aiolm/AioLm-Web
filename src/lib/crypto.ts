import { createHash, timingSafeEqual, randomBytes } from "node:crypto";

/** SHA-256 hex digest. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** SHA-256 of UTF-8 string, hex. */
export function sha256HexUtf8(value: string): string {
  return sha256Hex(new TextEncoder().encode(value));
}

/** Constant-time string comparison for hashes/tokens. Returns false on length mismatch. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Random 32 bytes encoded base64url (no padding). Owner secrets and CSRF tokens use this shape. */
export function randomBase64Url32(): string {
  return base64UrlEncode(randomBytes(32));
}

export function base64UrlEncode(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i]!;
    const second = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const third = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (first << 16) | (second << 8) | third;
    output += alphabet[(triple >> 18) & 63]! + alphabet[(triple >> 12) & 63]!;
    if (i + 1 < bytes.length) output += alphabet[(triple >> 6) & 63]!;
    if (i + 2 < bytes.length) output += alphabet[triple & 63]!;
  }
  return output;
}

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export function base64UrlDecode(value: string): Uint8Array {
  if (!BASE64URL_RE.test(value) || value.length === 0 || value.length % 4 === 1) {
    throw new Error("Invalid base64url encoding.");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const indices = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i += 1) indices.set(alphabet[i]!, i);
  const output: number[] = [];
  for (let i = 0; i < value.length; i += 4) {
    const chunk = value.slice(i, i + 4);
    const a = indices.get(chunk[0]!);
    const b = indices.get(chunk[1]!);
    const c = chunk.length > 2 ? indices.get(chunk[2]!) : 0;
    const d = chunk.length > 3 ? indices.get(chunk[3]!) : 0;
    if (a === undefined || b === undefined || (chunk.length > 2 && c === undefined) || (chunk.length > 3 && d === undefined)) {
      throw new Error("Invalid base64url encoding.");
    }
    const triple = (a << 18) | (b << 12) | ((c ?? 0) << 6) | (d ?? 0);
    output.push((triple >> 16) & 255);
    if (chunk.length > 2) output.push((triple >> 8) & 255);
    if (chunk.length > 3) output.push(triple & 255);
  }
  const bytes = new Uint8Array(output);
  if (base64UrlEncode(bytes) !== value) throw new Error("Invalid base64url encoding.");
  return bytes;
}

/** Assert a 32-byte base64url secret shape without logging the value. */
export function assertBase64Url32(value: unknown): string {
  if (typeof value !== "string" || !BASE64URL_RE.test(value)) throw new Error("Invalid secret format.");
  const bytes = base64UrlDecode(value);
  if (bytes.length !== 32) throw new Error("Invalid secret length.");
  return value;
}

export const UUID_V4_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function assertUuidV4(value: unknown): string {
  if (typeof value !== "string" || !UUID_V4_RE.test(value)) throw new Error("Invalid submission id.");
  return value;
}

/** Short public id: `b` + 11 lowercase alphanumerics (no look-alike confusion handling needed server-side; uniqueness enforced by DB). */
export function randomPublicId(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(11);
  let out = "b";
  for (const byte of bytes) out += alphabet[byte % alphabet.length]!;
  return out;
}

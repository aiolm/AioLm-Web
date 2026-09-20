/** Structured request logs: codes/latencies/byte counts. No bodies/tokens/recovery keys. */

export interface RequestLog {
  route: string;
  method: string;
  status: number;
  code?: string;
  ms: number;
  bytesIn: number;
  bytesOut?: number;
  ipHashed?: boolean;
}

export function logRequest(entry: RequestLog): void {
  // JSON line to stdout; the hosting provider collects it. Never log secrets.
  console.log(JSON.stringify({ type: "http", ...entry }));
}

/** Capacity alert at 70% of provisioned storage (stop at 80% happens in acceptance). */
export function logCapacityWarn(detail: string): void {
  console.log(JSON.stringify({ type: "capacity_warn", level: "warn", message: "Storage above 70% of provisioned capacity.", detail }));
}

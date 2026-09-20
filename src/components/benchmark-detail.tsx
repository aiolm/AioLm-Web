"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SafeMarkdown, isAbortError, useJsonFetch } from "@/components/ui";
import { ReportForm } from "@/components/report-form";

interface Detail {
  id: string;
  submission_id: string;
  benchmark: {
    model: unknown; runtime: unknown; workload: unknown; environment: unknown;
    execution: unknown; method: unknown; app_version: unknown; status: unknown;
  };
  summary: {
    model_label: string; hardware_label: string; method_label: string; workload_label: string;
    row_count: number; failed_rows: number; mean_tg_tps: number | null; mean_e2e_ms: number | null; status: string;
  };
  description_md: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

/** Visible measurement page stays small so large result sets never flood the DOM. */
export const ROWS_VISIBLE_PAGE_SIZE = 50;

export function getRowsPageCount(loadedCount: number, pageSize: number = ROWS_VISIBLE_PAGE_SIZE): number {
  if (loadedCount <= 0) return 0;
  return Math.ceil(loadedCount / pageSize);
}

export function getRowsSliceIndices(page: number, pageSize: number, loadedCount: number): { start: number; end: number } {
  const safePage = Number.isSafeInteger(page) && page >= 0 ? page : 0;
  const start = Math.min(safePage * pageSize, loadedCount);
  const end = Math.min(start + pageSize, loadedCount);
  return { start, end };
}

/** Display helper: explicit Unknown instead of blank or machine defaults. */
export function displayText(value: unknown): string {
  if (value === null || value === undefined) return "Unknown";
  if (typeof value === "string") return value.trim() === "" ? "Unknown" : value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Unknown";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function joinList(values: unknown): string {
  if (!Array.isArray(values)) return "Unknown";
  if (values.length === 0) return "None reported";
  return values.map((v) => displayText(v)).join(", ");
}

function formatGpuList(value: unknown): string {
  if (!Array.isArray(value)) return "Unknown";
  if (value.length === 0) return "None reported";
  return value
    .map((g) => {
      const r = asRecord(g);
      if (!r) return "Unknown";
      const name = typeof r["name"] === "string" && (r["name"] as string).trim() ? (r["name"] as string) : null;
      const vendor = typeof r["vendor"] === "string" && (r["vendor"] as string).trim() ? (r["vendor"] as string) : null;
      return name ?? vendor ?? "Unknown";
    })
    .join(" + ");
}

function friendlyRowsError(): string {
  return "Could not load measurements. Check your connection and try again.";
}

/** Generation guard: a rows response only applies to the request generation that started it. */
export function isStaleRowsGeneration(requestGeneration: number, currentGeneration: number): boolean {
  return requestGeneration !== currentGeneration;
}

/** Central stale check for rows fetch continuations (unmount + result change + abort). */
export function canApplyRowsResult(opts: {
  mounted: boolean;
  requestGeneration: number;
  currentGeneration: number;
  aborted: boolean;
}): boolean {
  if (!opts.mounted) return false;
  if (opts.aborted) return false;
  return opts.requestGeneration === opts.currentGeneration;
}

export function BenchmarkDetail({ publicId }: { publicId: string }): React.JSX.Element {
  const { data, error } = useJsonFetch<Detail>(`/v1/benchmark-runs/${publicId}`);
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [rowsCursor, setRowsCursor] = useState<string | null>(null);
  const [rowsTotal, setRowsTotal] = useState<number | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [visiblePage, setVisiblePage] = useState(0);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const rowsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        rowsAbortRef.current?.abort();
      } catch {
        // Abort on unmount is best-effort.
      }
    };
  }, []);

  // A different result invalidates any in-flight rows request and starts with an empty row cache.
  useEffect(() => {
    generationRef.current += 1;
    try {
      rowsAbortRef.current?.abort();
    } catch {
      // Aborting the previous result fetch is best-effort.
    }
    rowsAbortRef.current = null;
    setRows(null);
    setRowsCursor(null);
    setRowsTotal(null);
    setRowsError(null);
    setRowsLoading(false);
    setVisiblePage(0);
    loadingRef.current = false;
  }, [publicId]);

  const loadRows = useCallback(
    async (cursor: string | null): Promise<void> => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const myGeneration = generationRef.current;
      const controller = new AbortController();
      rowsAbortRef.current = controller;
      if (mountedRef.current && !isStaleRowsGeneration(myGeneration, generationRef.current)) {
        setRowsLoading(true);
        setRowsError(null);
      }
      try {
        const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
        const res = await fetch(`/v1/benchmark-runs/${publicId}/measurements${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(friendlyRowsError());
        const json = (await res.json()) as { rows: unknown[]; next_cursor: string | null; total: number };
        if (!canApplyRowsResult({
          mounted: mountedRef.current,
          requestGeneration: myGeneration,
          currentGeneration: generationRef.current,
          aborted: controller.signal.aborted,
        })) return;
        setRows((prev) => {
          const next = cursor && prev ? [...prev, ...json.rows] : json.rows;
          return next.slice(0, 10000);
        });
        setRowsCursor(json.next_cursor);
        setRowsTotal(json.total);
      } catch (err: unknown) {
        if (isAbortError(err) || controller.signal.aborted) return;
        if (!canApplyRowsResult({
          mounted: mountedRef.current,
          requestGeneration: myGeneration,
          currentGeneration: generationRef.current,
          aborted: false,
        })) return;
        // Prior rows are preserved; only the error is surfaced with a retry.
        setRowsError(friendlyRowsError());
      } finally {
        if (rowsAbortRef.current === controller) rowsAbortRef.current = null;
        // A stale (previous result) completion must not clear the new request loading flag.
        if (isStaleRowsGeneration(myGeneration, generationRef.current)) return;
        loadingRef.current = false;
        if (mountedRef.current) setRowsLoading(false);
      }
    },
    [publicId],
  );

  if (error) return <div className="alert error" role="alert"><p><strong>Not available.</strong> {error}</p></div>;
  if (!data) return <p role="status" className="muted">Loading benchmark…</p>;

  const loadedCount = rows?.length ?? 0;
  const pageCount = getRowsPageCount(loadedCount);
  const clampedPage = pageCount === 0 ? 0 : Math.min(visiblePage, pageCount - 1);
  const { start, end } = getRowsSliceIndices(clampedPage, ROWS_VISIBLE_PAGE_SIZE, loadedCount);
  const retryCursor = rows === null ? null : rowsCursor;

  return (
    <div className="grid">
      <section className="card" aria-labelledby="detail-title">
        <h1 id="detail-title">{data.summary.workload_label} · {data.summary.model_label}</h1>
        <p>
          <span className="status ok">{String(data.summary.status)}</span>{" "}
          <span className="muted">rev {data.revision} · updated {new Date(data.updated_at).toLocaleString()}</span>
        </p>
        <dl className="kv">
          <dt>Hardware</dt><dd>{data.summary.hardware_label}</dd>
          <dt>Method</dt><dd>{data.summary.method_label}</dd>
          <dt>Rows</dt><dd>{data.summary.row_count} ({data.summary.failed_rows} failed)</dd>
          <dt>Mean TG tps</dt><dd>{data.summary.mean_tg_tps?.toFixed(2) ?? "—"}</dd>
          <dt>Mean E2E ms</dt><dd>{data.summary.mean_e2e_ms?.toFixed(1) ?? "—"}</dd>
        </dl>
      </section>

      <EnvironmentSection benchmark={data.benchmark} />

      <section className="card" aria-labelledby="desc-title">
        <h2 id="desc-title">Description</h2>
        {data.description_md ? <SafeMarkdown text={data.description_md} /> : <p className="muted">No description provided.</p>}
      </section>

      <section className="card" aria-labelledby="rows-title">
        <h2 id="rows-title">Measurements {rowsTotal !== null ? `(${rowsTotal})` : null}</h2>
        <p className="muted">Rows load in chunks of 1000, up to 10000 total. Only one page is shown at a time.</p>
        {!rows && !rowsLoading ? <button type="button" onClick={() => void loadRows(null)}>Load measurements</button> : null}
        {rowsLoading ? <p role="status" className="muted">Loading measurements…</p> : null}
        {rowsError ? (
          <div className="alert error" role="alert">
            <p>{rowsError}</p>
            <p>
              <button type="button" onClick={() => void loadRows(retryCursor)} disabled={rowsLoading}>
                Retry loading measurements
              </button>
            </p>
          </div>
        ) : null}
        {rows ? (
          <RowsPreview
            rows={rows}
            start={start}
            end={end}
            page={clampedPage}
            pageCount={pageCount}
            onPage={setVisiblePage}
          />
        ) : null}
        {rows && rowsCursor && !rowsError ? (
          <p>
            <button type="button" onClick={() => void loadRows(rowsCursor)} disabled={rowsLoading}>
              {rowsLoading ? "Loading…" : "Load more"}
            </button>
          </p>
        ) : null}
      </section>

      <ReportForm publicId={publicId} />
    </div>
  );
}

function EnvironmentSection({ benchmark }: { benchmark: Detail["benchmark"] }): React.JSX.Element {
  const model = asRecord(benchmark.model);
  const runtime = asRecord(benchmark.runtime);
  const method = asRecord(benchmark.method);
  const workload = asRecord(benchmark.workload);
  const environment = asRecord(benchmark.environment);
  const execution = asRecord(benchmark.execution);
  const envExecution = asRecord(environment?.["execution"]);
  const cpu = asRecord(environment?.["cpu"]);
  const settings = asRecord(execution?.["settings"]);

  const methodText = method
    ? `${displayText(method["id"])} · version ${displayText(method["version"])}`
    : "Unknown";
  const workloadLengths = Array.isArray(workload?.["prompt_lengths"])
    ? joinList(workload?.["prompt_lengths"])
    : "Unknown";
  const batchSizes = Array.isArray(workload?.["batch_sizes"]) ? joinList(workload?.["batch_sizes"]) : "Unknown";

  return (
    <section className="card" aria-labelledby="env-title">
      <h2 id="env-title">Test setup (as reported)</h2>
      <p className="muted">These values were sent with the publication and are shown as reported. They are not independently verified.</p>
      <dl className="kv">
        <dt>App version</dt><dd>{displayText(benchmark.app_version)}</dd>
        <dt>Result status</dt><dd>{displayText(benchmark.status)}</dd>
        <dt>Model identity</dt><dd>{model ? displayText(model["status"]) : "Unknown"}</dd>
        <dt>Model checksum</dt><dd>{model ? displayText(model["sha256"]) : "Unknown"}</dd>
        <dt>Model size (bytes)</dt><dd>{model ? displayText(model["size_bytes"]) : "Unknown"}</dd>
        <dt>Runtime</dt>
        <dd>
          {runtime
            ? `${displayText(runtime["name"])} ${displayText(runtime["version"])} · ${displayText(runtime["backend"])}${typeof runtime["build"] === "string" && (runtime["build"] as string).trim() ? ` (${runtime["build"] as string})` : ""}`
            : "Unknown"}
        </dd>
        <dt>Method</dt><dd>{methodText}</dd>
        <dt>Workload</dt><dd>{workload ? displayText(workload["corpus"]) : "Unknown"}</dd>
        <dt>Prompt lengths</dt><dd>{workloadLengths}</dd>
        <dt>Generation length</dt><dd>{workload ? displayText(workload["generation_length"]) : "Unknown"}</dd>
        <dt>Batch sizes</dt><dd>{batchSizes}</dd>
        <dt>Repetitions</dt><dd>{workload ? displayText(workload["repetitions"]) : "Unknown"}</dd>
        <dt>Warmup</dt><dd>{workload ? displayText(workload["warmup"]) : "Unknown"}</dd>
        <dt>Operating system</dt><dd>{environment ? displayText(environment["os"]) : "Unknown"}</dd>
        <dt>Architecture</dt><dd>{environment ? displayText(environment["arch"]) : "Unknown"}</dd>
        <dt>CPU</dt><dd>{cpu ? displayText(cpu["name"]) : "Unknown"}</dd>
        <dt>CPU cores</dt><dd>{cpu ? displayText(cpu["logical_cores"]) : "Unknown"}</dd>
        <dt>Installed graphics</dt><dd>{environment ? formatGpuList(environment["installed_gpus"]) : "Unknown"}</dd>
        <dt>Run mode</dt><dd>{envExecution ? displayText(envExecution["mode"]) : "Unknown"}</dd>
        <dt>Selected graphics</dt><dd>{envExecution ? formatGpuList(envExecution["selected_gpus"]) : "Unknown"}</dd>
        <dt>Context size</dt><dd>{execution ? displayText(execution["context_size"]) : "Unknown"}</dd>
        <dt>Parallel</dt><dd>{execution ? displayText(execution["parallel"]) : "Unknown"}</dd>
        <dt>Threads</dt><dd>{settings ? displayText(settings["threads"]) : "Unknown"}</dd>
        <dt>Graphics layers</dt><dd>{settings ? displayText(settings["gpu_layers"]) : "Unknown"}</dd>
      </dl>
    </section>
  );
}

function RowsPreview({
  rows,
  start,
  end,
  page,
  pageCount,
  onPage,
}: {
  rows: unknown[];
  start: number;
  end: number;
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}): React.JSX.Element {
  const visible = rows.slice(start, end) as Array<Record<string, unknown>>;
  if (rows.length === 0) return <p className="muted">No rows.</p>;
  if (visible.length === 0) return <p className="muted">No rows on this page.</p>;
  const columns = Object.keys(visible[0] ?? {});
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table className="data">
          <thead><tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={start + i}>{columns.map((c) => <td key={c}>{String(row[c] ?? "—")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" role="status">
        Showing {rows.length === 0 ? 0 : start + 1}–{end} of {rows.length} loaded rows · Page {pageCount === 0 ? 0 : page + 1} of {pageCount}.
      </p>
      {pageCount > 1 ? (
        <nav aria-label="Loaded measurement pages">
          <button type="button" onClick={() => onPage(Math.max(0, page - 1))} disabled={page <= 0}>
            Previous rows
          </button>{" "}
          <button type="button" onClick={() => onPage(Math.min(pageCount - 1, page + 1))} disabled={page + 1 >= pageCount}>
            Next rows
          </button>
        </nav>
      ) : null}
    </div>
  );
}

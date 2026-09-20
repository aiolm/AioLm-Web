"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState, ErrorState, Loading, useJsonFetch } from "./ui";

interface ListItem {
  public_id: string;
  submission_id: string;
  summary: {
    model_label: string; hardware_label: string; method_label: string; workload_label: string;
    row_count: number; mean_tg_tps: number | null; mean_e2e_ms: number | null; status: string;
  };
  description_md: string;
  revision: number;
  created_at: string;
}

interface ListResponse {
  items: ListItem[];
  next_cursor: string | null;
}

/** Bounded keyset history so back/next state stays small and predictable. */
export const BROWSER_HISTORY_LIMIT = 20;

export function pushBrowserHistory(history: string[], currentCursor: string | null): string[] {
  const next = [...history, currentCursor ?? ""];
  return next.length > BROWSER_HISTORY_LIMIT ? next.slice(next.length - BROWSER_HISTORY_LIMIT) : next;
}

export function popBrowserHistory(history: string[]): { previous: string | null; rest: string[] } {
  const prev = history.length > 0 ? (history[history.length - 1] ?? null) : null;
  return { previous: prev === "" ? null : prev, rest: history.slice(0, -1) };
}

export interface BrowserFilters {
  model: string;
  hardware: string;
  method: string;
  workload: string;
}

export function normalizeBrowserFilters(filters: BrowserFilters): BrowserFilters {
  return {
    model: filters.model.trim(),
    hardware: filters.hardware.trim(),
    method: filters.method.trim(),
    workload: filters.workload.trim(),
  };
}

export function sameBrowserFilters(a: BrowserFilters, b: BrowserFilters): boolean {
  return a.model === b.model && a.hardware === b.hardware && a.method === b.method && a.workload === b.workload;
}

export function BenchmarkBrowser(): React.JSX.Element {
  const [draft, setDraft] = useState<BrowserFilters>({ model: "", hardware: "", method: "", workload: "" });
  const [applied, setApplied] = useState<BrowserFilters>({ model: "", hardware: "", method: "", workload: "" });
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "25" });
    for (const [k, v] of Object.entries(applied)) if (v.trim()) params.set(k, v.trim());
    if (cursor) params.set("cursor", cursor);
    return `/v1/benchmark-runs?${params.toString()}`;
  }, [applied, cursor]);
  const { data, error, reload } = useJsonFetch<ListResponse>(query);

  const applyFilters = (e: React.FormEvent): void => {
    e.preventDefault();
    const next = normalizeBrowserFilters(draft);
    setDraft(next);
    if (!sameBrowserFilters(next, applied)) {
      // New filter set starts from the first page.
      setApplied(next);
      setCursor(null);
      setHistory([]);
    } else {
      reload();
    }
  };

  const goNext = (): void => {
    if (!data?.next_cursor) return;
    setHistory((h) => pushBrowserHistory(h, cursor));
    setCursor(data.next_cursor);
  };

  const goPrevious = (): void => {
    if (history.length === 0) return;
    const { previous, rest } = popBrowserHistory(history);
    setHistory(rest);
    setCursor(previous);
  };

  const canPage = data !== null && (data.next_cursor !== null || history.length > 0);

  return (
    <div className="grid">
      <form
        className="filters"
        method="GET"
        action="/"
        onSubmit={applyFilters}
      >
        <fieldset>
          <legend>Filter results (no combined leaderboard)</legend>
          <div className="grid two">
            <div className="field">
              <label htmlFor="f-model">Model</label>
              <input id="f-model" name="model" type="search" autoComplete="off" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-hardware">Hardware</label>
              <input id="f-hardware" name="hardware" type="search" autoComplete="off" value={draft.hardware} onChange={(e) => setDraft({ ...draft, hardware: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-method">Method</label>
              <input id="f-method" name="method" type="search" autoComplete="off" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="f-workload">Workload</label>
              <input id="f-workload" name="workload" type="search" autoComplete="off" value={draft.workload} onChange={(e) => setDraft({ ...draft, workload: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="primary">Apply filters</button>
        </fieldset>
      </form>

      {!data && !error ? <Loading label="Loading benchmarks…" /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="No benchmarks yet." hint="Results published from the app appear here. Self-reported data only; compare configurations carefully." />
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="grid" role="list" aria-label="Benchmark results">
          {data.items.map((item) => (
            <article key={item.public_id} className="card" role="listitem">
              <h2 style={{ marginTop: 0 }}>
                <Link href={`/benchmarks/${item.public_id}`}>{item.summary.workload_label} · {item.summary.model_label}</Link>
              </h2>
              <dl className="kv">
                <dt>Hardware</dt><dd>{item.summary.hardware_label}</dd>
                <dt>Method</dt><dd>{item.summary.method_label}</dd>
                <dt>Rows</dt><dd>{item.summary.row_count}</dd>
                <dt>Mean TG tps</dt><dd>{item.summary.mean_tg_tps?.toFixed(1) ?? "—"}</dd>
                <dt>Status</dt><dd>{item.summary.status}</dd>
              </dl>
              <p className="muted">Updated {new Date(item.created_at).toLocaleString()} · rev {item.revision}</p>
            </article>
          ))}
        </div>
      ) : null}
      {canPage ? (
        <nav aria-label="Benchmark pages">
          {history.length > 0 ? (
            <button type="button" onClick={goPrevious}>
              Previous page
            </button>
          ) : null}{" "}
          {data?.next_cursor ? (
            <button
              type="button"
              onClick={goNext}
            >
              Next page
            </button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

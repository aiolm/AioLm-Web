"use client";
import { useI18n } from "@/i18n/client";
import { localizedPath } from "@/i18n/config";
import { useSearchParams } from "next/navigation";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ErrorState, SafeMarkdown, isAbortError, useJsonFetch } from "@/components/ui";
import { ReportForm } from "@/components/report-form";
import { asRecord, displayText, statusTone } from "@/components/benchmark-detail-format";
import { buildSetupGroups, type BenchmarkSetup, type SetupField } from "@/components/benchmark-detail-fields";
import { formatWeightQuantization, modelPublisher, modelValue, type BenchmarkModelInfo } from "@/components/benchmark-model-identity";
import { buildRowColumns, isFailedRow } from "@/components/benchmark-detail-rows";
import { formatUpdatedDate, formatDuration, formatPromptLengths, formatSampleCount, formatThroughput } from "@/components/benchmark-explorer-format";

interface Detail {
  id: string;
  benchmark: BenchmarkSetup;
  summary: {
    model_label: string; hardware_label: string; method_label: string; workload_label: string;
    row_count: number; failed_rows: number; mean_tg_tps: number | null; mean_e2e_ms: number | null; status: string;
    mean_pp_tps?: number | null; prompt_lengths?: number[];
    /** Published model metadata, absent on older results and null when none was sent. */
    model_info?: BenchmarkModelInfo | null;
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

function friendlyRowsError(): string { return "benchmark.Could not load measurements. Check your connection and try again."; }

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
  const { locale, t } = useI18n();
  const search = useSearchParams().toString();
  const { data, error, reload } = useJsonFetch<Detail>(`/v1/benchmark-runs/${publicId}`);
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
      const nextPage = cursor ? Math.floor((rows?.length ?? 0) / ROWS_VISIBLE_PAGE_SIZE) : 0;
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
        setVisiblePage(nextPage);
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
    [publicId, rows?.length],
  );

  const backLink = <p className="detail-back"><Link href={localizedPath(locale, `/benchmarks${search ? `?${search}` : ""}`)}>{t("benchmark.← Back to results")}</Link></p>;
  if (error || !data) return <div className="grid">
    {backLink}
    <section className="card">
      <h1>{t("benchmark.Benchmark result")}</h1>
      {error ? <><p>{t("benchmark.Not available.")}</p><ErrorState message={error} onRetry={reload} /></> : <p role="status" className="muted">{t("benchmark.Loading benchmark…")}</p>}
    </section>
  </div>;

  const loadedCount = rows?.length ?? 0;
  const pageCount = getRowsPageCount(loadedCount);
  const clampedPage = pageCount === 0 ? 0 : Math.min(visiblePage, pageCount - 1);
  const { start, end } = getRowsSliceIndices(clampedPage, ROWS_VISIBLE_PAGE_SIZE, loadedCount);
  const retryCursor = rows === null ? null : rowsCursor;
  const { summary } = data;
  const tone = statusTone(summary.status);

  return (
    <div className="grid">
      {backLink}
      <section className="card" aria-labelledby="detail-title">
        <h1 id="detail-title">{summary.workload_label} · {summary.model_label}</h1>
        <p>
          <span className={tone ? `status ${tone}` : "status"}>{displayText(summary.status, t)}</span>{" "}
          <span className="muted">{t("benchmark.Revision {revision} · updated {date} (UTC)", { revision: data.revision, date: formatUpdatedDate(data.updated_at, locale) })}</span>
        </p>
        <dl className="kv detail-metrics">
          {/* Who distributed the weights and how they were quantized qualify every
              number below, so they are read before the metrics rather than inside
              the collapsed setup. Both name their gaps instead of staying blank. */}
          <dt>{t("benchmark.Publisher")}</dt><dd>{modelValue(modelPublisher(summary.model_info ?? null), t)}</dd>
          <dt>{t("benchmark.Weight quantization")}</dt><dd>{formatWeightQuantization(summary.model_info ?? null, t)}</dd>
          <dt>{t("benchmark.Hardware")}</dt><dd>{summary.hardware_label}</dd>
          <dt>{t("benchmark.Method")}</dt><dd>{summary.method_label}</dd>
          <dt>{t("benchmark.Input context")}</dt><dd>{formatPromptLengths(summary.prompt_lengths) ?? t("benchmark.Unknown")}</dd>
          <dt>{t("benchmark.Measurement count")}</dt><dd>{formatSampleCount(summary.row_count, summary.failed_rows, t)}</dd>
          <dt>{t("benchmark.Mean prompt processing")}{" "}<span className="detail-unit">{t("benchmark.(tok/s)")}</span></dt>
          <dd>{formatThroughput(summary.mean_pp_tps)}</dd>
          <dt>{t("benchmark.Mean generation")}{" "}<span className="detail-unit">{t("benchmark.(tok/s)")}</span></dt>
          <dd>{formatThroughput(summary.mean_tg_tps)}</dd>
          <dt>{t("benchmark.Mean end-to-end duration")}{" "}<span className="detail-unit">{t("benchmark.(ms)")}</span></dt>
          <dd>{formatDuration(summary.mean_e2e_ms)}</dd>
        </dl>
      </section>

      <section className="card" aria-labelledby="desc-title">
        <h2 id="desc-title">{t("benchmark.Description")}</h2>
        {data.description_md ? <SafeMarkdown text={data.description_md} /> : <p className="muted">{t("benchmark.No description provided.")}</p>}
      </section>

      <section className="card" aria-labelledby="rows-title">
        <h2 id="rows-title">{t("benchmark.Measurements")}{rowsTotal !== null ? `(${rowsTotal})` : null}</h2>
        <p className="muted">
          {t("benchmark.Load the individual measurements to inspect timing, throughput and memory use for each sample. Each page shows up to {limit} samples.", { limit: ROWS_VISIBLE_PAGE_SIZE })}
        </p>
        {!rows && !rowsLoading && !rowsError ? <button type="button" onClick={() => void loadRows(null)}>{t("benchmark.Load measurements")}</button> : null}
        {rowsLoading ? <p role="status" className="muted">{t("benchmark.Loading measurements…")}</p> : null}
        {rowsError ? (
          <div className="alert error" role="alert">
            <p>{t(rowsError)}</p>
            <p>
              <button type="button" onClick={() => void loadRows(retryCursor)} disabled={rowsLoading}>{t("benchmark.Retry loading measurements")}</button>
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
              {rowsLoading ? t("benchmark.Loading…") : t("benchmark.Load more")}
            </button>
          </p>
        ) : null}
      </section>

      <SetupSection benchmark={data.benchmark} />

      <ReportForm publicId={publicId} />
    </div>
  );
}

/**
 * The reported setup, read as four questions instead of one long list: what ran,
 * on what machine, against which workload, and with which execution settings.
 */
function SetupSection({ benchmark }: { benchmark: BenchmarkSetup }): React.JSX.Element {
  const { t } = useI18n();
  const groups = buildSetupGroups(benchmark, t);
  return (
    <section className="card" aria-labelledby="env-title">
      <h2 id="env-title">{t("benchmark.Test setup (as reported)")}</h2>
      <p className="muted">{t("benchmark.These values were sent with the publication and are shown as reported. They are not independently verified.")}</p>
      <p className="muted">{t("benchmark.The publisher is the namespace of the repository the file came from; whoever quantized the weights is listed separately and is often someone else. Quantization describes the weights in the published file, not the KV cache, and it is not a statement about output quality.")}</p>
      {groups.map((group) => (
        <details className="detail-group" key={group.id}>
          <summary className="detail-group-title" id={group.id}>{group.title}</summary>
          <dl className="kv" aria-labelledby={group.id}>
            {group.fields.map((field) => (
              <Fragment key={field.unit ? `${field.label} (${field.unit})` : field.label}>
                <dt>
                  {field.label}
                  {field.unit ? <span className="detail-unit"> ({field.unit})</span> : null}
                </dt>
                <dd>
                  {field.devices && field.devices.length > 0 ? (
                    <ul className="detail-device-cards">
                      {field.devices.map((device, index) => (
                        <li className="detail-device-card" key={index}>
                          <strong>{device.name}</strong>
                          <dl className="detail-device-facts">
                            {device.facts.map((fact) => <Fragment key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></Fragment>)}
                          </dl>
                        </li>
                      ))}
                    </ul>
                  ) : Array.isArray(field.value) ? (
                    <ul className="detail-device-list">
                      {field.value.map((item, index) => <li key={index}><SetupValue field={field} text={item} /></li>)}
                    </ul>
                  ) : (
                    <SetupValue field={field} text={field.value} />
                  )}
                </dd>
              </Fragment>
            ))}
          </dl>
        </details>
      ))}
    </section>
  );
}

/**
 * A reported value, linked to its public source page only when the field
 * supplied one for exactly this text. An id that did not validate as a
 * repository is still shown, just not as a link.
 */
function SetupValue({ field, text }: { field: SetupField; text: string }): React.JSX.Element {
  const { t } = useI18n();
  const href = field.links?.[text];
  if (!href) return <>{text}</>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" aria-label={t("benchmark.{value} on Hugging Face", { value: text })}>{text}</a>
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
  const { t } = useI18n();
  // A row that is not an object still takes its place in the table, as gaps.
  const visible = rows.slice(start, end).map((row) => asRecord(row) ?? {});
  if (rows.length === 0) return <p className="muted">{t("benchmark.No rows.")}</p>;
  if (visible.length === 0) return <p className="muted">{t("benchmark.No rows on this page.")}</p>;
  const columns = buildRowColumns(visible, t);
  return (
    <div>
      {/* Focusable so the wide table can be scrolled from the keyboard, and named so that stop is announced. */}
      <div
        className="detail-rows-scroll"
        style={{ overflowX: "auto" }}
        tabIndex={0}
        role="region"
        aria-label={t("benchmark.Measurement samples")}
      >
        <table className="data detail-rows">
          <caption className="detail-rows-caption">{t("benchmark.One row per published measurement sample, in the order it was reported. Failed samples stay in the table and are named in the outcome column.")}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.numeric ? "detail-num" : undefined}>
                  {column.label}
                  {column.unit ? <span className="detail-unit"> ({column.unit})</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={start + i} className={isFailedRow(row) ? "detail-row-failed" : undefined}>
                {columns.map((column) => (
                  <td key={column.key} className={column.numeric ? "detail-num" : undefined}>
                    {column.format(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" role="status">
        {t("benchmark.Showing {start}–{end} of {count} loaded rows · Page {page} of {pages}.", { start: rows.length === 0 ? 0 : start + 1, end, count: rows.length, page: pageCount === 0 ? 0 : page + 1, pages: pageCount })}
      </p>
      {pageCount > 1 ? (
        <nav aria-label={t("benchmark.Loaded measurement pages")}>
          <button type="button" onClick={() => onPage(Math.max(0, page - 1))} disabled={page <= 0}>{t("benchmark.Previous rows")}</button>{" "}
          <button type="button" onClick={() => onPage(Math.min(pageCount - 1, page + 1))} disabled={page + 1 >= pageCount}>{t("benchmark.Next rows")}</button>
        </nav>
      ) : null}
    </div>
  );
}

"use client";
import "./benchmark-explorer-usability.css";
import { useI18n } from "@/i18n/client";
import { localizedPath } from "@/i18n/config";
import { useSearchParams } from "next/navigation";

import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { EmptyState, ErrorState, Loading, useJsonFetch } from "./ui";
import { BenchmarkBasisPoint } from "./benchmark-basis-point";
import { BenchmarkExplorerComparison } from "./benchmark-explorer-comparison";
import { BenchmarkExplorerFilters } from "./benchmark-explorer-filters";
import { BenchmarkExplorerTable } from "./benchmark-explorer-table";
import { UiSelect } from "./ui-select";
import {
  EXPLORER_COMPARE_LIMIT,
  EXPLORER_HISTORY_LIMIT,
  EXPLORER_PAGE_PATH,
  activeExplorerFilters,
  basisPointOf,
  invalidExplorerRanges,
  isPointSort,
  EXPLORER_SORTS,
  buildExplorerPointOptionsPath,
  buildExplorerRequestPath,
  buildExplorerSearch,
  canAddToComparison,
  explorerHistoryState,
  explorerReducer,
  explorerStateFromSearch,
  hasActiveExplorerFilters,
  normalizeExplorerFilters,
  popExplorerHistory,
  pushExplorerHistory,
  readExplorerHistory,
  sameExplorerFilters,
  type ExplorerAction,
  type ExplorerFilters,
  type ExplorerListResponse,
} from "./benchmark-explorer-state";

/**
 * Original browser helper names. They now delegate to the explorer state module
 * so callers and tests that import them from here keep working.
 */
export const BROWSER_HISTORY_LIMIT = EXPLORER_HISTORY_LIMIT;
export const pushBrowserHistory = pushExplorerHistory;
export const popBrowserHistory = popExplorerHistory;
export const normalizeBrowserFilters = normalizeExplorerFilters;
export const sameBrowserFilters = sameExplorerFilters;
export type BrowserFilters = ExplorerFilters;

/**
 * Systematic browsing of published results: grouped discovery controls beside the result
 * table, filters kept in the page address so a view can be shared, browser back
 * and forward moving between views, and an optional hand-picked comparison.
 * Only summary fields are requested; measurement rows stay on the detail page.
 */
export function BenchmarkBrowser({ introduction }: { introduction?: ReactNode } = {}): React.JSX.Element {
  const { locale, t } = useI18n();
  const searchParams = useSearchParams();
  const routeSearch = searchParams.toString();
  const [state, reduce] = useReducer(explorerReducer, routeSearch, explorerStateFromSearch);
  const [observedSearch, setObservedSearch] = useState(routeSearch);
  const [ready, setReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Next Link navigation does not emit popstate. Reconcile its query before
  // committing a render, so neither the form nor the fetch sees the old view.
  // Our own history writes are acknowledged without discarding an edited draft.
  if (routeSearch !== observedSearch) {
    setObservedSearch(routeSearch);
    reduce({
      type: "route",
      search: routeSearch,
      history: typeof window === "undefined" ? [] : readExplorerHistory(window.history.state),
    });
  }

  useEffect(() => {
    const applyLocation = (): void => {
      reduce({
        type: "location",
        search: window.location.search,
        history: readExplorerHistory(window.history.state),
      });
    };
    applyLocation();
    setReady(true);
    const initial = explorerStateFromSearch(window.location.search, readExplorerHistory(window.history.state));
    const canonical = buildExplorerSearch({ filters: initial.applied, cursor: initial.cursor });
    if (window.location.search !== canonical) {
      window.history.replaceState(
        explorerHistoryState(initial.history),
        "",
        window.location.pathname + canonical + window.location.hash,
      );
    }
    window.addEventListener("popstate", applyLocation);
    return () => window.removeEventListener("popstate", applyLocation);
  }, []);

  // Only user actions publish a new entry. Next merges its own router metadata;
  // passing its private markers ourselves would bypass query synchronization.
  const dispatch = useCallback((action: ExplorerAction): void => {
    const next = explorerReducer(state, action);
    const search = buildExplorerSearch({ filters: next.applied, cursor: next.cursor });
    const previous = buildExplorerSearch({ filters: state.applied, cursor: state.cursor });
    if (search !== previous) {
      window.history.pushState(
        explorerHistoryState(next.history),
        "",
        window.location.pathname + search + window.location.hash,
      );
    }
    reduce(action);
  }, [state]);

  const requestPath = useMemo(
    () => buildExplorerRequestPath({ filters: state.applied, cursor: state.cursor }),
    [state.applied, state.cursor],
  );
  // A changed request aborts the one in flight, and a late response for an earlier
  // request is dropped instead of replacing the current page.
  const { data, error, reload } = useJsonFetch<ExplorerListResponse>(ready ? requestPath : null);

  const applyFilters = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (invalidExplorerRanges(state.draft).length) return;
      if (sameExplorerFilters(normalizeExplorerFilters(state.draft), state.applied)) reload();
      dispatch({ type: "apply" });
      // Keep desktop sections in place; free the result area after a mobile apply.
      if (window.matchMedia("(max-width: 900px)").matches && sidebarOpen) {
        setSidebarOpen(false);
        requestAnimationFrame(() => {
          const heading = document.getElementById("explorer-results-title");
          heading?.focus({ preventScroll: true });
          heading?.scrollIntoView({ block: "start" });
        });
      }
    },
    [state.draft, state.applied, reload, dispatch, sidebarOpen],
  );

  const goNext = useCallback(() => {
    dispatch({ type: "nextPage", cursor: data?.next_cursor ?? null });
  }, [data?.next_cursor, dispatch]);

  const items = data?.items ?? [];
  const basis = basisPointOf(state.applied);
  const basisValue = basis ? `${basis.prompt_tokens}/${basis.concurrency}` : "";
  const active = activeExplorerFilters(state.applied);
  const filtered = hasActiveExplorerFilters(state.applied);
  const clearable = filtered || hasActiveExplorerFilters(state.draft);
  const invalidDraft = invalidExplorerRanges(state.draft).length > 0;
  const comparisonFull = !canAddToComparison(state.compare);
  const canPage = data !== null && (data.next_cursor !== null || state.cursor !== null || state.history.length > 0);

  return (
    <div className="explorer explorer-compact">
      {introduction}
      <div className="explorer-layout">
        <aside className="explorer-rail" aria-label={t("benchmark.Filters")}>
          <button type="button" className="explorer-button explorer-sidebar-toggle"
            aria-expanded={sidebarOpen} aria-controls="explorer-sidebar-content" onClick={() => setSidebarOpen(open => !open)}>
            {t(sidebarOpen ? "benchmark.Hide filters" : "benchmark.Find models and filter")}
            {active.length > 0 ? <span className="explorer-filter-count">{active.length}</span> : null}
          </button>
          <div id="explorer-sidebar-content" className="explorer-sidebar-content" data-open={sidebarOpen}>
          <form id="explorer-filter-form" className="explorer-filters" method="GET" action={localizedPath(locale, EXPLORER_PAGE_PATH)} onSubmit={applyFilters}>
            <fieldset className="explorer-filter-set">
              <legend className="explorer-filter-legend sr-only">{t("benchmark.Filters")}</legend>
              <div className="explorer-sidebar-header">
                <h2 className="explorer-sidebar-title">{t("benchmark.Filters")}</h2>
                <button type="button" className="explorer-sidebar-reset" disabled={!clearable}
                  onClick={() => dispatch({ type: "reset" })}>{t("benchmark.Clear filters")}</button>
              </div>
              <BenchmarkExplorerFilters draft={state.draft} onChange={(key, value) => dispatch({ type: "draft", key, value })}
                actions={<>
                  <p className="explorer-draft-status" role="status">{!sameExplorerFilters(normalizeExplorerFilters(state.draft), state.applied)
                    ? t("benchmark.Changes not applied. Apply filters to update results.") : null}</p>
                  <button type="submit" disabled={invalidDraft} className="explorer-button explorer-button-primary">{t("benchmark.Apply filters")}</button>
                </>}
              />
            </fieldset>
          </form>
          </div>
        </aside>

        <div className="explorer-main-column">
          {active.length > 0 ? (
            <div className="explorer-active-filters">
              <h3 className="explorer-active-filters-title">{t("benchmark.Active filters")}</h3>
              <ul className="explorer-active-filter-list">
                {active.map((filter) => (
                  <li className="explorer-active-filter" key={filter.key}>
                    <span className="explorer-active-filter-text">
                      <span className="explorer-active-filter-key">{t(`benchmark.${filter.label}`)}:</span> {filter.key === "sort" ? t(`benchmark.${EXPLORER_SORTS[filter.value as keyof typeof EXPLORER_SORTS]}`) : filter.value}
                    </span>
                    <button type="button" className="explorer-active-filter-remove"
                      onClick={() => dispatch({ type: "removeFilter", key: filter.key })}
                      aria-label={t("benchmark.Remove the {filter} filter", { filter: t(`benchmark.${filter.label}`) })}
                    ><span aria-hidden="true">×</span></button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        <section className="explorer-main" aria-labelledby="explorer-results-title">
          <div className="explorer-main-header">
            <div className="explorer-main-heading">
              <h2 id="explorer-results-title" tabIndex={-1} className="explorer-main-title">{t("benchmark.Published results")}</h2>
              {data ? <p className="explorer-result-count" role="status">{t("benchmark.{count} results on this page", { count: items.length })}</p> : null}
              <button type="button" className="explorer-button explorer-refresh" data-action-glyph="refresh" onClick={reload}>{t("benchmark.Refresh")}</button>
              <p className="explorer-main-subtitle">
                {t("benchmark.Select up to {limit} results to compare their setup.", { limit: EXPLORER_COMPARE_LIMIT })}
              </p>
            </div>
            <div className="explorer-result-actions">
              <BenchmarkBasisPoint
                value={basisValue}
                only={state.applied.point_only === "1"}
                optionsPath={ready ? buildExplorerPointOptionsPath(state.applied) : ""}
                onSelect={(value) => dispatch({ type: "basisPoint", value })}
                onOnlyChange={(value) => dispatch({ type: "pointOnly", value })}
              />
              <div className="explorer-field explorer-sort"><label className="explorer-field-label" id="explorer-sort-label" htmlFor="explorer-sort">{t("benchmark.Sort")}</label>
                {/* Ranking measured speed needs a point to rank at, so those orders wait for one. */}
                <UiSelect id="explorer-sort" form="explorer-filter-form" name="sort" labelledBy="explorer-sort-label" value={state.applied.sort || "newest"}
                  options={Object.entries(EXPLORER_SORTS).map(([value, label]) => ({ value, label: t(`benchmark.${label}`), disabled: isPointSort(value) && basis === null }))}
                  onChange={value => dispatch({ type: "sort", value })} />
              </div>
            </div>
          </div>

          {!ready || (!data && !error) ? <Loading label={t("benchmark.Loading published benchmarks…")} /> : null}
          {error ? <ErrorState message={error} onRetry={reload} /> : null}
          {data && items.length === 0 ? (
            <EmptyState
              title={filtered ? t("benchmark.No results match these filters.") : t("benchmark.No public benchmarks yet.")}
              hint={
                filtered
                  ? t("benchmark.Clear a filter to widen the search. Labels are self-reported, so they differ between configurations.")
                  : t("benchmark.Results shared from AioLM will appear here. Self-reported data only; compare configurations carefully.")
              }
            />
          ) : null}
          {data && items.length === 0 && filtered ? <button type="button" className="explorer-button" data-action-glyph="clear" onClick={() => dispatch({ type: "reset" })}>{t("benchmark.Clear filters")}</button> : null}
          {data && items.length > 0 ? (
            <div className="explorer-results">
              <BenchmarkExplorerTable
                items={items}
                compare={state.compare}
                basis={basis}
                onToggleComparison={(item) => dispatch({ type: "toggleComparison", item })}
              />
              {comparisonFull ? (
                <p className="explorer-compare-limit">
                  {t("benchmark.The comparison holds {limit} results. Remove one to select another.", { limit: EXPLORER_COMPARE_LIMIT })}
                </p>
              ) : null}

            </div>
          ) : null}

          <BenchmarkExplorerComparison
            items={state.compare}
            basis={basis}
            onRemove={(item) => dispatch({ type: "toggleComparison", item })}
            onClear={() => dispatch({ type: "clearComparison" })}
          />

          {canPage ? (
            <nav className="explorer-pagination" aria-label={t("benchmark.Result pages")}>
              <button
                type="button"
                className="explorer-button explorer-page-previous"
                data-action-glyph="previous"
                onClick={() => dispatch({ type: state.history.length ? "previousPage" : "firstPage" })}
                disabled={state.history.length === 0 && state.cursor === null}
              >{t(state.history.length ? "benchmark.Previous page" : "benchmark.First page")}</button>
              <button
                type="button"
                className="explorer-button explorer-page-next"
                data-action-glyph="next"
                onClick={goNext}
                disabled={!data?.next_cursor}
              >{t("benchmark.Next page")}</button>
            </nav>
          ) : null}
        </section>

        <details className="explorer-guide">
        <summary><span id="explorer-guide-title" className="explorer-guide-title">{t("benchmark.Compare like for like")}</span></summary>
        <p className="explorer-guide-text">{t("benchmark.Match the model fingerprint, hardware, workload and measurement method before reading anything into a difference. Results published with a different method or workload measured different work.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Every speed here is read at one operating point: one input length at one concurrency. Decode (tok/s) is the generation rate, so higher is faster, and Duration (s) is the end-to-end time of one measurement, so lower is faster. The two answer different questions and do not convert into each other.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Prefill (tok/s) is how fast a result consumed its prompt at that point. Each value is the median of that point's repetitions, with the range they covered beside it. Speeds are never averaged across different input lengths or concurrencies, because such an average describes no configuration that ran.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Choose a basis point to read every result at the same input length and concurrency; that is also what the two speed orders rank at. Input context lists the input lengths a result was configured with, and the input length filter and its sorts read the largest of them. The total context the server allocated is a different number and appears on the result page.")}</p>
        <p className="explorer-guide-text">{t("benchmark.A missing measurement is shown as an em dash (—), never as a zero. Sorting does not make different setups directly comparable.")}</p>
        </details>
        </div>
      </div>
    </div>
  );
}

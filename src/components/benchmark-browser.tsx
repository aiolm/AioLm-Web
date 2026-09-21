"use client";
import "./benchmark-explorer-usability.css";
import { useI18n } from "@/i18n/client";
import { localizedPath } from "@/i18n/config";
import { useSearchParams } from "next/navigation";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { EmptyState, ErrorState, Loading, useJsonFetch } from "./ui";
import { BenchmarkExplorerComparison } from "./benchmark-explorer-comparison";
import { BenchmarkExplorerFilters } from "./benchmark-explorer-filters";
import { BenchmarkExplorerTable } from "./benchmark-explorer-table";
import {
  EXPLORER_COMPARE_LIMIT,
  EXPLORER_HISTORY_LIMIT,
  EXPLORER_PAGE_PATH,
  activeExplorerFilters,
  invalidExplorerRanges,
  EXPLORER_SORTS,
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
 * Systematic browsing of published results: grouped discovery controls above the result
 * table, filters kept in the page address so a view can be shared, browser back
 * and forward moving between views, and an optional hand-picked comparison.
 * Only summary fields are requested; measurement rows stay on the detail page.
 */
export function BenchmarkBrowser(): React.JSX.Element {
  const { locale, t } = useI18n();
  const searchParams = useSearchParams();
  const routeSearch = searchParams.toString();
  const [state, reduce] = useReducer(explorerReducer, routeSearch, explorerStateFromSearch);
  const [observedSearch, setObservedSearch] = useState(routeSearch);
  const [ready, setReady] = useState(false);

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
      const advanced = event.currentTarget.querySelector<HTMLDetailsElement>(".explorer-more-filters");
      if (advanced?.open) {
        advanced.open = false;
        const heading = document.getElementById("explorer-results-title");
        heading?.focus({ preventScroll: true });
        heading?.scrollIntoView({ block: "start" });
      }
    },
    [state.draft, state.applied, reload, dispatch],
  );

  const goNext = useCallback(() => {
    dispatch({ type: "nextPage", cursor: data?.next_cursor ?? null });
  }, [data?.next_cursor, dispatch]);

  const items = data?.items ?? [];
  const active = activeExplorerFilters(state.applied);
  const filtered = hasActiveExplorerFilters(state.applied);
  const clearable = filtered || hasActiveExplorerFilters(state.draft);
  const comparisonFull = !canAddToComparison(state.compare);
  const canPage = data !== null && (data.next_cursor !== null || state.cursor !== null || state.history.length > 0);

  return (
    <div className="explorer explorer-compact">
      <div className="explorer-layout">
        <div className="explorer-rail">
          <form id="explorer-filter-form" className="explorer-filters" method="GET" action={localizedPath(locale, EXPLORER_PAGE_PATH)} onSubmit={applyFilters}>
            <fieldset className="explorer-filter-set">
              <legend className="explorer-filter-legend sr-only">{t("benchmark.Filters")}</legend>
              <BenchmarkExplorerFilters draft={state.draft} onChange={(key, value) => dispatch({ type: "draft", key, value })}
                pending={!sameExplorerFilters(state.draft, state.applied)}
                actions={
                  <div className="explorer-filter-actions">
                    <button type="submit" disabled={invalidExplorerRanges(state.draft).length > 0} className="explorer-button explorer-button-primary">{t("benchmark.Search")}</button>
                    {/* Kept in the layout while inactive so applying or clearing a filter never moves Search. */}
                    <button
                      type="button"
                      className={clearable ? "explorer-button explorer-button-quiet" : "explorer-button explorer-button-quiet explorer-button-reserved"}
                      onClick={() => dispatch({ type: "reset" })}
                    >{t("benchmark.Clear filters")}</button>
                  </div>
                }
              />
            </fieldset>
          </form>
        </div>

        <section className="explorer-main" aria-labelledby="explorer-results-title">
          <div className="explorer-main-header">
            <div className="explorer-main-heading">
              <h2 id="explorer-results-title" tabIndex={-1} className="explorer-main-title">{t("benchmark.Published results")}</h2>
              <p className="explorer-main-subtitle">
                {t("benchmark.Select up to {limit} results to compare their setup.", { limit: EXPLORER_COMPARE_LIMIT })}
              </p>
            </div>
            <div className="explorer-result-actions">
              <div className="explorer-field explorer-sort"><label className="explorer-field-label" htmlFor="explorer-sort">{t("benchmark.Sort")}</label>
                <select id="explorer-sort" form="explorer-filter-form" name="sort" className="explorer-field-input" value={state.applied.sort || "newest"} onChange={event => dispatch({ type: "sort", value: event.target.value })}>
                  {Object.entries(EXPLORER_SORTS).map(([value, label]) => <option value={value} key={value}>{t(`benchmark.${label}`)}</option>)}
                </select>
              </div>
              <button type="button" className="explorer-button explorer-refresh" onClick={reload}>{t("benchmark.Refresh")}</button>
            </div>
          </div>

          {active.length > 0 ? (
            <div className="explorer-active-filters">
              <h3 className="explorer-active-filters-title">{t("benchmark.Active filters")}</h3>
              <ul className="explorer-active-filter-list">
                {active.map((filter) => (
                  <li className="explorer-active-filter" key={filter.key}>
                    <span className="explorer-active-filter-text">
                      <span className="explorer-active-filter-key">{t(`benchmark.${filter.label}`)}:</span> {filter.key === "sort" ? t(`benchmark.${EXPLORER_SORTS[filter.value as keyof typeof EXPLORER_SORTS]}`) : filter.value}
                    </span>
                    <button
                      type="button"
                      className="explorer-active-filter-remove"
                      onClick={() => dispatch({ type: "removeFilter", key: filter.key })}
                      aria-label={t("benchmark.Remove the {filter} filter", { filter: t(`benchmark.${filter.label}`) })}
                    >{t("benchmark.Remove")}</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

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
          {data && items.length === 0 && filtered ? <button type="button" className="explorer-button" onClick={() => dispatch({ type: "reset" })}>{t("benchmark.Clear filters")}</button> : null}
          {data && items.length > 0 ? (
            <div className="explorer-results">
              <BenchmarkExplorerTable
                items={items}
                compare={state.compare}
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
            onRemove={(item) => dispatch({ type: "toggleComparison", item })}
            onClear={() => dispatch({ type: "clearComparison" })}
          />

          {canPage ? (
            <nav className="explorer-pagination" aria-label={t("benchmark.Result pages")}>
              <button
                type="button"
                className="explorer-button explorer-page-previous"
                onClick={() => dispatch({ type: state.history.length ? "previousPage" : "firstPage" })}
                disabled={state.history.length === 0 && state.cursor === null}
              >{t(state.history.length ? "benchmark.Previous page" : "benchmark.First page")}</button>
              <button
                type="button"
                className="explorer-button explorer-page-next"
                onClick={goNext}
                disabled={!data?.next_cursor}
              >{t("benchmark.Next page")}</button>
            </nav>
          ) : null}
        </section>
      </div>

      <section className="explorer-guide" aria-labelledby="explorer-guide-title">
        <h2 id="explorer-guide-title" className="explorer-guide-title">{t("benchmark.Compare like for like")}</h2>
        <p className="explorer-guide-text">{t("benchmark.Match the model fingerprint, hardware, workload and measurement method before reading anything into a difference. Results published with a different method or workload measured different work.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Generation (tok/s) is the mean generation throughput in tokens per second, so higher is faster. Duration (s) is the mean end-to-end time of a measurement in seconds, so lower is faster. The two answer different questions and do not convert into each other.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Prompt processing (tok/s) is the mean input throughput: how fast a result consumed its prompt. Input context lists the input lengths a result was configured with, and the input length filter and its sorts read the largest of them. The total context the server allocated is a different number and appears on the result page.")}</p>
        <p className="explorer-guide-text">{t("benchmark.A missing measurement is shown as an em dash (—), never as a zero. Sorting does not make different setups directly comparable.")}</p>
      </section>
    </div>
  );
}

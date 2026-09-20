"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, Loading, useJsonFetch } from "./ui";
import { BenchmarkExplorerComparison } from "./benchmark-explorer-comparison";
import { BenchmarkExplorerTable } from "./benchmark-explorer-table";
import {
  EXPLORER_COMPARE_LIMIT,
  EXPLORER_FILTER_KEYS,
  EXPLORER_FILTER_LABELS,
  EXPLORER_FILTER_MAX_LENGTH,
  EXPLORER_FILTER_PLACEHOLDERS,
  EXPLORER_HISTORY_LIMIT,
  EXPLORER_PAGE_PATH,
  activeExplorerFilters,
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
 * Systematic browsing of published results: a filter rail beside the result
 * table, filters kept in the page address so a view can be shared, browser back
 * and forward moving between views, and an optional hand-picked comparison.
 * Only summary fields are requested; measurement rows stay on the detail page.
 */
export function BenchmarkBrowser(): React.JSX.Element {
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
      if (sameExplorerFilters(normalizeExplorerFilters(state.draft), state.applied)) reload();
      dispatch({ type: "apply" });
    },
    [state.draft, state.applied, reload, dispatch],
  );

  const goNext = useCallback(() => {
    dispatch({ type: "nextPage", cursor: data?.next_cursor ?? null });
  }, [data?.next_cursor, dispatch]);

  const items = data?.items ?? [];
  const active = activeExplorerFilters(state.applied);
  const filtered = hasActiveExplorerFilters(state.applied);
  const comparisonFull = !canAddToComparison(state.compare);
  const canPage = data !== null && (data.next_cursor !== null || state.history.length > 0);

  return (
    <div className="explorer">
      <div className="explorer-layout">
        <div className="explorer-rail">
          <form className="explorer-filters" method="GET" action={EXPLORER_PAGE_PATH} onSubmit={applyFilters}>
            <fieldset className="explorer-filter-set">
              <legend className="explorer-filter-legend">Filters</legend>
              <p className="explorer-filter-hint">
                Narrow down results by setup and measurement details. Filters are kept in the page address, so a
                filtered view can be bookmarked or shared as a link.
              </p>
              <div className="explorer-filter-grid">
                {EXPLORER_FILTER_KEYS.map((filterKey) => (
                  <div className="explorer-field" key={filterKey}>
                    <label className="explorer-field-label" htmlFor={`explorer-filter-${filterKey}`}>
                      {EXPLORER_FILTER_LABELS[filterKey]}
                    </label>
                    <input
                      className="explorer-field-input"
                      id={`explorer-filter-${filterKey}`}
                      name={filterKey}
                      type="search"
                      autoComplete="off"
                      maxLength={EXPLORER_FILTER_MAX_LENGTH}
                      placeholder={EXPLORER_FILTER_PLACEHOLDERS[filterKey]}
                      value={state.draft[filterKey]}
                      onChange={(event) => dispatch({ type: "draft", key: filterKey, value: event.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="explorer-filter-actions">
                <button type="submit" className="explorer-button explorer-button-primary">Apply filters</button>
                <button
                  type="button"
                  className="explorer-button explorer-button-quiet"
                  onClick={() => dispatch({ type: "reset" })}
                  disabled={!filtered && !hasActiveExplorerFilters(state.draft)}
                >
                  Clear filters
                </button>
              </div>
            </fieldset>
          </form>
        </div>

        <section className="explorer-main" aria-labelledby="explorer-results-title">
          <div className="explorer-main-header">
            <div className="explorer-main-heading">
              <h2 id="explorer-results-title" className="explorer-main-title">Published results</h2>
              <p className="explorer-main-subtitle">
                Newest first. Select up to {EXPLORER_COMPARE_LIMIT} results to compare their setup.
              </p>
            </div>
            <button type="button" className="explorer-button explorer-refresh" onClick={reload}>Refresh</button>
          </div>

          {active.length > 0 ? (
            <div className="explorer-active-filters">
              <h3 className="explorer-active-filters-title">Active filters</h3>
              <ul className="explorer-active-filter-list">
                {active.map((filter) => (
                  <li className="explorer-active-filter" key={filter.key}>
                    <span className="explorer-active-filter-text">
                      <span className="explorer-active-filter-key">{filter.label}:</span> {filter.value}
                    </span>
                    <button
                      type="button"
                      className="explorer-active-filter-remove"
                      onClick={() => dispatch({ type: "removeFilter", key: filter.key })}
                      aria-label={`Remove the ${filter.label} filter`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!ready || (!data && !error) ? <Loading label="Loading published benchmarks…" /> : null}
          {error ? <ErrorState message={error} onRetry={reload} /> : null}
          {data && items.length === 0 ? (
            <EmptyState
              title={filtered ? "No results match these filters." : "No public benchmarks yet."}
              hint={
                filtered
                  ? "Clear a filter to widen the search. Labels are self-reported, so they differ between configurations."
                  : "Results shared from AioLM will appear here. Self-reported data only; compare configurations carefully."
              }
            />
          ) : null}
          {data && items.length > 0 ? (
            <div className="explorer-results">
              {comparisonFull ? (
                <p className="explorer-compare-limit">
                  The comparison holds {EXPLORER_COMPARE_LIMIT} results. Remove one to select another.
                </p>
              ) : null}
              <BenchmarkExplorerTable
                items={items}
                compare={state.compare}
                onToggleComparison={(item) => dispatch({ type: "toggleComparison", item })}
              />
            </div>
          ) : null}

          <BenchmarkExplorerComparison
            items={state.compare}
            onRemove={(item) => dispatch({ type: "toggleComparison", item })}
            onClear={() => dispatch({ type: "clearComparison" })}
          />

          {canPage ? (
            <nav className="explorer-pagination" aria-label="Result pages">
              <button
                type="button"
                className="explorer-button explorer-page-previous"
                onClick={() => dispatch({ type: "previousPage" })}
                disabled={state.history.length === 0}
              >
                Previous page
              </button>
              <button
                type="button"
                className="explorer-button explorer-page-next"
                onClick={goNext}
                disabled={!data?.next_cursor}
              >
                Next page
              </button>
            </nav>
          ) : null}
        </section>
      </div>

      <section className="explorer-guide" aria-labelledby="explorer-guide-title">
        <h2 id="explorer-guide-title" className="explorer-guide-title">Compare like for like</h2>
        <p className="explorer-guide-text">
          Match the model fingerprint, hardware, workload and measurement method before reading anything into a
          difference. Results published with a different method or workload measured different work.
        </p>
        <p className="explorer-guide-text">
          <span className="explorer-guide-term">Generation (tok/s)</span> is the mean generation throughput in tokens
          per second, so higher is faster. <span className="explorer-guide-term">Duration (ms)</span> is the mean
          end-to-end time of a measurement in milliseconds, so lower is faster. The two answer different questions and
          do not convert into each other.
        </p>
        <p className="explorer-guide-text">
          Some results do not carry every metric. A missing measurement is shown as an em dash (—), never as a zero.
          Rows are listed newest first and are not ranked.
        </p>
      </section>
    </div>
  );
}

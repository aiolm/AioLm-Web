"use client";
import "./benchmark-explorer-usability.css";
import { useI18n } from "@/i18n/client";
import { localizedPath } from "@/i18n/config";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { EmptyState, ErrorState, Loading, useJsonFetch } from "./ui";
import { BenchmarkBasisPoint } from "./benchmark-basis-point";
import { BenchmarkExplorerComparison } from "./benchmark-explorer-comparison";
import { BenchmarkExplorerFilters } from "./benchmark-explorer-filters";
import { BenchmarkExplorerTable } from "./benchmark-explorer-table";
import { UiSelect } from "./ui-select";
import {
  EXPLORER_COMPARE_LIMIT,
  EXPLORER_FILTER_MAX_LENGTH,
  EXPLORER_PAGE_PATH,
  activeExplorerFilters,
  basisPointOf,
  invalidExplorerDraft,
  isPointSort,
  EXPLORER_SORTS,
  buildExplorerPointOptionsPath,
  buildExplorerRequestPath,
  isExplorerRequestWithinBounds,
  EXPLORER_QUERY_LIMIT_MESSAGE,
  buildExplorerSearch,
  canAddToComparison,
  explorerHistoryState,
  explorerReducer,
  explorerStateFromSearch,
  hasActiveExplorerFilters,
  normalizeExplorerFilters,
  readExplorerHistory,
  sameExplorerFilters,
  type ExplorerAction,
  type ExplorerListResponse,
} from "./benchmark-explorer-state";
import { settingConditionLabel } from "./benchmark-setting-editor";
import { servingPointId } from "@/lib/benchmark-points";
import { measurementScope, sortAvailable } from "@/lib/benchmark-discovery";
import { formatPointLabel, formatServingPointLabel } from "./benchmark-explorer-format";


/**
 * Search-first browsing of published results, with detailed controls available
 * on demand. One URL-backed draft powers both the search and detailed filters.
 * Only summary fields are requested; full measurement rows stay on detail pages.
 */
export function BenchmarkBrowser({ introduction }: { introduction?: ReactNode } = {}): React.JSX.Element {
  const { locale, t } = useI18n();
  const searchParams = useSearchParams();
  const routeSearch = searchParams.toString();
  const [state, reduce] = useReducer(explorerReducer, routeSearch, explorerStateFromSearch);
  const [observedSearch, setObservedSearch] = useState(routeSearch);
  const [ready, setReady] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [requestLimitDenied, setRequestLimitDenied] = useState(false);

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
    if (search !== previous && !isExplorerRequestWithinBounds(buildExplorerRequestPath({ filters: next.applied, cursor: next.cursor }))) {
      setRequestLimitDenied(true);
      return;
    }
    setRequestLimitDenied(false);
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
  const requestBlocked = !isExplorerRequestWithinBounds(requestPath);
  const { data, error, reload } = useJsonFetch<ExplorerListResponse>(ready && !requestBlocked ? requestPath : null);
  useEffect(() => {
    if (state.cursor && error === t("error.invalidRequest")) {
      const search = buildExplorerSearch({ filters: state.applied, cursor: null });
      window.history.replaceState(explorerHistoryState([]), "", window.location.pathname + search + window.location.hash);
      reduce({ type: "firstPage" });
    }
  }, [error, state.cursor, state.applied, t]);

  const applyFilters = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (invalidExplorerDraft(state.draft)) return;
      if (!isExplorerRequestWithinBounds(buildExplorerRequestPath({ filters: normalizeExplorerFilters(state.draft), cursor: null }))) return;
      if (sameExplorerFilters(normalizeExplorerFilters(state.draft), state.applied)) reload();
      dispatch({ type: "apply" });
      // Applying detailed conditions returns attention to the results at every width.
      if (filtersOpen) {
        setFiltersOpen(false);
        requestAnimationFrame(() => {
          const heading = document.getElementById("explorer-results-title");
          heading?.focus({ preventScroll: true });
          heading?.scrollIntoView({ block: "start" });
        });
      }
    },
    [state.draft, state.applied, reload, dispatch, filtersOpen],
  );

  const goNext = useCallback(() => {
    dispatch({ type: "nextPage", cursor: data?.next_cursor ?? null });
  }, [data?.next_cursor, dispatch]);

  const items = data?.items ?? [];
  const scope = measurementScope(state.applied.measurement);
  const basis = basisPointOf(state.applied);
  const basisValue = basis ? "input_bytes" in basis ? servingPointId(basis.input_bytes, basis.concurrency, basis.max_output_tokens) : `${basis.prompt_tokens}/${basis.concurrency}` : "";
  const active = activeExplorerFilters(state.applied);
  const filtered = hasActiveExplorerFilters(state.applied);
  const clearable = filtered || hasActiveExplorerFilters(state.draft) || state.applied.sort !== "" || state.draft.sort !== "" || basis !== null;
  const invalidDraft = invalidExplorerDraft(state.draft);
  const searchTooLong = Array.from(state.draft.q.trim()).length > EXPLORER_FILTER_MAX_LENGTH;
  const draftRequestBlocked = !isExplorerRequestWithinBounds(buildExplorerRequestPath({ filters: normalizeExplorerFilters(state.draft), cursor: null }));
  const nextRequestBlocked = !!data?.next_cursor && !isExplorerRequestWithinBounds(buildExplorerRequestPath({ filters: state.applied, cursor: data.next_cursor }));
  const comparisonFull = !canAddToComparison(state.compare);
  const canPage = data !== null && (data.next_cursor !== null || state.cursor !== null || state.history.length > 0);
  const detailedCount = active.filter(filter => filter.key !== "q" && filter.key !== "point_only").length + state.applied.setting.length;
  const draftChanged = !sameExplorerFilters(normalizeExplorerFilters(state.draft), state.applied);
  const showResultControls = items.length > 0 || filtered || basis !== null || state.applied.sort !== "";
  const basisLabel = basis
    ? "input_bytes" in basis
      ? formatServingPointLabel(basis.input_bytes, basis.concurrency, basis.max_output_tokens, basis.scope)
      : formatPointLabel(basis.prompt_tokens, basis.concurrency)
    : t("benchmark.Each result's own leading point");
  const clearFilters = (): void => {
    dispatch({ type: "reset" });
    setFiltersOpen(false);
    requestAnimationFrame(() => document.getElementById("explorer-search")?.focus());
  };

  return (
    <div className="explorer explorer-compact">
      {introduction}
      <div className="explorer-layout">
        <form id="explorer-filter-form" className="explorer-filters explorer-search-panel" method="GET" action={localizedPath(locale, EXPLORER_PAGE_PATH)} onSubmit={applyFilters}>
          <fieldset className="explorer-filter-set">
            <legend className="sr-only">{t("benchmark.Filters")}</legend>
            <div className="explorer-search-row">
              <label className="explorer-field explorer-search-field" htmlFor="explorer-search">
                <span className="explorer-field-label">{t("benchmark.search")}</span>
                <input id="explorer-search" name="q" type="search" className="explorer-field-input"
                  aria-invalid={searchTooLong} aria-describedby={searchTooLong ? "explorer-search-error" : undefined}
                  placeholder={t("benchmark.Search by model, engine or graphics card")} value={state.draft.q}
                  onChange={event => dispatch({ type: "draft", key: "q", value: event.target.value })} />
              </label>
              <button type="submit" disabled={invalidDraft || draftRequestBlocked} className="explorer-button explorer-button-primary">{t("benchmark.Search")}</button>
              <button id="explorer-detailed-toggle" type="button" className="explorer-button explorer-filter-toggle"
                aria-expanded={filtersOpen} aria-controls="explorer-detailed-filters" onClick={() => setFiltersOpen(open => !open)}>
                {t(filtersOpen ? "benchmark.Hide detailed filters" : "benchmark.More filters")}
                {detailedCount > 0 ? <span className="explorer-filter-count">{detailedCount}</span> : null}
              </button>
            </div>
            <div className="explorer-search-meta">
              <p className="explorer-draft-status" role="status">{draftChanged ? t("benchmark.Changes not applied. Apply filters to update results.") : null}</p>
              {clearable ? <button type="button" className="explorer-filter-reset" onClick={clearFilters}>{t("benchmark.Clear filters")}</button> : null}
            </div>
            {searchTooLong ? <p id="explorer-search-error" className="explorer-validation" role="alert">{t("benchmark.Search must be at most {limit} characters.", { limit: EXPLORER_FILTER_MAX_LENGTH })}</p> : null}
            {draftRequestBlocked ? <p className="explorer-validation" role="alert">{t(`benchmark.${EXPLORER_QUERY_LIMIT_MESSAGE}`)}</p> : null}
            {!filtersOpen && invalidDraft && !searchTooLong ? <p className="explorer-validation" role="alert">{t("benchmark.Check conditions before applying. Byte and legacy token conditions cannot be mixed.")}</p> : null}
            <div id="explorer-detailed-filters" className="explorer-detailed-filters" hidden={!filtersOpen} aria-labelledby="explorer-detailed-title">
              <div className="explorer-filter-panel-header">
                <h2 id="explorer-detailed-title" className="explorer-filter-panel-title">{t("benchmark.Detailed filters")}</h2>
              </div>
              <BenchmarkExplorerFilters draft={state.draft} onChange={(key, value) => dispatch({ type: "draft", key, value })}
                onSettingsChange={value => dispatch({ type: "settings", value })}
                actions={<button type="submit" disabled={invalidDraft || draftRequestBlocked} className="explorer-button explorer-button-primary">{t("benchmark.Apply filters")}</button>} />
            </div>
          </fieldset>
        </form>

        <div className="explorer-main-column">
          {active.length > 0 || state.applied.setting.length > 0 ? (
            <div className="explorer-active-filters">
              <h3 className="explorer-active-filters-title">{t("benchmark.Active filters")}</h3>
              <ul className="explorer-active-filter-list">
                {active.map((filter) => (
                  <li className="explorer-active-filter" key={filter.key}>
                    <span className="explorer-active-filter-text">
                      <span className="explorer-active-filter-key">{t(`benchmark.${filter.label}`)}{filter.key.endsWith("_min") ? ` · ${t("benchmark.Minimum")}` : filter.key.endsWith("_max") ? ` · ${t("benchmark.Maximum")}` : ""}:</span> {filter.key === "sort" ? t(`benchmark.${EXPLORER_SORTS[filter.value as keyof typeof EXPLORER_SORTS]}`) : filter.value}
                    </span>
                    <button type="button" className="explorer-active-filter-remove"
                      onClick={() => dispatch({ type: "removeFilter", key: filter.key })}
                      aria-label={t("benchmark.Remove the {filter} filter", { filter: t(`benchmark.${filter.label}`) })}
                    ><span aria-hidden="true">×</span></button>
                  </li>
                ))}
                {state.applied.setting.map((condition, index) => <li className="explorer-active-filter" key={condition}>
                  <span className="explorer-active-filter-text">{settingConditionLabel(condition)}</span>
                  <button type="button" className="explorer-active-filter-remove" onClick={() => dispatch({ type: "removeSetting", index })} aria-label={t("benchmark.Remove condition")}><span aria-hidden="true">×</span></button>
                </li>)}
              </ul>
            </div>
          ) : null}
        <section className="explorer-main" aria-labelledby="explorer-results-title">
          <div className="explorer-main-header">
            <div className="explorer-main-heading">
              <h2 id="explorer-results-title" tabIndex={-1} className="explorer-main-title">{t("benchmark.Published results")}</h2>
              {data ? <p className="explorer-result-count" role="status">{t("benchmark.{count} results on this page", { count: items.length })}</p> : null}
              <button type="button" className="explorer-button explorer-refresh" data-action-glyph="refresh" onClick={reload}>{t("benchmark.Refresh")}</button>
              {items.length > 0 ? <p className="explorer-main-subtitle">
                {t("benchmark.Select up to {limit} results to compare their setup.", { limit: EXPLORER_COMPARE_LIMIT })}
              </p> : null}
            </div>
            {showResultControls ? <div className="explorer-result-actions">
              <div className="explorer-field explorer-sort"><label className="explorer-field-label" id="explorer-sort-label" htmlFor="explorer-sort">{t("benchmark.Sort")}</label>
                {/* Ranking measured speed needs a point to rank at, so those orders wait for one. */}
                <UiSelect id="explorer-sort" form="explorer-filter-form" name="sort" labelledBy="explorer-sort-label" value={state.applied.sort || "newest"}
                  options={Object.entries(EXPLORER_SORTS).filter(([value]) => sortAvailable(value, scope)).map(([value, label]) => ({ value, label: t(`benchmark.${label}`), disabled: isPointSort(value) && basis === null }))}
                  onChange={value => dispatch({ type: "sort", value })} />
              </div>
            </div> : null}
          </div>
          {showResultControls ? <details className="explorer-measurement-controls">
            <summary>{t("benchmark.Match measurement conditions")}<span className="explorer-measurement-value">{basisLabel}</span></summary>
            <p className="explorer-field-hint">{t("benchmark.Applies immediately")} {t("benchmark.Results use each run's own measured point unless you choose one.")}</p>
            <BenchmarkBasisPoint value={basisValue} scope={scope}
              only={state.applied.point_only === "1"} optionsPath={ready ? buildExplorerPointOptionsPath(state.applied) : ""}
              onSelect={value => dispatch({ type: "basisPoint", value })}
              onOnlyChange={value => dispatch({ type: "pointOnly", value })} />
            {basis === null ? <p className="explorer-field-hint">{t("benchmark.Choose a measurement point to sort by speed.")}</p> : null}
          </details> : null}

          {!ready || (!requestBlocked && !data && !error) ? <Loading label={t("benchmark.Loading published benchmarks…")} /> : null}
          {error ? <ErrorState message={error} onRetry={reload} /> : null}
          {(requestBlocked || requestLimitDenied || nextRequestBlocked) && !draftRequestBlocked ? <p className="explorer-validation" role="alert">{t(`benchmark.${EXPLORER_QUERY_LIMIT_MESSAGE}`)}</p> : null}
          {data && items.length === 0 ? (
            <EmptyState
              title={filtered ? t("benchmark.No results match these filters.") : t("benchmark.No public benchmarks yet.")}
              hint={
                filtered
                  ? t("benchmark.Clear a filter to widen the search. Labels are self-reported, so they differ between configurations.")
                  : t("benchmark.Benchmarks run in the AioLM desktop app. Share a result to show it here.")
              }
              action={filtered
                ? <button type="button" className="explorer-button" onClick={clearFilters}>{t("benchmark.Clear filters")}</button>
                : <Link className="empty-state-link" href={localizedPath(locale, "/guides/getting-started#benchmarks")}>{t("benchmark.How to measure and share")}</Link>}
            />
          ) : null}
          {data && items.length > 0 ? (
            <div className="explorer-results">
              <p className="explorer-result-note">{t("benchmark.These are user-shared measurements. Compare the model, hardware and test conditions.")}</p>
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
                disabled={!data?.next_cursor || nextRequestBlocked}
              >{t("benchmark.Next page")}</button>
            </nav>
          ) : null}
        </section>

        <details className="explorer-guide">
        <summary><span id="explorer-guide-title" className="explorer-guide-title">{t("benchmark.Compare like for like")}</span></summary>
        <p className="explorer-guide-text">{t("benchmark.Match the model fingerprint, hardware, workload and measurement method before reading anything into a difference. Results published with a different method or workload measured different work.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Common API measurements use client-observed timing and UTF-8 output bytes, including reasoning. Historical output-cap token counters are optional and are not decode timing. Cache is as configured.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Fixed-output results are the default scope: every request reported exactly the requested output tokens, so output tokens per second compare like for like only at the same method and operating point. Historical output-cap results keep their own scope and are never mixed with fixed output.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Each metric shows the shared point median, range and observed sample count. Missing measurements stay unknown; neither bytes nor missing token counters are converted to tokens.")}</p>
        <p className="explorer-guide-text">{t("benchmark.Serving points require input UTF-8 bytes, concurrency and output tokens together. Legacy token points remain in the explicit legacy scope. Configured input filters do not claim that every point completed.")}</p>
        <p className="explorer-guide-text">{t("benchmark.A missing measurement is shown as an em dash (—), never as a zero. Sorting does not make different setups directly comparable.")}</p>
        </details>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { BilingualHeader } from "./benchmark-i18n";
import type { BenchmarkPoint } from "@/lib/benchmark-points";
import {
  formatDuration,
  formatPointLabel,
  formatPromptLength,
  formatSecondsSpread,
  formatLatency,
  formatLatencySpread,
  formatThroughput,
  formatThroughputSpread,
} from "./benchmark-explorer-format";

/**
 * What this result measured, point by point.
 *
 * A run sweeps input lengths against concurrencies, and speed moves with both:
 * prefill and decode at a 512-token prompt describe a different situation from
 * the same run at 16K, and a rate measured with four requests in flight is not
 * the rate a single request saw. One headline per result would have to pick or
 * blend; blending describes nothing, so the reader picks, and the table below
 * shows the whole sweep so the shape of the decline is visible at a glance.
 *
 * Each row is the median of that point's repetitions with the range they
 * covered, so a point measured once and a point whose repetitions disagreed
 * cannot look alike.
 */

function samePoint(point: BenchmarkPoint, other: BenchmarkPoint): boolean {
  return point.prompt_tokens === other.prompt_tokens
    && point.concurrency === other.concurrency
    && point.generation_length === other.generation_length;
}

export function BenchmarkPointsPanel({
  points,
  truncated = false,
}: {
  points: readonly BenchmarkPoint[];
  truncated?: boolean;
}): React.JSX.Element {
  const { locale, t } = useI18n();
  // Selection is an index: two points can share an input length and concurrency
  // while differing in generation length, and an index names one of them exactly.
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (points.length === 0) {
    return (
      <p className="muted detail-points-empty">
        {t("benchmark.This result published no measurement that names an operating point, so there is no speed to report.")}
      </p>
    );
  }

  const index = Math.min(selectedIndex, points.length - 1);
  const selected = points[index]!;
  const lengths = [...new Set(points.map((point) => point.prompt_tokens))];
  const concurrencies = [...new Set(points.filter((point) => point.prompt_tokens === selected.prompt_tokens).map((point) => point.concurrency))];
  // A generation length fixed for the whole run is a fact about the run, not a
  // column that repeats one number down the table.
  const variedGeneration = new Set(points.map((point) => point.generation_length)).size > 1;

  const selectLength = (promptTokens: number): void => {
    // Keep the concurrency being read where the new input length also offers it.
    const preferred = points.findIndex((point) => point.prompt_tokens === promptTokens && point.concurrency === selected.concurrency);
    setSelectedIndex(preferred >= 0 ? preferred : points.findIndex((point) => point.prompt_tokens === promptTokens));
  };
  const selectConcurrency = (concurrency: number): void => {
    setSelectedIndex(points.findIndex((point) => point.prompt_tokens === selected.prompt_tokens && point.concurrency === concurrency));
  };

  const cards = [
    { key: "pp_tps", local: t("benchmark.Prefill"), en: "Prefill", unit: "tok/s", value: formatThroughput(selected.pp_tps?.median), spread: formatThroughputSpread(selected.pp_tps) },
    { key: "tg_tps", local: t("benchmark.Decode"), en: "Decode", unit: "tok/s", value: formatThroughput(selected.tg_tps?.median), spread: formatThroughputSpread(selected.tg_tps) },
    { key: "ttft_ms", local: t("benchmark.TTFT"), en: "TTFT", unit: "ms", value: formatLatency(selected.ttft_ms?.median), spread: formatLatencySpread(selected.ttft_ms) },
    { key: "e2e_ms", local: t("benchmark.End-to-end duration"), en: "Duration", unit: "s", value: formatDuration(selected.e2e_ms?.median), spread: formatSecondsSpread(selected.e2e_ms) },
  ];

  return (
    <div className="detail-points">
      <div className="detail-point-chips">
        <fieldset className="detail-chip-set">
          <legend className="detail-chip-legend">{t("benchmark.Input length")}</legend>
          <div className="detail-chip-row">
            {lengths.map((promptTokens) => (
              <button
                type="button"
                key={promptTokens}
                className={promptTokens === selected.prompt_tokens ? "detail-chip detail-chip-on" : "detail-chip"}
                aria-pressed={promptTokens === selected.prompt_tokens}
                onClick={() => selectLength(promptTokens)}
              >{formatPromptLength(promptTokens)}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="detail-chip-set">
          <legend className="detail-chip-legend">{t("benchmark.Concurrency")}</legend>
          <div className="detail-chip-row">
            {concurrencies.map((concurrency) => (
              <button
                type="button"
                key={concurrency}
                className={concurrency === selected.concurrency ? "detail-chip detail-chip-on" : "detail-chip"}
                aria-pressed={concurrency === selected.concurrency}
                onClick={() => selectConcurrency(concurrency)}
              >{concurrency}</button>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="muted detail-point-reading" role="status">
        {t("benchmark.Reading {point}, generating {generation} tokens, over {samples} repetitions.", {
          point: formatPointLabel(selected.prompt_tokens, selected.concurrency),
          generation: String(selected.generation_length),
          samples: String(selected.samples),
        })}
      </p>

      <div className="detail-performance-grid">
        {cards.map((card) => (
          <div className="detail-metric-card" key={card.key}>
            <BilingualHeader local={card.local} en={card.en} unit={card.unit} locale={locale} />
            <strong className="detail-metric-value">{card.value} <small>{card.unit}</small></strong>
            <span className="detail-metric-spread">
              {card.spread
                ? t("benchmark.{range} · n={samples}", { range: card.spread, samples: String(selected.samples) })
                : t("benchmark.n={samples}", { samples: String(selected.samples) })}
            </span>
          </div>
        ))}
      </div>

      <div className="detail-points-scroll" style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label={t("benchmark.Measured operating points")}>
        <table className="data detail-points-table">
          <caption className="detail-points-caption">
            {t("benchmark.Every operating point this result measured. Each value is the median of that point's repetitions, with the range they covered below it.")}
          </caption>
          <thead>
            <tr>
              <th scope="col"><BilingualHeader local={t("benchmark.Input length")} en="Input" unit={t("benchmark.tokens")} locale={locale} /></th>
              <th scope="col"><BilingualHeader local={t("benchmark.Concurrency")} en="Concurrency" locale={locale} /></th>
              {variedGeneration ? <th scope="col"><BilingualHeader local={t("benchmark.Generation length")} en="Generation" unit={t("benchmark.tokens")} locale={locale} /></th> : null}
              <th scope="col" className="detail-num"><BilingualHeader local={t("benchmark.Repetitions")} en="n" locale={locale} /></th>
              <th scope="col" className="detail-num"><BilingualHeader local={t("benchmark.Prefill")} en="Prefill" unit="tok/s" locale={locale} /></th>
              <th scope="col" className="detail-num"><BilingualHeader local={t("benchmark.Decode")} en="Decode" unit="tok/s" locale={locale} /></th>
              <th scope="col" className="detail-num"><BilingualHeader local={t("benchmark.TTFT")} en="TTFT" unit="ms" locale={locale} /></th>
              <th scope="col" className="detail-num"><BilingualHeader local={t("benchmark.End-to-end duration")} en="Duration" unit="s" locale={locale} /></th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, position) => (
              <tr key={position} className={samePoint(point, selected) ? "detail-point-row detail-point-row-on" : "detail-point-row"}>
                <th scope="row" className="detail-point-pick">
                  <button
                    type="button"
                    className="detail-point-select"
                    aria-pressed={samePoint(point, selected)}
                    onClick={() => setSelectedIndex(position)}
                  >{formatPromptLength(point.prompt_tokens)}</button>
                </th>
                <td>{point.concurrency}</td>
                {variedGeneration ? <td>{point.generation_length}</td> : null}
                <td className="detail-num">{point.samples}</td>
                <MeasuredCell value={formatThroughput(point.pp_tps?.median)} spread={formatThroughputSpread(point.pp_tps)} />
                <MeasuredCell value={formatThroughput(point.tg_tps?.median)} spread={formatThroughputSpread(point.tg_tps)} />
                <MeasuredCell value={formatLatency(point.ttft_ms?.median)} spread={formatLatencySpread(point.ttft_ms)} />
                <MeasuredCell value={formatDuration(point.e2e_ms?.median)} spread={formatSecondsSpread(point.e2e_ms)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncated ? (
        <p className="muted detail-points-truncated">
          {t("benchmark.This run measured more points than are stored with the result; the longest inputs are not listed here. The individual measurements below still carry every row.")}
        </p>
      ) : null}
    </div>
  );
}

function MeasuredCell({ value, spread }: { value: string; spread: string | null }): React.JSX.Element {
  return (
    <td className="detail-num">
      <span className="detail-point-value">{value}</span>
      {spread === null ? null : <span className="detail-point-spread">{spread}</span>}
    </td>
  );
}

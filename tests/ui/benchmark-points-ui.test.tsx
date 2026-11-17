import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { createTranslator } from "@/i18n/translate";
import en from "@/i18n/messages/benchmark/en";
import { BenchmarkExplorerTable } from "@/components/benchmark-explorer-table";
import { ServingBenchmarkPointsPanel } from "@/components/benchmark-detail-points";
import { formatServingPointLabel } from "@/components/benchmark-explorer-format";
import type { ExplorerItem } from "@/components/benchmark-explorer-state";
import { summarizeServingPoints } from "@/lib/benchmark-points";
import { summarizeBenchmark } from "@/lib/summary";
import { syntheticSubmission } from "@/lib/fixtures";
import type { PublicBenchmarkSubmission } from "@aiolm/benchmark-contracts";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

const t = createTranslator(en);
const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="en" messages={en}>{node}</I18nProvider>);

type Row = PublicBenchmarkSubmission["measurements"]["rows"][number];
const base = syntheticSubmission();
const baseRow = base.measurements.rows[0]!;
const rows = (overrides: Array<Partial<Row>>): Row[] => overrides.map((override) => ({ ...baseRow, ...override }));

/** A result whose stored summary is built from the rows it actually measured. */
function item(id: string, measured: Array<Partial<Row>>): ExplorerItem {
  const inputs = [...new Set(measured.map((row) => row.input_bytes ?? baseRow.input_bytes))]
    .map((bytes) => ({ bytes, sha256: "a".repeat(64) }));
  const submission = syntheticSubmission({
    workload: { ...base.workload, inputs },
    measurements: { status: "complete", rows: rows(measured) },
  });
  return { public_id: id, revision: 1, created_at: "2026-01-02T03:04:05.000Z", summary: summarizeBenchmark(submission) };
}

const wide = item("wide", [
  { input_bytes: 512, first_output_ms: 20, output_bytes: 12, e2e_ms: 200 },
  { input_bytes: 4096, first_output_ms: 70, output_bytes: 6, e2e_ms: 200 },
]);
const narrow = item("narrow", [{ input_bytes: 512, first_output_ms: 50, output_bytes: 30, e2e_ms: 200 }]);

const setupLine = (bytes: number) =>
  t("benchmark.{bytes} B input · {concurrency} requests · max {tokens} output tokens", { bytes, concurrency: 1, tokens: 128 });

describe("reading a list at one operating point", () => {
  it("reports each result's own leading point when no basis is named", () => {
    const html = render(<BenchmarkExplorerTable items={[wide, narrow]} compare={[]} onToggleComparison={() => {}} />);
    // The leading point is the shortest input at the lowest concurrency.
    expect(html).toContain("20.0 ms");
    expect(html).toContain("60.0 B/s");
    expect(html).toContain("50.0 ms");
    expect(html).toContain("150.0 B/s");
    expect(html).toContain(setupLine(512));
    expect(html).toContain(t("benchmark.{count} measurements", { count: 1 }));
    // The other measured point is neither averaged in nor shown as the headline.
    expect(html).not.toContain("70.0 ms");
    expect(html).not.toContain("30.0 B/s");
  });

  it("reads every row at the basis point and names the gap when a row never measured it", () => {
    const html = render(
      <BenchmarkExplorerTable items={[wide, narrow]} compare={[]} basis={{ input_bytes: 4096, concurrency: 1, max_output_tokens: 128 }} onToggleComparison={() => {}} />,
    );
    expect(html).toContain("70.0 ms");
    expect(html).toContain("30.0 B/s");
    expect(html).toContain(setupLine(4096));
    // The result that never measured 4K reports the gap instead of its 512 value.
    expect(html).toContain(t("benchmark.Not measured at this point"));
    expect(html).not.toContain("50.0 ms");
    expect(html).not.toContain("150.0 B/s");
  });

  it("shows the spread a median came from, and a metric sample count below the point's", () => {
    const spread = item("spread", [
      { input_bytes: 512, first_output_ms: 20, output_bytes: 2, e2e_ms: 100, repetition: 1 },
      { input_bytes: 512, first_output_ms: 20, output_bytes: 6, e2e_ms: 100, repetition: 2 },
    ]);
    const partial = item("partial", [
      { input_bytes: 512, first_output_ms: 20, output_bytes: 2, e2e_ms: 100, repetition: 1 },
      { input_bytes: 512, first_output_ms: 20, output_bytes: undefined, e2e_ms: 100, repetition: 2 },
    ]);
    const html = render(<BenchmarkExplorerTable items={[spread, partial]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain("40.0 B/s");
    expect(html).toContain("20.0 B/s–60.0 B/s · n=2");
    expect(html).toContain("n=1");
    expect(html).toContain(t("benchmark.{count} measurements", { count: 2 }));
    // A metric observed in every repetition has no range to print.
    expect(html).not.toContain("20.0 ms–20.0 ms");
    expect(html).not.toContain("20.0 B/s–20.0 B/s");
  });
});

describe("the points a result measured", () => {
  const points = summarizeServingPoints(rows([
    { input_bytes: 512, concurrency: 1, max_output_tokens: 128, repetition: 1, first_output_ms: 20, output_bytes: 2, e2e_ms: 100 },
    { input_bytes: 512, concurrency: 1, max_output_tokens: 128, repetition: 2, first_output_ms: 20, output_bytes: 6, e2e_ms: 100 },
    { input_bytes: 4096, concurrency: 4, max_output_tokens: 128, repetition: 1, first_output_ms: 50, output_bytes: 12, e2e_ms: 200 },
  ]));

  it("leads with one measured point and shows the whole sweep beside it", () => {
    const html = render(<ServingBenchmarkPointsPanel points={points} memoryScope="unavailable" requestUsage={false} />);
    // The headline is the leading point, stated rather than implied.
    expect(html).toContain(t("benchmark.Reading {point} over {samples} repetitions; output tokens are a requested maximum.", {
      point: formatServingPointLabel(512, 1, 128), samples: 2,
    }));
    expect(html).toContain("20.0–60.0 · n=2");
    expect(html).toContain("40.0");
    // Every point is listed, including the ones the headline is not showing.
    expect(html).toContain(formatServingPointLabel(4096, 4, 128));
    expect(html).toContain("50.0");
  });

  it("names missing usage and memory evidence instead of inventing numbers", () => {
    const requested = render(<ServingBenchmarkPointsPanel points={points} memoryScope="unavailable" requestUsage={false} />);
    expect(requested).toContain(t("benchmark.Usage not requested"));
    expect(requested).toContain(t("benchmark.Unavailable for this process scope"));
    expect(requested).not.toContain("NaN");
    expect(requested).not.toContain("Infinity");

    const optional = render(<ServingBenchmarkPointsPanel points={points} memoryScope="owned_process_tree" requestUsage={true} />);
    expect(optional).toContain(t("benchmark.Usage value not reported"));
    expect(optional).toContain(t("benchmark.Owned process tree"));
    expect(optional).toContain(t("benchmark.Measurement not reported"));
  });

  it("says a result named no point rather than showing an invented speed", () => {
    const html = render(<ServingBenchmarkPointsPanel points={[]} memoryScope="unavailable" />);
    expect(html).toContain("no measurement that names an operating point");
  });
});

describe("reading serving points in the list", () => {
  const summary = summarizeBenchmark({
    ...base,
    workload: { ...base.workload, repetitions: 2 },
    measurements: { status: "complete", rows: rows([
      { repetition: 1, output_bytes: 2, e2e_ms: 100 },
      { repetition: 2, output_bytes: 6, e2e_ms: 100 },
    ]) },
  });
  const serving: ExplorerItem = { public_id: "serving", revision: 1, created_at: "2026-01-02T03:04:05.000Z", summary };

  it("reads shared metric medians, ranges and metric sample counts without averaging points", () => {
    const html = render(<BenchmarkExplorerTable items={[serving]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain("40.0 B/s");
    expect(html).toContain("20.0 B/s–60.0 B/s · n=2");
    expect(html).toContain("20.0 ms");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("tok/s");
    expect(html).toContain("sglang");
  });

  it("keeps caps distinct rather than reading a different serving point", () => {
    const html = render(
      <BenchmarkExplorerTable items={[serving]} compare={[]} basis={{ input_bytes: 4096, concurrency: 1, max_output_tokens: 256 }} onToggleComparison={() => {}} />,
    );
    expect(html).toContain(t("benchmark.Not measured at this point"));
    expect(html).not.toContain("40.0 B/s");
    expect(html).not.toContain("20.0 ms");
  });

  it("keeps a known zero rate and a missing non-finite rate distinct", () => {
    const empty = summarizeBenchmark({
      ...base,
      measurements: { status: "complete", rows: rows([{ output_bytes: 0, e2e_ms: 200 }]) },
    });
    const tiny = summarizeBenchmark({
      ...base,
      measurements: { status: "complete", rows: rows([{ output_bytes: 1, e2e_ms: 1e-320 }]) },
    });
    expect(render(<BenchmarkExplorerTable items={[{ ...serving, summary: empty }]} compare={[]} onToggleComparison={() => {}} />)).toContain("0.0 B/s");
    const html = render(<BenchmarkExplorerTable items={[{ ...serving, summary: tiny }]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain(t("benchmark.Measurement not reported"));
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("0.0 B/s");
  });
});

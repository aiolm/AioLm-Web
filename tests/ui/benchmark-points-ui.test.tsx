import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import en from "@/i18n/messages/benchmark/en";
import { BenchmarkExplorerTable } from "@/components/benchmark-explorer-table";
import { BenchmarkPointsPanel } from "@/components/benchmark-detail-points";
import {
  basisPointOf,
  explorerReducer,
  explorerStateFromSearch,
  isPointSort,
  type ExplorerItem,
} from "@/components/benchmark-explorer-state";
import type { BenchmarkPoint } from "@/lib/benchmark-points";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<I18nProvider locale="en" messages={en}>{node}</I18nProvider>);

function point(promptTokens: number, concurrency: number, overrides: Partial<BenchmarkPoint> = {}): BenchmarkPoint {
  return {
    prompt_tokens: promptTokens, concurrency, generation_length: 128, samples: 3,
    pp_tps: { median: 1500, min: 1480, max: 1520 },
    tg_tps: { median: 70, min: 69, max: 71 },
    ttft_ms: { median: 340, min: 330, max: 350 },
    e2e_ms: { median: 6800, min: 6700, max: 6900 },
    ...overrides,
  };
}

function item(id: string, points: BenchmarkPoint[]): ExplorerItem {
  return {
    public_id: id, revision: 1, created_at: "2026-01-02T03:04:05.000Z",
    summary: {
      model_label: `model-${id}`, hardware_label: "synthetic-gpu", method_label: "m@1", workload_label: "code_python",
      row_count: points.length * 3, failed_rows: 0, status: "complete",
      // Numbers that appear nowhere on the page: reading a mean again would show.
      mean_tg_tps: 999, mean_e2e_ms: 999, mean_pp_tps: 999,
      points,
    },
  };
}

const wide = item("wide", [
  point(512, 1, { tg_tps: { median: 85.4, min: 85, max: 86 } }),
  point(4096, 1, { tg_tps: { median: 61.2, min: 60, max: 62 } }),
]);
const narrow = item("narrow", [point(512, 1, { tg_tps: { median: 90.1, min: 90, max: 91 } })]);

describe("reading a list at one operating point", () => {
  it("reports each result's own leading point when no basis is named", () => {
    const html = render(<BenchmarkExplorerTable items={[wide, narrow]} compare={[]} onToggleComparison={() => {}} />);
    // The leading point is the shortest input at the lowest concurrency.
    expect(html).toContain("85.4");
    expect(html).toContain("90.1");
    expect(html).toContain("512 / c1 · n=3");
    expect(html).toContain("Each row reports its own leading operating point");
    // The mixed means are stored but never shown.
    expect(html).not.toContain("999");
  });

  it("reads every row at the basis point and names it on the speed columns", () => {
    const html = render(
      <BenchmarkExplorerTable items={[wide, narrow]} compare={[]} basis={{ prompt_tokens: 4096, concurrency: 1 }} onToggleComparison={() => {}} />,
    );
    expect(html).toContain("61.2");
    expect(html).toContain('<span class="explorer-head-basis">4K / c1</span>');
    expect(html).toContain("each read at 4K / c1");
    // The result that never measured 4K reports the gap instead of its 512 value.
    expect(html).toContain("Not measured at this point");
    expect(html).not.toContain("90.1");
  });

  it("shows the spread a median came from, and leaves it off when there is none", () => {
    const single = item("single", [point(512, 1, { samples: 1, tg_tps: { median: 70, min: 70, max: 70 } })]);
    const html = render(<BenchmarkExplorerTable items={[wide, single]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain('<span class="explorer-metric-spread">85.0–86.0</span>');
    expect(html).toContain("512 / c1 · n=1");
    // A point whose repetitions all landed on one value prints no range of one number.
    expect(html).not.toContain("70.0–70.0");
  });

  it("lists which points a result measured, so a gap is explainable", () => {
    const html = render(<BenchmarkExplorerTable items={[wide]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain("512 / c1 · 4K / c1");
  });
});

describe("naming the basis in the address", () => {
  const at = (search: string) => explorerStateFromSearch(search).applied;

  it("keeps a whole basis point and drops half of one", () => {
    expect(basisPointOf(at("point_tokens=4096&point_concurrency=1"))).toEqual({ prompt_tokens: 4096, concurrency: 1 });
    for (const half of ["point_tokens=4096", "point_concurrency=1", "point_tokens=abc&point_concurrency=1"]) {
      expect(basisPointOf(at(half))).toBeNull();
      expect(at(half).point_tokens).toBe("");
    }
  });

  it("repairs a stale address instead of forwarding a request the API would reject", () => {
    // A link that ranks speed with no point to rank at falls back to the default order.
    expect(at("sort=throughput_desc").sort).toBe("");
    expect(at("sort=throughput_desc&point_tokens=512&point_concurrency=1").sort).toBe("throughput_desc");
    // point_only narrows to the basis, so it cannot outlive one.
    expect(at("point_only=1").point_only).toBe("");
    expect(isPointSort("throughput_desc")).toBe(true);
    expect(isPointSort("context_desc")).toBe(false);
  });

  it("drops what the basis carried when the basis is cleared", () => {
    const selected = explorerStateFromSearch("point_tokens=512&point_concurrency=1&point_only=1&sort=duration_asc");
    const cleared = explorerReducer(selected, { type: "basisPoint", value: "" });
    expect(cleared.applied.point_tokens).toBe("");
    expect(cleared.applied.point_only).toBe("");
    expect(cleared.applied.sort).toBe("");
    expect(cleared.cursor).toBeNull();
    // Ranking measured speed is refused until a point is named again.
    expect(explorerReducer(cleared, { type: "sort", value: "throughput_desc" }).applied.sort).toBe("");
    expect(explorerReducer(cleared, { type: "sort", value: "context_desc" }).applied.sort).toBe("context_desc");
  });
});

describe("the points a result measured", () => {
  const points = [
    point(512, 1, { tg_tps: { median: 85.4, min: 85, max: 86 } }),
    point(512, 4, { tg_tps: { median: 61.2, min: 60, max: 62 } }),
    point(4096, 1, { samples: 1, tg_tps: { median: 52.6, min: 52.6, max: 52.6 } }),
  ];

  it("leads with one measured point and shows the whole sweep beside it", () => {
    const html = render(<BenchmarkPointsPanel points={points} />);
    // The headline is the leading point, stated rather than implied.
    expect(html).toContain("Reading 512 / c1, generating 128 tokens, over 3 repetitions.");
    expect(html).toContain("85.0–86.0 · n=3");
    // Every point is listed, including the ones the headline is not showing.
    expect(html).toContain("52.6");
    expect(html).toContain("61.2");
    expect(html).toContain("4K");
    // The generation length is fixed for this run, so it is not a column of one repeated number.
    expect(html).not.toContain("Generation</span>");
  });

  it("offers the concurrencies the selected input length actually measured", () => {
    const html = render(<BenchmarkPointsPanel points={points} />);
    const chips = html.slice(html.indexOf("detail-point-chips"), html.indexOf("detail-point-reading"));
    expect(chips).toContain(">512<");
    expect(chips).toContain(">4K<");
    expect(chips).toContain(">1<");
    expect(chips).toContain(">4<");
  });

  it("adds a generation length column only when the run varied it", () => {
    const varied = [point(512, 1), { ...point(512, 1), generation_length: 512 }];
    expect(render(<BenchmarkPointsPanel points={varied} />)).toContain("Generation</span>");
  });

  it("says a result named no point rather than showing an invented speed", () => {
    const html = render(<BenchmarkPointsPanel points={[]} />);
    expect(html).toContain("no measurement that names an operating point");
    expect(html).not.toContain("detail-performance-grid");
  });

  it("says when the stored points were cut", () => {
    expect(render(<BenchmarkPointsPanel points={points} truncated />)).toContain("more points than are stored");
    expect(render(<BenchmarkPointsPanel points={points} />)).not.toContain("more points than are stored");
  });
});

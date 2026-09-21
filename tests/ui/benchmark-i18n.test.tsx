import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { locales, type Locale } from "@/i18n/config";
import { createTranslator } from "@/i18n/translate";
import type { MessageCatalog } from "@/i18n/types";
import en from "@/i18n/messages/benchmark/en";
import ko from "@/i18n/messages/benchmark/ko";
import ja from "@/i18n/messages/benchmark/ja";
import zh from "@/i18n/messages/benchmark/zh";
import commonEn from "@/i18n/messages/common/en";
import commonKo from "@/i18n/messages/common/ko";
import commonJa from "@/i18n/messages/common/ja";
import commonZh from "@/i18n/messages/common/zh";
import { BenchmarkBrowser } from "@/components/benchmark-browser";
import { BenchmarkExplorerTable } from "@/components/benchmark-explorer-table";
import { BenchmarkExplorerComparison } from "@/components/benchmark-explorer-comparison";
import { BenchmarkDetail } from "@/components/benchmark-detail";
import { BenchmarkHardwareOverview } from "@/components/benchmark-hardware-overview";
import { buildSetupGroups, type BenchmarkSetup } from "@/components/benchmark-detail-fields";
import { buildRowColumns, isFailedRow } from "@/components/benchmark-detail-rows";
import { describeGpu, formatByteSize, displayText } from "@/components/benchmark-detail-format";
import { formatThroughput, formatDuration } from "@/components/benchmark-explorer-format";
import { EXPLORER_FILTER_KEYS, EXPLORER_FILTER_LABELS, EXPLORER_FILTER_PLACEHOLDERS, type ExplorerItem } from "@/components/benchmark-explorer-state";
import BenchmarksPage, { generateMetadata } from "@/app/[locale]/benchmarks/page";
import BenchmarkPage, { generateMetadata as detailMetadata } from "@/app/[locale]/benchmarks/[id]/page";

const catalogs: Record<Locale, MessageCatalog> = { en, ko, ja, zh };
const common: Record<Locale, MessageCatalog> = { en: commonEn, ko: commonKo, ja: commonJa, zh: commonZh };
const state = vi.hoisted(() => ({ search: "model=synthetic-model&hardware=synthetic-device&cursor=abc_123", data: null as unknown, error: null as string | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search), notFound: () => { throw new Error("not-found"); } }));
vi.mock('@/server/public-benchmark', () => ({ getPublicBenchmark: async () => ({ state: 'public', data: { id: item.public_id, benchmark, summary: item.summary, description_md: '', revision: 1, created_at: item.created_at, updated_at: item.created_at } }) }));
vi.mock("@/i18n/server", () => ({ getMessages: async (locale: Locale) => catalogs[locale] }));
vi.mock("@/components/ui", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/ui")>(),
  useJsonFetch: () => ({ data: state.data, error: state.error, reload: () => {} }),
}));
/**
 * The point values are what the pages must show. The mean_* fields carry
 * numbers that appear nowhere else, so a page that fell back to averaging the
 * whole grid again would print 999 and fail here rather than pass quietly.
 */
const point = (prompt_tokens: number, concurrency: number, tg: number, pp: number) => ({
  prompt_tokens, concurrency, generation_length: 128, samples: 3,
  pp_tps: { median: pp, min: pp - 1, max: pp + 1 },
  tg_tps: { median: tg, min: tg - 1, max: tg + 1 },
  ttft_ms: { median: 340, min: 310, max: 360 },
  e2e_ms: { median: 1234.6, min: 1200, max: 1300 },
});
const item: ExplorerItem = {
  public_id: "synthetic-id", revision: 1, created_at: "2026-01-02T03:04:05.000Z",
  summary: { model_label: "synthetic-model", hardware_label: "synthetic-device", method_label: "cold-prompt-serving@1", workload_label: "code_python", row_count: 12, failed_rows: 2, status: "partial", mean_tg_tps: 999, mean_e2e_ms: 999, mean_pp_tps: 999, prompt_lengths: [8192, 512, 4096], points: [point(512, 1, 42.25, 128.75), point(4096, 1, 21.5, 96.5)], points_truncated: false },
};
const benchmark = {
  model: { status: "identified", sha256: "synthetic-checksum", size_bytes: 2048 },
  runtime: { name: "synthetic-runtime", backend: "synthetic-backend" },
  method: { id: "cold-prompt-serving", version: 1 }, workload: { corpus: "code_python", prompt_lengths: [128] },
  environment: { os: "synthetic-os", cpu: { name: "synthetic-cpu", logical_cores: 4 }, execution: { mode: "gpu", selection_complete: true, selected_gpus: [{ name: "synthetic-device", vendor: "synthetic-vendor", integrated: false }] } },
  execution: { settings: { flash_attention: "auto", cache_type_k: "q8_0" } }, app_version: "0.0.0", status: "partial",
};
const wrap = (locale: Locale, node: React.ReactNode) => renderToStaticMarkup(<I18nProvider locale={locale} messages={{ ...common[locale], ...catalogs[locale] }}>{node}</I18nProvider>);
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(x => x[1]).sort();
beforeEach(() => { state.data = null; state.error = null; vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", ""); });

afterEach(() => vi.unstubAllEnvs());

describe.each(locales)("benchmark localization: %s", locale => {
  const t = createTranslator(catalogs[locale]);
  it("has exactly the English key shape and interpolation placeholders", () => {
    expect(Object.keys(catalogs[locale]).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(catalogs[locale])) {
      expect(value.trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(catalogs.en[key]));
    }
    for (const value of [...Object.values(EXPLORER_FILTER_LABELS), ...Object.values(EXPLORER_FILTER_PLACEHOLDERS)]) expect(catalogs[locale]).toHaveProperty("benchmark." + value);
  });
  it("renders localized filters, accessible removal labels, and a locale-prefixed form before hydration", () => {
    const html = wrap(locale, <BenchmarkBrowser />);
    expect(html).toContain('action="/' + locale + '/benchmarks"');
    expect(html).toContain(escape(t("benchmark.Filters")));
    expect(html).toContain(escape(t("benchmark.Remove the {filter} filter", { filter: t("benchmark.Model fingerprint") })));
    expect(html).toContain('value="synthetic-model"');
    for (const key of EXPLORER_FILTER_KEYS) expect(html).toContain('name="' + key + '"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(escape(t("benchmark.Max input length (tokens)")));
    expect(html).toContain(escape(t("benchmark.Input length: high to low")));
    expect(html).toContain(escape(t("benchmark.Matches the largest input length a result was configured with, not the total context the server allocated.")));
    expect(html).toContain(escape(t("benchmark.GPU name or vendor")));
    expect(html).not.toContain("benchmark.");
  });
  it("renders localized empty and error states", () => {
    state.data = { items: [], next_cursor: null };
    expect(wrap(locale, <BenchmarkBrowser />)).toContain(escape(t("benchmark.No results match these filters.")));
    state.data = null;
    state.error = common[locale]["error.notFound"];
    const html = wrap(locale, <BenchmarkDetail publicId={item.public_id} />);
    expect(html).toContain(escape(t("benchmark.Not available.")));
    expect(html).toContain(escape(state.error));
    expect(html).toContain('role="alert"');
  });
  it("renders localized summaries and comparison controls while retaining raw labels and query filters", () => {
    const html = wrap(locale, <><BenchmarkExplorerTable items={[item]} compare={[]} onToggleComparison={() => {}} /><BenchmarkExplorerComparison items={[item, { ...item, public_id: "other", summary: { ...item.summary, method_label: "different-method" } }]} onRemove={() => {}} onClear={() => {}} /></>);
    expect(html).toContain('/' + locale + '/benchmarks/synthetic-id?model=synthetic-model&amp;hardware=synthetic-device&amp;cursor=abc_123');
    expect(html).toContain(escape(t("benchmark.Add {model} on {hardware} to the comparison", { model: "synthetic-model", hardware: "synthetic-device" })));
    expect(html).toContain(escape(t("benchmark.Measurement count: {value}", { value: "12" })));
    expect(html).not.toContain(escape(t("benchmark.{total} ({failed} failed)", { total: 12, failed: 2 })));
    expect(html).toContain("cold-prompt-serving@1");
    expect(html).toContain("code_python");
    expect(html).toContain("42.3");
    expect(html).toContain("128.8");
    expect(html).toContain(escape(t("benchmark.Prefill (tok/s)")));
    expect(html).toContain(escape(t("benchmark.Decode (tok/s)")));
    expect(html).toContain(escape(t("benchmark.Input context: {value}", { value: "512 · 4K · 8K" })));
    expect(html).not.toContain("benchmark.");
  });
  it("renders every configured input length and never borrows the server context allocation", () => {
    const summary = { ...item.summary, setup: {
      os: "synthetic-os", arch: null, cpu: null, cores: 4, vendors: [], gpus: [], vram_mb: null,
      runtime: "synthetic-runtime", runtime_version: "1.0", backend: null, mode: null,
      context_size: 16896, parallel: null, threads: null, gpu_layers: null, flash_attention: null,
      cache_type_k: null, cache_type_v: null, split_mode: null,
    } };
    const html = wrap(locale, <BenchmarkExplorerTable items={[{ ...item, summary }]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain("synthetic-os");
    expect(html).toContain("synthetic-runtime 1.0");
    expect(html).toContain(escape(t("benchmark.Input context: {value}", { value: "512 · 4K · 8K" })));
    expect(html).not.toContain("explorer-fact-value\">4<");
    expect(html).not.toContain("MiB");
    // An unreported list stays unreported: the allocated context measures something else.
    const unreported = wrap(locale, <BenchmarkExplorerTable items={[{ ...item, summary: { ...summary, prompt_lengths: undefined } }]} compare={[]} onToggleComparison={() => {}} />);
    expect(unreported).toContain(escape(t("benchmark.Input context: {value}", { value: t("benchmark.Unknown") })));
    expect(unreported).not.toContain("16896");
  });
  it("renders detail setup, UTC updates, common reporting UI, and a filtered return link", () => {
    state.data = { ...item, id: item.public_id, benchmark, description_md: "Synthetic user text", updated_at: item.created_at };
    const html = wrap(locale, <BenchmarkDetail publicId={item.public_id} />);
    expect(html).toContain('/' + locale + '/benchmarks?model=synthetic-model&amp;hardware=synthetic-device&amp;cursor=abc_123');
    expect(html).toContain(escape(t("benchmark.Input context")));
    expect(html).toContain(escape(t("benchmark.Prefill")));
    expect(html).toContain("Prefill");
    expect(html).toContain("detail-hardware-grid");
    expect(html).toContain("System RAM");
    expect(html).toContain(escape(t("benchmark.Test setup (as reported)")));
    // Installed but unselected devices are never shown, so the label no longer
    // exists in any catalog; the literal is what a regression would reintroduce.
    expect(html).not.toContain("Installed graphics");
    expect(html).toContain(escape(t("benchmark.Selected graphics")));
    expect(html).toContain("UTC");
    expect(html).toContain("Synthetic user text");
    expect(html).toContain("q8_0");
    expect(html).toContain("auto");
    expect(html).not.toMatch(/(?:benchmark\.|report\.|turnstile\.)/);
  });
  it("localizes empty and failed measurement descriptions without altering values or enums", () => {
    expect(displayText(null, t)).toBe(t("benchmark.Unknown"));
    expect(displayText("unidentified", t)).toBe("unidentified");
    expect(formatByteSize(12, t)).toBe("12 B");
    expect(describeGpu({ name: "synthetic-device", integrated: false }, t)).toContain(t("benchmark.No"));
    expect(buildSetupGroups(benchmark, t)[0].title).toBe(t("benchmark.Model"));
    const columns = buildRowColumns([{ failed: true, tg_tps: 42.25, timing_source: "server", synthetic_extra: true }], t, true);
    expect(columns.find(x => x.key === "failed")).toBeUndefined();
    expect(columns.find(x => x.key === "tg_tps")?.unit).toBe(t("benchmark.tok/s"));
    expect(columns.find(x => x.key === "timing_source")?.format("server")).toBe("server");
    expect(columns.find(x => x.key === "synthetic_extra")?.label).toBe("synthetic_extra");
    expect(columns.find(x => x.key === "synthetic_extra")?.format(true)).toBe(t("benchmark.Yes"));
    expect(isFailedRow({ failed: true })).toBe(true);
  });
  it("renders locale routes and advertises canonical locale alternates", async () => {
    const params = Promise.resolve({ locale, id: item.public_id });
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toEqual({ absolute: `${t('benchmark.Benchmark explorer')} · AioLM` });
    expect(metadata.alternates?.canonical).toBe('/' + locale + '/benchmarks');
    expect((await detailMetadata({ params })).alternates?.canonical).toBe('/' + locale + '/benchmarks/synthetic-id');
    expect(wrap(locale, await BenchmarksPage({ params }))).toContain(escape(t("benchmark.Benchmark explorer")));
    expect(wrap(locale, await BenchmarkPage({ params }))).toContain(escape(t("benchmark.Loading benchmark…")));
  });
  it("uses deterministic measurement precision", () => {
    expect(formatThroughput(42.25)).toBe("42.3");
    expect(formatDuration(null)).toBe("—");
  });
});
it("has catalog entries for every literal benchmark UI key", () => {
  for (const name of fs.readdirSync(new URL("../../src/components/", import.meta.url)).filter(name => name.startsWith("benchmark") && /\.tsx?$/.test(name))) {
    const source = fs.readFileSync(new URL("../../src/components/" + name, import.meta.url), "utf8");
    for (const match of source.matchAll(/"(benchmark\.[^"]+)"/g)) expect(catalogs.en, name + ": " + match[1]).toHaveProperty(match[1]);
  }
});
it("rejects unsupported benchmark route locales", async () => {
  const params = Promise.resolve({ locale: "unsupported", id: item.public_id });
  await expect(BenchmarksPage({ params })).rejects.toThrow("not-found");
  await expect(BenchmarkPage({ params })).rejects.toThrow("not-found");
});

it("keeps the clear control in the layout while it is inactive, so Search never moves", () => {
  const filtered = state.search;
  try {
    state.search = "";
    const unfiltered = wrap("en", <BenchmarkBrowser />);
    expect(unfiltered).toContain("explorer-button-reserved");
    expect(unfiltered).toContain(en["benchmark.Clear filters"]);
    state.search = filtered;
    expect(wrap("en", <BenchmarkBrowser />)).not.toContain("explorer-button-reserved");
  } finally {
    state.search = filtered;
  }
});

it("renders each GPU on a separate line when multiple GPUs are configured", () => {
  const multiGpuItem: ExplorerItem = {
    ...item,
    public_id: "multi-gpu-id",
    summary: {
      ...item.summary,
      hardware_label: "NVIDIA GeForce RTX 4090 + NVIDIA GeForce RTX 3090",
        setup: {
          os: "synthetic-os", arch: "x86_64", cpu: "synthetic-cpu", cores: 8,
          vendors: ["NVIDIA"], gpus: ["NVIDIA GeForce RTX 4090", "NVIDIA GeForce RTX 3090"], vram_mb: 49152,
          runtime: "vllm", runtime_version: "0.6.2", backend: "cuda", mode: "gpu",
          context_size: 8192, parallel: 1, threads: 1, gpu_layers: null,
          flash_attention: "auto", cache_type_k: "f16", cache_type_v: "f16", split_mode: null,
        },
    },
  };
  const html = wrap("en", <BenchmarkExplorerTable items={[multiGpuItem]} compare={[]} onToggleComparison={() => {}} />);
  expect(html).toContain("explorer-gpu-list");
  expect(html).toContain('<span class="explorer-gpu-item">NVIDIA GeForce RTX 4090</span>');
  expect(html).toContain('<span class="explorer-gpu-item">NVIDIA GeForce RTX 3090</span>');
});

it("renders single GPU cleanly without wrapping in multi-gpu list", () => {
  const html = wrap("en", <BenchmarkExplorerTable items={[item]} compare={[]} onToggleComparison={() => {}} />);
  expect(html).not.toContain("explorer-gpu-list");
  expect(html).toContain("synthetic-device");
});

it("renders multiple GPUs from hardware_label split when setup.gpus is missing", () => {
  const fallbackItem: ExplorerItem = {
    ...item,
    public_id: "multi-gpu-fallback",
    summary: {
      ...item.summary,
      hardware_label: "GPU Alpha + GPU Beta",
      setup: undefined,
    },
  };
  const html = wrap("en", <BenchmarkExplorerTable items={[fallbackItem]} compare={[]} onToggleComparison={() => {}} />);
  expect(html).toContain("explorer-gpu-list");
  expect(html).toContain('<span class="explorer-gpu-item">GPU Alpha</span>');
  expect(html).toContain('<span class="explorer-gpu-item">GPU Beta</span>');
});

it("aggregates duplicate identical GPUs into count x N in explorer table", () => {
  const duplicateItem: ExplorerItem = {
    ...item,
    public_id: "duplicate-gpu-item",
    summary: {
      ...item.summary,
      hardware_label: "NVIDIA GeForce RTX 4090 + NVIDIA GeForce RTX 4090",
      setup: {
        os: "synthetic-os", arch: "x86_64", cpu: "synthetic-cpu", cores: 8,
        vendors: ["NVIDIA"], gpus: ["NVIDIA GeForce RTX 4090"], vram_mb: 49152,
        runtime: "vllm", runtime_version: "0.6.2", backend: "cuda", mode: "gpu",
        context_size: 8192, parallel: 1, threads: 1, gpu_layers: null,
        flash_attention: "auto", cache_type_k: "f16", cache_type_v: "f16", split_mode: null,
      },
    },
  };
  const html = wrap("en", <BenchmarkExplorerTable items={[duplicateItem]} compare={[]} onToggleComparison={() => {}} />);
  expect(html).toContain("NVIDIA GeForce RTX 4090 x 2");
  expect(html).not.toContain("explorer-gpu-list");
});

it("renders mixed duplicate and single GPUs with one distinct GPU type per line", () => {
  const mixedItem: ExplorerItem = {
    ...item,
    public_id: "mixed-gpu-item",
    summary: {
      ...item.summary,
      hardware_label: "NVIDIA GeForce RTX 4090 + NVIDIA GeForce RTX 4090 + NVIDIA GeForce RTX 3090",
      setup: {
        os: "synthetic-os", arch: "x86_64", cpu: "synthetic-cpu", cores: 8,
        vendors: ["NVIDIA"], gpus: ["NVIDIA GeForce RTX 4090", "NVIDIA GeForce RTX 3090"], vram_mb: 73728,
        runtime: "vllm", runtime_version: "0.6.2", backend: "cuda", mode: "gpu",
        context_size: 8192, parallel: 1, threads: 1, gpu_layers: null,
        flash_attention: "auto", cache_type_k: "f16", cache_type_v: "f16", split_mode: null,
      },
    },
  };
  const html = wrap("en", <BenchmarkExplorerTable items={[mixedItem]} compare={[]} onToggleComparison={() => {}} />);
  expect(html).toContain("explorer-gpu-list");
  expect(html).toContain('<span class="explorer-gpu-item">NVIDIA GeForce RTX 4090 x 2</span>');
  expect(html).toContain('<span class="explorer-gpu-item">NVIDIA GeForce RTX 3090</span>');
});

it("BenchmarkHardwareOverview aggregates identical GPUs, formats CPU topology, and falls back to runtime.build", () => {
  const gpu = { name: "RTX 4090", vendor: "NVIDIA", vram_mb: 24576, driver: "550", integrated: false };
  const benchmarkWithHardware = {
    ...benchmark,
    environment: {
      os: "Ubuntu 24.04", arch: "x86_64",
      cpu: { name: "Ryzen 9 7950X", physical_cores: 16, logical_cores: 32 },
      execution: { mode: "selected", selected_gpus: [gpu, gpu] },
      system_memory_bytes: 68719476736,
    },
    runtime: { name: "llama.cpp", version: null, build: 3560, backend: "cuda" },
  };
  const html = wrap("en", <BenchmarkHardwareOverview benchmark={benchmarkWithHardware as unknown as BenchmarkSetup} />);
  expect(html).toContain("RTX 4090 x 2");
  expect(html).toContain("16 Core / 32 Thread");
  expect(html).toContain("llama.cpp (build 3560)");
  expect(html).toContain("64.00 GiB");
});

it("BenchmarkDetail does not render Load measurements button and includes measurements section", () => {
  state.data = {
    id: "synthetic-id",
    benchmark,
    summary: item.summary,
    description_md: "",
    revision: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  const html = wrap("en", <BenchmarkDetail publicId="synthetic-id" initialData={state.data as unknown as Parameters<typeof BenchmarkDetail>[0]["initialData"]} />);
  expect(html).not.toContain("Load measurements");
  expect(html).toContain("Measurements");
});


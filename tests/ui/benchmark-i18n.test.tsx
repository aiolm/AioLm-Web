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
import type { ExplorerItem } from "@/components/benchmark-explorer-state";
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
beforeEach(() => { state.data = null; state.error = null; vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", ""); });

afterEach(() => vi.unstubAllEnvs());

describe.each(locales)("benchmark localization: %s", locale => {
  const t = createTranslator(catalogs[locale]);
  it("preserves filter values, accessible inputs and the locale-prefixed form before hydration", () => {
    const html = wrap(locale, <BenchmarkBrowser />);
    expect(html).toContain('action="/' + locale + '/benchmarks"');
    expect(html).toContain('value="synthetic-model"');
    for (const key of ["model_query", "runtime", "runtime_version", "model_format", "input_bytes_min", "max_output_tokens_max", "warmup", "request_usage", "sort"]) expect(html).toContain('name="' + key + '"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('type="hidden" form="explorer-filter-form" name="sort" value="newest"');
    expect(html).toContain('name="hardware"');
    expect(html).toContain('value="synthetic-device"');
  });
  it("preserves the locale and query filters in result links", () => {
    const html = wrap(locale, <BenchmarkExplorerTable items={[item]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain('/' + locale + '/benchmarks/synthetic-id?model=synthetic-model&amp;hardware=synthetic-device&amp;cursor=abc_123');
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
    // An unreported list stays unreported: the allocated context measures something else.
    const unreported = wrap(locale, <BenchmarkExplorerTable items={[{ ...item, summary: { ...summary, prompt_lengths: undefined } }]} compare={[]} onToggleComparison={() => {}} />);
    expect(unreported).toContain(escape(t("benchmark.Input context: {value}", { value: t("benchmark.Unknown") })));
    expect(unreported).not.toContain("16896");
  });
  it("preserves reported detail values and a filtered return link", () => {
    state.data = { ...item, id: item.public_id, benchmark, description_md: "Synthetic user text", updated_at: item.created_at };
    const html = wrap(locale, <BenchmarkDetail publicId={item.public_id} />);
    expect(html).toContain('/' + locale + '/benchmarks?model=synthetic-model&amp;hardware=synthetic-device&amp;cursor=abc_123');
    expect(html).toContain("Synthetic user text");
    expect(html).toContain("q8_0");
    expect(html).toContain("auto");
  });
  it("renders locale routes and advertises canonical locale alternates", async () => {
    const params = Promise.resolve({ locale, id: item.public_id });
    const metadata = await generateMetadata({ params });
    expect(metadata.alternates?.canonical).toBe('/' + locale + '/benchmarks');
    expect((await detailMetadata({ params })).alternates?.canonical).toBe('/' + locale + '/benchmarks/synthetic-id');
  });
});
it("rejects unsupported benchmark route locales", async () => {
  const params = Promise.resolve({ locale: "unsupported", id: item.public_id });
  await expect(BenchmarksPage({ params })).rejects.toThrow("not-found");
  await expect(BenchmarkPage({ params })).rejects.toThrow("not-found");
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
  expect(html).toContain("GPU Alpha");
  expect(html).toContain("GPU Beta");
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
});

it("renders counts for duplicate GPUs alongside distinct GPUs", () => {
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
  expect(html).toContain("NVIDIA GeForce RTX 4090 x 2");
  expect(html).toContain("NVIDIA GeForce RTX 3090");
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
  expect(html).toContain("llama.cpp b3560");
  expect(html).toContain("64.00 GiB");
});

it.each([
  // A historical banner names the build that ran, so a stale fallback build never replaces it.
  { name: "llama.cpp", version: "version: 0.3.0-dev (build 10638, commit abc1234)", build: "b10600", label: "0.3.0-dev(10638)" },
  { name: "llama.cpp", version: "0.3.0-dev", build: "b10640", label: "0.3.0-dev(10640)" },
  { name: "llama.cpp", version: null, build: "b10638", label: "b10638" },
  { name: "vllm", version: "0.6.2", build: null, label: "0.6.2" },
  { name: "vllm", version: "0.30.0", build: null, variant: "vllm-metal", plugin_version: "0.30.0", label: "vllm-metal 0.30.0 · vLLM 0.30.0" },
  { name: "MLX", version: "mlx-lm 0.21.0", build: "local-7", label: "mlx-lm 0.21.0(local-7)" },
])("shows $name $version / $build as $label in the table, comparison, detail and environment overview", ({ name, version, build, label, variant, plugin_version }) => {
  const runtime = { name, version, build, backend: variant ? "metal" : "cuda", variant, plugin_version };
  const summary = { ...item.summary, setup: {
    os: "synthetic-os", arch: null, cpu: null, cores: null, vendors: [], gpus: [], vram_mb: null,
    runtime: name, runtime_version: version, runtime_build: build, backend: "cuda", mode: null,
    ...(variant ? { runtime_variant: variant, runtime_plugin_version: plugin_version } : {}),
    context_size: null, parallel: null, threads: null, gpu_layers: null, flash_attention: null,
    cache_type_k: null, cache_type_v: null, split_mode: null,
  } };
  const listed = { ...item, summary };
  expect(wrap("en", <BenchmarkExplorerTable items={[listed]} compare={[]} onToggleComparison={() => {}} />)).toContain(escape(`${name} ${label}`));
  expect(wrap("en", <BenchmarkExplorerComparison items={[listed, { ...listed, public_id: "other" }]} onRemove={() => {}} onClear={() => {}} />)).toContain(escape(`${name} ${label} · cuda`));
  const detail = { ...benchmark, runtime } as unknown as BenchmarkSetup;
  const fields = buildSetupGroups(detail).flatMap((group) => group.fields);
  expect(fields.find((field) => field.label === "Runtime version")?.value).toBe(label);
  expect(wrap("en", <BenchmarkHardwareOverview benchmark={detail} />)).toContain(escape(`${name} ${label}`));
});

it("names an unrecorded runtime version as unknown on the detail page", () => {
  const detail = { ...benchmark, runtime: { name: "llama.cpp", version: null, build: null, backend: null } } as unknown as BenchmarkSetup;
  for (const locale of locales) {
    const fields = buildSetupGroups(detail, createTranslator(catalogs[locale])).flatMap((group) => group.fields);
    expect(fields.find((field) => field.label === createTranslator(catalogs[locale])("benchmark.Runtime version"))?.value).toBe(createTranslator(catalogs[locale])("benchmark.Unknown"));
  }
});


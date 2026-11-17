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
import { syntheticSubmission } from "@/lib/fixtures";
import { summarizeBenchmark } from "@/lib/summary";

const catalogs: Record<Locale, MessageCatalog> = { en, ko, ja, zh };
const common: Record<Locale, MessageCatalog> = { en: commonEn, ko: commonKo, ja: commonJa, zh: commonZh };
const state = vi.hoisted(() => ({ search: "model=synthetic-model&hardware=synthetic-device&cursor=abc_123", data: null as unknown, error: null as string | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search), notFound: () => { throw new Error("not-found"); } }));
vi.mock('@/server/public-benchmark', () => ({ getPublicBenchmark: async () => ({ state: 'public', data: { id: item.public_id, benchmark: submission, summary: item.summary, description_md: '', revision: 1, created_at: item.created_at, updated_at: item.created_at } }) }));
vi.mock("@/i18n/server", () => ({ getMessages: async (locale: Locale) => catalogs[locale] }));
vi.mock("@/components/ui", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/ui")>(),
  useJsonFetch: () => ({ data: state.data, error: state.error, reload: () => {} }),
}));

const submission = syntheticSubmission();
const summary = {
  ...summarizeBenchmark(submission),
  model_label: "synthetic-model",
  hardware_label: "synthetic-device",
  method_label: "openai-chat-serving@5",
  workload_label: "code_python",
};
const item: ExplorerItem = {
  public_id: "synthetic-id", revision: 1, created_at: "2026-01-02T03:04:05.000Z", summary,
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
    for (const key of ["model_query", "runtime", "runtime_version", "model_format", "input_bytes_min", "max_output_tokens_max", "warmup", "request_usage"]) expect(html).toContain('name="' + key + '"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('name="hardware"');
    expect(html).toContain('value="synthetic-device"');
  });
  it("renders the selected token-throughput sort without exposing an internal translation key", () => {
    const previousSearch = state.search;
    try {
      state.search = "sort=token_rate_desc&point_bytes=4096&point_concurrency=1&point_max_tokens=128";
      state.data = { items: [item], next_cursor: null };
      const html = wrap(locale, <BenchmarkBrowser />);
      expect(html).toContain(escape(t("benchmark.Total token throughput at the basis point: fastest first")));
      expect(html).not.toContain("benchmark.");
    } finally {
      state.search = previousSearch;
    }
  });
  it("names the single serving method and Cold Prompt cap semantics without inventing token usage", () => {
    const browser = wrap(locale, <BenchmarkBrowser />);
    expect(browser).toContain("openai-chat-serving@5");
    expect(browser).toContain(escape(t("benchmark.Cold Prompt")));
    const table = wrap(locale, <BenchmarkExplorerTable items={[item]} compare={[]} onToggleComparison={() => {}} />);
    expect(table).toContain("60.0 B/s");
    expect(table).not.toContain("tok/s</");
    const fields = buildSetupGroups({ ...submission, status: submission.measurements.status }, t).flatMap(group => group.fields);
    expect(fields.find(field => field.label === t("benchmark.Maximum output token request"))?.value).toBe("128");
    expect(fields.find(field => field.label === t("benchmark.Warmup"))?.value).toBe(t("benchmark.No"));
    expect(fields.find(field => field.label === t("benchmark.Request usage"))?.value).toBe(t("benchmark.No"));
    expect(fields.find(field => field.label === t("benchmark.Cache policy"))?.value).toBe(t("benchmark.Cold Prompt"));
    expect(fields.find(field => field.label === t("benchmark.Prompt nonce"))?.value).toBe(submission.workload.prompt_nonce);
  });
  it("preserves the locale and query filters in result links", () => {
    const html = wrap(locale, <BenchmarkExplorerTable items={[item]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain('/' + locale + '/benchmarks/synthetic-id?model=synthetic-model&amp;hardware=synthetic-device&amp;cursor=abc_123');
  });
  it("reads the measured operating point and its sample count, never a configured context allocation", () => {
    const html = wrap(locale, <BenchmarkExplorerTable items={[item]} compare={[]} onToggleComparison={() => {}} />);
    expect(html).toContain(escape(t("benchmark.{bytes} B input · {concurrency} requests · max {tokens} output tokens", { bytes: 4096, concurrency: 1, tokens: 128 })));
    expect(html).toContain(escape(t("benchmark.{count} measurements", { count: 1 })));
    // The allocated server context says nothing about what this run measured.
    expect(html).not.toContain("16896");
  });
  it("preserves reported detail values and a filtered return link", () => {
    state.data = { id: item.public_id, benchmark: submission, summary: item.summary, description_md: "Synthetic user text", revision: 1, created_at: item.created_at, updated_at: item.created_at };
    const html = wrap(locale, <BenchmarkDetail publicId={item.public_id} />);
    expect(html).toContain('/' + locale + '/benchmarks?model=synthetic-model&amp;hardware=synthetic-device&amp;cursor=abc_123');
    expect(html).toContain("Synthetic user text");
    expect(html).toContain("max_tokens");
    expect(html).toContain("stream");
    expect(html).toContain("temperature");
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
      setup: { ...item.summary.setup, gpus: undefined } as unknown as ExplorerItem["summary"]["setup"],
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
        ...item.summary.setup,
        os: "synthetic-os", arch: "x86_64", cpu: "synthetic-cpu", cores: 8,
        vendors: ["NVIDIA"], gpus: ["NVIDIA GeForce RTX 4090"], vram_mb: 49152,
        runtime: "vllm", runtime_version: "0.6.2", backend: "cuda", mode: "gpu",
        execution_selection_complete: true,
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
        ...item.summary.setup,
        os: "synthetic-os", arch: "x86_64", cpu: "synthetic-cpu", cores: 8,
        vendors: ["NVIDIA"], gpus: ["NVIDIA GeForce RTX 4090", "NVIDIA GeForce RTX 3090"], vram_mb: 73728,
        runtime: "vllm", runtime_version: "0.6.2", backend: "cuda", mode: "gpu",
        execution_selection_complete: true,
      },
    },
  };
  const html = wrap("en", <BenchmarkExplorerTable items={[mixedItem]} compare={[]} onToggleComparison={() => {}} />);
  expect(html).toContain("NVIDIA GeForce RTX 4090 x 2");
  expect(html).toContain("NVIDIA GeForce RTX 3090");
});

it("BenchmarkHardwareOverview aggregates identical GPUs, formats CPU topology, and falls back to runtime.build", () => {
  const gpu = { name: "RTX 4090", vendor: "NVIDIA", vram_mb: 24576, driver: "550", integrated: false };
  const benchmarkWithHardware = syntheticSubmission({
    environment: {
      scope: "aiolm_host", os: "Ubuntu 24.04", arch: "x86_64",
      cpu: { name: "Ryzen 9 7950X", physical_cores: 16, logical_cores: 32 },
      system_memory_bytes: 68719476736,
      installed_gpus: [gpu, gpu],
      execution: { mode: "selected", selected_gpus: [gpu], selection_complete: true },
    },
    runtime: { name: "llama.cpp", version: null, build: "3560", backend: "cuda", variant: null, plugin_version: null },
  });
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
  const runtime = { name, version, build, backend: variant ? "metal" : "cuda", variant: variant ?? null, plugin_version: plugin_version ?? null };
  const benchmark = syntheticSubmission({ runtime });
  const listed = { ...item, summary: summarizeBenchmark(benchmark) };
  const engineLine = [name, version].filter(Boolean).join(" ");
  expect(wrap("en", <BenchmarkExplorerTable items={[listed]} compare={[]} onToggleComparison={() => {}} />)).toContain(escape(`${name} · ${runtime.backend}`));
  expect(wrap("en", <BenchmarkExplorerComparison items={[listed, { ...listed, public_id: "other" }]} onRemove={() => {}} onClear={() => {}} />)).toContain(escape(`${engineLine} · ${runtime.backend}`));
  const fields = buildSetupGroups(benchmark as unknown as BenchmarkSetup).flatMap((group) => group.fields);
  expect(fields.find((field) => field.label === "Engine version")?.value).toBe(version ?? "Unknown");
  expect(fields.find((field) => field.label === "Runtime build")?.value).toBe(build ?? "Unknown");
  expect(wrap("en", <BenchmarkHardwareOverview benchmark={benchmark as unknown as BenchmarkSetup} />)).toContain(escape(`${name} ${label}`));
});

it("names an unrecorded engine version as unknown and separates engine and runtime labels across locales on the detail page", () => {
  const detail = syntheticSubmission({
    runtime: { name: "vllm", version: null, build: "b100", variant: "vllm-metal", plugin_version: "0.30.0", backend: "metal" },
  }) as unknown as BenchmarkSetup;
  for (const locale of locales) {
    const t = createTranslator(catalogs[locale]);
    const fields = buildSetupGroups(detail, t).flatMap((group) => group.fields);
    expect(fields.find((field) => field.label === t("benchmark.runtime"))?.value).toBe("vllm");
    expect(fields.find((field) => field.label === t("benchmark.runtimeVersion"))?.value).toBe(t("benchmark.Unknown"));
    expect(fields.find((field) => field.label === t("benchmark.Runtime variant"))?.value).toBe("vllm-metal");
    expect(fields.find((field) => field.label === t("benchmark.Runtime build"))?.value).toBe("b100");
    expect(fields.find((field) => field.label === t("benchmark.Runtime plugin version"))?.value).toBe("0.30.0");
  }
});

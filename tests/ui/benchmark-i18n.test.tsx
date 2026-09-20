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
import { buildSetupGroups } from "@/components/benchmark-detail-fields";
import { buildRowColumns } from "@/components/benchmark-detail-rows";
import { describeGpu, formatByteSize, displayText } from "@/components/benchmark-detail-format";
import { formatUpdatedDate, formatPublishedDate, formatThroughput, formatDuration } from "@/components/benchmark-explorer-format";
import { EXPLORER_FILTER_LABELS, EXPLORER_FILTER_PLACEHOLDERS, type ExplorerItem } from "@/components/benchmark-explorer-state";
import BenchmarksPage, { generateMetadata } from "@/app/[locale]/benchmarks/page";
import BenchmarkPage, { generateMetadata as detailMetadata } from "@/app/[locale]/benchmarks/[id]/page";

const catalogs: Record<Locale, MessageCatalog> = { en, ko, ja, zh };
const common: Record<Locale, MessageCatalog> = { en: commonEn, ko: commonKo, ja: commonJa, zh: commonZh };
const state = vi.hoisted(() => ({ search: "model=synthetic-model&hardware=synthetic-device&cursor=abc_123", data: null as unknown, error: null as string | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search), notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/i18n/server", () => ({ getMessages: async (locale: Locale) => catalogs[locale] }));
vi.mock("@/components/ui", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/ui")>(),
  useJsonFetch: () => ({ data: state.data, error: state.error, reload: () => {} }),
}));
const item: ExplorerItem = {
  public_id: "synthetic-id", revision: 1, created_at: "2026-01-02T03:04:05.000Z",
  summary: { model_label: "synthetic-model", hardware_label: "synthetic-device", method_label: "cold-prompt-serving@1", workload_label: "code_python", row_count: 12, failed_rows: 2, status: "partial", mean_tg_tps: 42.25, mean_e2e_ms: 1234.6 },
};
const benchmark = {
  model: { status: "identified", sha256: "synthetic-checksum", size_bytes: 2048 },
  runtime: { name: "synthetic-runtime", backend: "synthetic-backend" },
  method: { id: "cold-prompt-serving", version: 1 }, workload: { corpus: "code_python", prompt_lengths: [128] },
  environment: { os: "synthetic-os", cpu: { name: "synthetic-cpu", logical_cores: 4 }, installed_gpus: [{ name: "synthetic-device", vendor: "synthetic-vendor", integrated: false }], execution: { mode: "gpu", selection_complete: true } },
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
    expect(html).toContain('name="model"');
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
    expect(html).toContain(escape(t("benchmark.{total} ({failed} failed)", { total: 12, failed: 2 })));
    expect(html).toContain("cold-prompt-serving@1");
    expect(html).toContain("code_python");
    expect(html).toContain("partial");
    expect(html).toContain("42.3");
    expect(html).not.toContain("benchmark.");
  });
  it("renders detail setup, UTC updates, common reporting UI, and a filtered return link", () => {
    state.data = { ...item, id: item.public_id, benchmark, description_md: "Synthetic user text", updated_at: item.created_at };
    const html = wrap(locale, <BenchmarkDetail publicId={item.public_id} />);
    expect(html).toContain('/' + locale + '/benchmarks?model=synthetic-model&amp;hardware=synthetic-device&amp;cursor=abc_123');
    expect(html).toContain(escape(t("benchmark.Test setup (as reported)")));
    expect(html).toContain(escape(t("benchmark.Integrated")));
    expect(html).toContain(escape(t("benchmark.No")));
    expect(html).toContain("UTC");
    expect(html).toContain("Synthetic user text");
    expect(html).toContain("q8_0");
    expect(html).toContain("auto");
    expect(html).not.toMatch(/(?:benchmark\.|report\.|turnstile\.)/);
  });
  it("localizes empty and failed measurement descriptions without altering values or enums", () => {
    expect(displayText(null, t)).toBe(t("benchmark.Unknown"));
    expect(displayText("unidentified", t)).toBe("unidentified");
    expect(formatByteSize(12, t)).toBe(t("benchmark.{value} bytes", { value: 12 }));
    expect(describeGpu({ name: "synthetic-device", integrated: false }, t)).toContain(t("benchmark.No"));
    expect(buildSetupGroups(benchmark, t)[0].title).toBe(t("benchmark.Model and runtime"));
    const columns = buildRowColumns([{ failed: true, tg_tps: 42.25, timing_source: "server", synthetic_extra: true }], t);
    expect(columns.find(x => x.key === "failed")?.format(true)).toBe(t("benchmark.Failed"));
    expect(columns.find(x => x.key === "tg_tps")?.unit).toBe(t("benchmark.tok/s"));
    expect(columns.find(x => x.key === "timing_source")?.format("server")).toBe("server");
    expect(columns.find(x => x.key === "synthetic_extra")?.label).toBe("synthetic_extra");
    expect(columns.find(x => x.key === "synthetic_extra")?.format(true)).toBe(t("benchmark.Yes"));
  });
  it("renders locale routes and advertises canonical locale alternates", async () => {
    const params = Promise.resolve({ locale, id: item.public_id });
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe(t("benchmark.Benchmark explorer"));
    expect(metadata.alternates?.canonical).toBe('/' + locale + '/benchmarks');
    expect((await detailMetadata({ params })).alternates?.canonical).toBe('/' + locale + '/benchmarks/synthetic-id');
    expect(wrap(locale, await BenchmarksPage({ params }))).toContain(escape(t("benchmark.Benchmark explorer")));
    expect(wrap(locale, await BenchmarkPage({ params }))).toContain(escape(t("benchmark.Loading benchmark…")));
  });
  it("uses explicit UTC and locale for dates and deterministic measurement precision", () => {
    const options: Intl.DateTimeFormatOptions = { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" };
    const language = { en: "en-US", ko: "ko-KR", ja: "ja-JP", zh: "zh-CN" }[locale];
    expect(formatUpdatedDate(item.created_at, locale)).toBe(new Intl.DateTimeFormat(language, options).format(new Date(item.created_at)));
    expect(formatUpdatedDate("invalid", locale)).toBe("—");
    expect(formatPublishedDate("2026-01-02T01:00:00+09:00")).toBe("2026-01-01");
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

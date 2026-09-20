import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/i18n/client";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { localeAlternates } from "@/i18n/metadata";
import { BenchmarkBrowser } from "@/components/benchmark-browser";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(await getMessages(locale, "benchmark"));
  return { title: t("benchmark.Benchmark explorer"), description: t("benchmark.Explore self-reported AioLM benchmark results with the hardware, workload and measurement method they were produced with."), alternates: localeAlternates(locale, "/benchmarks") };
}
export default async function BenchmarksPage({ params }: Props): Promise<React.JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale, "benchmark");
  const t = createTranslator(messages);
  return <I18nProvider locale={locale} messages={messages}>
    <div className="site-shell page benchmark-page">
      <div className="page-intro">
        <div className="page-intro-copy">
          <h1 className="page-title">{t("benchmark.Benchmark explorer")}</h1>
          <p className="page-subtitle">{t("benchmark.Find results by model, hardware and setup.")}</p>
        </div>
        <p className="page-intro-note">{t("benchmark.Self-reported results")}</p>
      </div>
      <noscript>{t("benchmark.Enable JavaScript to load, filter and compare published benchmarks.")}</noscript>
      <Suspense fallback={<p role="status">{t("benchmark.Loading benchmark explorer…")}</p>}><BenchmarkBrowser /></Suspense>
    </div>
  </I18nProvider>;
}

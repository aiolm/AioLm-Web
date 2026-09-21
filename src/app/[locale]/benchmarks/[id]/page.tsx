import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/i18n/client";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { publicMetadata } from "@/lib/seo";
import { getPublicBenchmark } from "@/server/public-benchmark";
import { BenchmarkDetail } from "@/components/benchmark-detail";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(await getMessages(locale, "benchmark"));
  const result = await getPublicBenchmark(id);
  if (result.state === 'missing') notFound();
  if (result.state === 'hidden') return { title: t('benchmark.Benchmark result'), robots: { index: false, follow: false } };
  const summary = result.data.summary;
  return publicMetadata(locale, '/benchmarks/' + encodeURIComponent(id), `${summary.model_label} · ${summary.hardware_label} · AioLM`, `${t('benchmark.Self-reported results')}: ${summary.model_label}; ${summary.hardware_label}; ${summary.method_label}; ${summary.workload_label}.`);
}
export default async function BenchmarkPage({ params }: Props): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale, "benchmark");
  const t = createTranslator(messages);
  const result = await getPublicBenchmark(id);
  if (result.state === 'missing') notFound();
  return <I18nProvider locale={locale} messages={messages}>
    <Suspense fallback={<p role="status">{t("benchmark.Loading benchmark…")}</p>}><BenchmarkDetail key={id} publicId={id} initialData={result.state === 'public' ? result.data : null} /></Suspense>
  </I18nProvider>;
}

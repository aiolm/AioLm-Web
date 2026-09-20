import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/i18n/client";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/server";
import { createTranslator } from "@/i18n/translate";
import { localeAlternates } from "@/i18n/metadata";
import { BenchmarkDetail } from "@/components/benchmark-detail";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ locale: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(await getMessages(locale, "benchmark"));
  return { title: t("benchmark.Benchmark result"), alternates: localeAlternates(locale, "/benchmarks/" + encodeURIComponent(id)) };
}
export default async function BenchmarkPage({ params }: Props): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale, "benchmark");
  const t = createTranslator(messages);
  return <I18nProvider locale={locale} messages={messages}>
    <Suspense fallback={<p role="status">{t("benchmark.Loading benchmark…")}</p>}><BenchmarkDetail publicId={id} /></Suspense>
  </I18nProvider>;
}

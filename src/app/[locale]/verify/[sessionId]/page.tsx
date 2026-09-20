import type { Metadata } from "next";
import { createTranslator } from "@/i18n/translate";
import { notFound } from "next/navigation";
import { I18nProvider } from "@/i18n/client";
import { isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/server";
import { VerifyPanel } from "@/components/verify-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(await getMessages(locale, "management"));
  return { title: t("verify.title"), robots: { index: false, follow: false } };
}

export default async function Page({ params }: { params: Promise<{ locale: string; sessionId: string }> }): Promise<React.JSX.Element> {
  const { locale, sessionId } = await params;
  if (!isLocale(locale)) notFound();
  const messages = await getMessages(locale, "management");
  return <I18nProvider locale={locale} messages={messages}><VerifyPanel sessionId={sessionId} /></I18nProvider>;
}

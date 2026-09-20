import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getServiceOrigin } from '@/lib/env';
import { isLocale, locales } from '@/i18n/config';
import { getMessages } from '@/i18n/server';
import { createTranslator } from '@/i18n/translate';
import { I18nProvider } from '@/i18n/client';
import '../globals.css';
export function generateStaticParams() { return locales.map(locale => ({ locale })); }
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(await getMessages(locale, 'site'));
  return {
    metadataBase: new URL(getServiceOrigin()),
    title: { default: t('site.title'), template: '%s · AioLM' },
    description: t('site.description'),
    icons: { icon: '/favicon.png' },
  };
}
export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [site, common] = await Promise.all([getMessages(locale, 'site'), getMessages(locale, 'common')]);
  const t = createTranslator(site);
  return <html lang={locale}><body>
    <I18nProvider locale={locale} messages={{ ...site, ...common }}>
      <a className="skip-link" href="#main">{t('site.skip')}</a>
      <SiteHeader locale={locale} t={t} />
      <main id="main" tabIndex={-1}>{children}</main>
      <SiteFooter t={t} />
    </I18nProvider>
  </body></html>;
}

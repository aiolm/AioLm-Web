import type { Metadata } from 'next';
import { intlLocales, locales, localizedPath, type Locale } from '@/i18n/config';
import { localeAlternates } from '@/i18n/metadata';
import { getServiceOrigin } from '@/lib/env';

export function publicMetadata(locale: Locale, path: string, title: string, description: string): Metadata {
  const url = new URL(localizedPath(locale, path), getServiceOrigin()).href;
  return {
    title: { absolute: title }, description,
    alternates: localeAlternates(locale, path),
    openGraph: {
      type: 'website', siteName: 'AioLM', title, description, url,
      locale: intlLocales[locale].replace('-', '_'),
      alternateLocale: locales.filter(value => value !== locale).map(value => intlLocales[value].replace('-', '_')),
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'AioLM — Local models. One workspace.' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/opengraph-image'] },
  };
}

/** Prevent HTML script termination, including when text comes from a public submission. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

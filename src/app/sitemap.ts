import type { MetadataRoute } from 'next';
import { getServiceOrigin } from '@/lib/env';
import { locales, localizedPath } from '@/i18n/config';
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getServiceOrigin();
  return ['/', '/benchmarks'].flatMap(path => locales.map(locale => ({
    url: new URL(localizedPath(locale, path), origin).href,
    alternates: { languages: Object.fromEntries(locales.map(language => [language, new URL(localizedPath(language, path), origin).href])) },
  })));
}

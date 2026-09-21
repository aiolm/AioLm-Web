import type { MetadataRoute } from 'next';
import { locales, localizedPath } from '@/i18n/config';
import { getServiceOrigin } from '@/lib/env';
import { getStore } from '@/server/store';

export const dynamic = 'force-dynamic';

/** Bounded recent-result discovery. Public list excludes hidden/deleted submissions. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { items } = await getStore().listRuns({}, 1000, null);
  const origin = getServiceOrigin();
  return items.flatMap(item => {
    const path = '/benchmarks/' + encodeURIComponent(item.public_id);
    const languages = Object.fromEntries(locales.map(locale => [locale, new URL(localizedPath(locale, path), origin).href]));
    return locales.map(locale => ({ url: languages[locale], lastModified: item.updated_at, alternates: { languages: { ...languages, 'x-default': languages.en } } }));
  });
}

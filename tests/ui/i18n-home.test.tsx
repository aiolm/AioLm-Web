/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { locales } from '@/i18n/config';
import type { MessageCatalog } from '@/i18n/types';
vi.mock('@/i18n/server', () => {
  const dictionaries = import.meta.glob<{ default: MessageCatalog }>('../../src/i18n/messages/*/*.ts', { eager: true });
  return { getMessages: async (locale: string, namespace: string) => dictionaries['../../src/i18n/messages/' + namespace + '/' + locale + '.ts'].default };
});
vi.mock('next/navigation', () => ({ usePathname: () => '/en', notFound: () => { throw new Error('NEXT_HTTP_ERROR_FALLBACK;404'); } }));
vi.mock('@/lib/env', () => ({ getServiceOrigin: () => 'https://example.invalid' }));
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import NotFound from '@/app/[locale]/not-found';
import MissingPage from '@/app/[locale]/[...missing]/page';
import Home, { generateMetadata as homeMetadata } from '@/app/[locale]/page';
import Layout from '@/app/[locale]/layout';

describe('localized static homepage', () => {
  it('advertises the canonical sitemap and excludes API and private pages from crawling', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/', disallow: ['/v1/', '/manage', '/verify/', ...locales.flatMap(locale => ['/' + locale + '/manage', '/' + locale + '/verify/'])] }, sitemap: ['https://example.invalid/sitemap.xml', 'https://example.invalid/benchmarks/sitemap.xml'] });
    expect(sitemap().map(entry => entry.url)).not.toContain('https://example.invalid/ko/guides/external-engines');
    expect(sitemap().map(entry => entry.url)).toContain('https://example.invalid/ko/guides/adapters');
    expect(sitemap().map(entry => entry.url)).toContain('https://example.invalid/zh/benchmarks');
    expect(sitemap().every(entry => Object.keys(entry.alternates?.languages ?? {}).length === 4)).toBe(true);
  });
  it.each(locales)('renders the %s document language, metadata and localized links on the server', async locale => {
    const params = Promise.resolve({ locale });
    const html = renderToStaticMarkup(await Layout({ params, children: await Home({ params }) }));
    expect(html).toContain('<html lang="' + locale + '"');
    expect(html).toContain('"operatingSystem":["Windows","macOS","Linux"]');
    expect(html).toContain(`href="/${locale}/guides/install#macos"`);
    expect(html).toContain(`href="/${locale}/guides/install#linux"`);
    expect(html).toContain(`href="/${locale}/guides"`);
    expect(html).not.toMatch(/href="[^"]*github[^\"]*(?:\.md|\/docs)/);
    expect(html).toContain('href="/' + locale + '/benchmarks"');
    expect(await homeMetadata({ params })).toMatchObject({ alternates: { canonical: '/' + locale, languages: { en: '/en', ko: '/ko', ja: '/ja', zh: '/zh' } } });
  });
  it.each(locales)('shows the %s visitor the real app screenshot that matches their color scheme', async locale => {
    const html = renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }));
    const picture = html.match(/<picture>.*?<\/picture>/)?.[0] ?? '';
    for (const [theme, tag] of [['dark', 'source'], ['light', 'img']] as const) {
      const image = picture.match(new RegExp(`<${tag} [^>]*>`))?.[0] ?? '';
      expect(image).toContain(encodeURIComponent(`/screenshots/current/home/${locale}/${theme}.png`));
    }
    expect(picture).toContain('media="(prefers-color-scheme: dark)"');
    expect(picture).toMatch(/<img [^>]*alt="[^"]+"/);
  });
  it.each(locales)('preserves the %s home destination on the not-found screen', async locale => {
    const params = Promise.resolve({ locale });
    const html = renderToStaticMarkup(await Layout({ params, children: <NotFound /> }));
    expect(html).toContain('href="/' + locale + '"');
    expect(() => MissingPage()).toThrow('404');
  });
  it('rejects unsupported locale pages before rendering', async () => {
    const params = Promise.resolve({ locale: 'fr' });
    await expect(Home({ params })).rejects.toThrow('404');
    await expect(Layout({ params, children: null })).rejects.toThrow('404');
    await expect(homeMetadata({ params })).rejects.toThrow('404');
  });
});

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
import Layout, { generateMetadata as layoutMetadata, generateStaticParams } from '@/app/[locale]/layout';
import { getMessages } from '@/i18n/server';

describe('localized static homepage', () => {
  it('advertises the canonical sitemap and excludes API and private pages from crawling', () => {
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/', disallow: ['/v1/', '/manage', '/verify/', ...locales.flatMap(locale => ['/' + locale + '/manage', '/' + locale + '/verify/'])] }, sitemap: ['https://example.invalid/sitemap.xml', 'https://example.invalid/benchmarks/sitemap.xml'] });
    expect(sitemap()).toHaveLength(8);
    expect(sitemap().map(entry => entry.url)).toContain('https://example.invalid/zh/benchmarks');
    expect(sitemap().every(entry => Object.keys(entry.alternates?.languages ?? {}).length === 4)).toBe(true);
  });
  it('enumerates exactly the supported locales for static generation', () => {
    expect(generateStaticParams()).toEqual(locales.map(locale => ({ locale })));
  });
  it.each(locales)('renders %s copy, document language, metadata and localized links on the server', async locale => {
    const params = Promise.resolve({ locale });
    const [messages, site, page] = await Promise.all([getMessages(locale, 'home'), getMessages(locale, 'site'), Home({ params })]);
    const html = renderToStaticMarkup(await Layout({ params, children: page }));
    expect(html).toContain('<html lang="' + locale + '" data-palette="13">');
    expect(html).toContain(messages['home.heroFirst']);
    expect(html).toContain(messages['home.windows']);
    expect(html).toContain(messages['home.linuxRequirements']);
    expect(html).toContain(messages['home.macosRequirements']);
    expect(html).toContain('"operatingSystem":["Windows","macOS","Linux"]');
    expect(html).toContain('releases/latest/download/install.sh | bash');
    expect(html).toContain(`href="https://github.com/aiolm/AioLM/blob/main/docs/guides/install${locale === 'en' ? '' : `.${locale}`}.md#macos"`);
    expect(html).toContain(`href="https://github.com/aiolm/AioLM/blob/main/docs/guides/install${locale === 'en' ? '' : `.${locale}`}.md#linux"`);
    expect(html).toContain(messages['home.choose']);
    expect(html).toContain(messages['home.caption']);
    expect(html).toContain('alt="' + messages['home.screenshotAlt'] + '"');
    expect(html).toContain('https://github.com/aiolm/AioLM/releases/latest/download/install.ps1 | iex');
    expect(html).toContain(site['site.skip']);
    expect(html).toContain('href="/' + locale + '/benchmarks"');
    expect(html).not.toMatch(/>(?:home|site)\.[a-zA-Z]+</);
    expect(await homeMetadata({ params })).toMatchObject({ alternates: { canonical: '/' + locale, languages: { en: '/en', ko: '/ko', ja: '/ja', zh: '/zh' } } });
    expect(await layoutMetadata({ params })).toMatchObject({ title: { default: site['site.title'] }, description: site['site.description'] });
  });
  it.each(locales)('shows the %s visitor the real app screenshot that matches their color scheme', async locale => {
    const html = renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }));
    const picture = html.match(/<picture>.*?<\/picture>/)?.[0] ?? '';
    expect(picture).toMatch(/<source media="\(prefers-color-scheme: dark\)" srcSet="[^"]*%2Fscreenshots%2Fproduct-models-en-dark\.png/);
    expect(picture).toMatch(/<img [^>]*src="[^"]*%2Fscreenshots%2Fproduct-models-en-light\.png/);
  });
  it.each(locales)('names each %s install platform once instead of repeating it in a badge', async locale => {
    const html = renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }));
    const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(match => match[1].replace(/<[^>]+>/g, ''));
    expect(tabs).toHaveLength(3);
    for (const [tab, platform] of tabs.map((tab, index) => [tab, ['Windows', 'macOS', 'Linux'][index]])) {
      expect(tab.split(platform)).toHaveLength(2);
    }
  });
  it.each(locales)('says in %s what the product name is short for, in prose and in structured data', async locale => {
    const params = Promise.resolve({ locale });
    const [home, site, page] = await Promise.all([getMessages(locale, 'home'), getMessages(locale, 'site'), Home({ params })]);
    const html = renderToStaticMarkup(await Layout({ params, children: page }));
    // A reader who asks what AioLM is gets the expansion in the answer itself,
    // and search results carry it too rather than only the initials.
    expect(home['home.faqWhatAnswer']).toContain('All-in-One LM');
    expect(site['site.description']).toContain('All-in-One LM');
    // An answer engine is told the two names belong together instead of having
    // to infer it from the prose.
    expect(html).toContain('"alternateName":"All-in-One LM"');
  });
  it.each(locales)('renders a localized %s not-found screen and document title', async locale => {
    const params = Promise.resolve({ locale });
    const site = await getMessages(locale, 'site');
    const html = renderToStaticMarkup(await Layout({ params, children: <NotFound /> }));
    expect(html).toContain('<title>' + site['site.notFound'] + ' · AioLM</title>');
    expect(html).toContain(site['site.notFoundDetail']);
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

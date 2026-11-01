/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { locales } from '@/i18n/config';
import { getGuides } from '@/content/guides';
import { guideSlugs } from '@/content/guides/types';
import config from '../../next.config';
import type { MessageCatalog } from '@/i18n/types';
vi.mock('@/i18n/server', () => {
  const dictionaries = import.meta.glob<{ default: MessageCatalog }>('../../src/i18n/messages/*/*.ts', { eager: true });
  return { getMessages: async (locale: string, namespace: string) => dictionaries['../../src/i18n/messages/' + namespace + '/' + locale + '.ts'].default };
});
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); } }));
vi.mock('@/lib/env', () => ({ getServiceOrigin: () => 'https://example.invalid' }));
import Guides from '@/app/[locale]/guides/page';
import GuidePage, { generateMetadata } from '@/app/[locale]/guides/[slug]/page';

describe('public product guides', () => {
  it.each(locales)('provides localized navigation, working anchors and accessible screenshots in %s', async locale => {
    const content = await getGuides(locale);
    const index = renderToStaticMarkup(await Guides({ params: Promise.resolve({ locale }) }));
    for (const slug of guideSlugs) expect(index).toContain(`href="#guide-${slug}"`);
    for (const slug of guideSlugs) {
      expect(index).toContain(`href="/${locale}/guides/${slug}"`);
      const params = Promise.resolve({ locale, slug });
      const html = renderToStaticMarkup(await GuidePage({ params }));
      expect(html).not.toMatch(/href="[^"]*github[^\"]*(?:\.md|\/docs)/);
      const sections = content.guides[slug].sections;
      expect(new Set(sections.map(section => section.id)).size).toBe(sections.length);
      for (const section of sections) {
        expect(html).toContain(`href="#${section.id}"`);
        expect(html).toContain(`id="${section.id}"`);
        for (const step of [section, ...(section.more ?? [])].filter(item => item.image)) {
          expect(html).toContain(`/screenshots/current/guides/${locale}/${step.image}.png`);
        }
      }
      expect(await generateMetadata({ params })).toMatchObject({
        alternates: { canonical: `/${locale}/guides/${slug}`, languages: Object.fromEntries(locales.map(value => [value, `/${value}/guides/${slug}`])) },
      });
    }
  });
  it('redirects the former engine catalog to the common file-selection guide', async () => {
    expect(await config('phase-production-build').redirects?.()).toEqual([{
      source: '/:locale(en|ko|ja|zh)/guides/external-engines',
      destination: '/:locale/guides/adapters#files',
      permanent: true,
    }]);
  });
  it.each(['missing', 'install.md', '__proto__'])('returns 404 for unknown guide %s', async slug => {
    await expect(GuidePage({ params: Promise.resolve({ locale: 'en', slug }) })).rejects.toThrow('404');
    await expect(generateMetadata({ params: Promise.resolve({ locale: 'en', slug }) })).rejects.toThrow('404');
  });
  it('returns 404 for unsupported languages', async () => {
    await expect(Guides({ params: Promise.resolve({ locale: 'fr' }) })).rejects.toThrow('404');
  });
});

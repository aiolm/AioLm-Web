import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { locales } from '@/i18n/config';
import { getGuides } from '@/content/guides';
import { guideSlugs } from '@/content/guides/types';
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); } }));
vi.mock('@/lib/env', () => ({ getServiceOrigin: () => 'https://example.invalid' }));
import Guides from '@/app/[locale]/guides/page';
import GuidePage, { generateMetadata } from '@/app/[locale]/guides/[slug]/page';

describe('public product guides', () => {
  it.each(locales)('provides complete internal navigation, working anchors and essential guidance in %s', async locale => {
    const content = await getGuides(locale);
    const index = renderToStaticMarkup(await Guides({ params: Promise.resolve({ locale }) }));
    for (const slug of guideSlugs) {
      expect(index).toContain(`href="/${locale}/guides/${slug}"`);
      const params = Promise.resolve({ locale, slug });
      const html = renderToStaticMarkup(await GuidePage({ params }));
      expect(html).toContain(content.guides[slug].title);
      expect(html).toContain('aria-current="page"');
      expect(html).not.toMatch(/href="[^"]*github[^\"]*(?:\.md|\/docs)/);
      const sections = content.guides[slug].sections;
      expect(new Set(sections.map(section => section.id)).size).toBe(sections.length);
      for (const section of sections) {
        expect(html).toContain(`href="#${section.id}"`);
        expect(html).toContain(`id="${section.id}"`);
      }
      expect(await generateMetadata({ params })).toMatchObject({
        alternates: { canonical: `/${locale}/guides/${slug}`, languages: Object.fromEntries(locales.map(value => [value, `/${value}/guides/${slug}`])) },
      });
      if (slug === 'compatibility') for (const engine of ['llama.cpp', 'vLLM', 'MLX', 'vllm-metal', 'F09']) expect(html).toContain(engine);
      if (slug === 'adapters') for (const text of ['Strata', 'TensorFold', 'custom.*', 'HTTP/SSE']) expect(html).toContain(text);
      if (slug === 'install') for (const text of ['checksums.txt', 'SHA-256', 'aarch64.dmg', 'x64.dmg', 'AIOLM_HOME', 'v0.3.1', 'v0.3.2']) expect(html).toContain(text);
      if (slug === 'getting-started') expect(html).toContain(content.screenshotCaption);
    }
  });
  it.each(['missing', 'install.md', '__proto__'])('returns 404 for unknown guide %s', async slug => {
    await expect(GuidePage({ params: Promise.resolve({ locale: 'en', slug }) })).rejects.toThrow('404');
    await expect(generateMetadata({ params: Promise.resolve({ locale: 'en', slug }) })).rejects.toThrow('404');
  });
  it('returns 404 for unsupported languages', async () => {
    await expect(Guides({ params: Promise.resolve({ locale: 'fr' }) })).rejects.toThrow('404');
  });
});

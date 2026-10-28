/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { locales } from '@/i18n/config';
import { getGuides } from '@/content/guides';
import { guideSlugs } from '@/content/guides/types';
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
  it.each(locales)('provides complete internal navigation, working anchors and essential guidance in %s', async locale => {
    const content = await getGuides(locale);
    for (const guide of Object.values(content.guides)) {
      expect(guide.title).not.toMatch(/Strata|TensorFold/);
      for (const section of guide.sections) {
        expect(section.title).not.toMatch(/Strata|TensorFold/);
        for (const row of section.table?.rows ?? []) expect(row[0]).not.toMatch(/Strata|TensorFold/);
      }
    }
    for (const example of ['Strata', 'TensorFold']) {
      expect(content.guides.adapters.description).toContain(example);
      expect(content.guides.compatibility.sections.find(section => section.table)?.table?.rows.at(-1)?.[1]).toContain(example);
    }
    const index = renderToStaticMarkup(await Guides({ params: Promise.resolve({ locale }) }));
    for (const slug of guideSlugs) {
      expect(index).toContain(`href="/${locale}/guides/${slug}"`);
      const params = Promise.resolve({ locale, slug });
      const html = renderToStaticMarkup(await GuidePage({ params }));
      expect(html).toContain(content.guides[slug].title);
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('class="guide-toc-region"');
      expect(html).toContain('class="guide-toc-mobile"');
      if (content.guides[slug].sections.some(section => section.image)) expect(html).toContain(content.screenshotNotice);
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
      if (slug === 'install') {
        for (const text of ['checksums.txt', 'SHA-256', 'aarch64.dmg', 'x64.dmg', 'AIOLM_HOME', 'v0.3.1', 'v0.3.2']) expect(html).toContain(text);
        expect(sections[0].id).toBe('commands');
        expect(html.indexOf('class="install-box"')).toBeLessThan(html.indexOf('class="guide-download-choices"'));
        const windows = html.slice(html.indexOf('id="windows"'), html.indexOf('id="macos"'));
        expect(windows).toContain('class="install-security-warning" role="note"');
        expect(windows.indexOf('install-security-warning')).toBeLessThan(windows.indexOf('guide-download-choices'));
      }
      if (slug === 'getting-started') {
        expect(sections.filter(section => section.image).length).toBeGreaterThanOrEqual(7);
        for (const section of sections.filter(section => section.image)) {
          expect(html).toContain(`/screenshots/guides/v0.3.2/${locale}/${section.image}.png`);
          expect(html).toContain(section.caption);
        }
      }
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

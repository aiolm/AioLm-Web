/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { locales } from '@/i18n/config';
import { getGuides } from '@/content/guides';
import { guideSlugs } from '@/content/guides/types';
import config from '../../next.config';
import type { MessageCatalog } from '@/i18n/types';
import { DESKTOP_RELEASE_VERSION } from '@/lib/desktop-release';
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
    expect(Object.keys(content.guides)).not.toContain('external-engines');
    expect(JSON.stringify(content)).not.toMatch(/Strata|TensorFold/);
    const index = renderToStaticMarkup(await Guides({ params: Promise.resolve({ locale }) }));
    expect(index).not.toContain('/guides/external-engines');
    expect(index).toContain('class="guide-toc-region"');
    expect(index).toContain('class="site-shell guide-layout guide-layout--article"');
    for (const slug of guideSlugs) expect(index).toContain(`href="#guide-${slug}"`);
    for (const slug of guideSlugs) {
      expect(index).toContain(`href="/${locale}/guides/${slug}"`);
      const params = Promise.resolve({ locale, slug });
      const html = renderToStaticMarkup(await GuidePage({ params }));
      expect(html).toContain(content.guides[slug].title);
      expect(html).toContain('aria-current="page"');
      expect(html).toContain('class="guide-toc-region"');
      expect(html).toContain('class="guide-toc-mobile"');
      if (content.guides[slug].sections.some(section => section.image || section.more?.some(detail => detail.image))) expect(html).toContain(content.screenshotNotice);
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
      if (slug === 'adapters') {
        expect(content.guides.adapters.description).toContain('v0.3.3');
        for (const text of ['custom.*', 'HTTP/SSE']) expect(html).toContain(text);
        expect(html).toContain(`/${locale}/guides/adapters#files`);
        const primaryIds = ['find', 'choose-model', 'connect'];
        const primary = sections.filter(section => primaryIds.includes(section.id));
        expect(primary.map(section => section.id)).toEqual(primaryIds);
        for (const section of primary) {
          expect(sections.indexOf(section)).toBeLessThan(sections.findIndex(item => item.id === 'files'));
          expect(section.table).toBeUndefined();
          expect(section.code).toBeUndefined();
        }
        const advanced = sections.find(section => section.id === 'advanced');
        const manualImages = ['adapter-add', 'adapter-setup', 'adapter-help', 'adapter-check', 'adapter-review'];
        expect(advanced?.more?.filter(detail => detail.image).map(detail => detail.image)).toEqual(manualImages);
        expect(sections.some(section => section.image && manualImages.includes(section.image))).toBe(false);
        const advancedHtml = html.slice(html.indexOf('id="advanced"'), html.indexOf('id="trouble"'));
        const collapsedDetails = [...advancedHtml.matchAll(/<details class="guide-more">[^]*?<\/details>/g)].map(match => match[0]);
        for (const image of manualImages) {
          expect(collapsedDetails.some(detail => detail.includes(`/${image}.png`))).toBe(true);
        }
        for (const detail of advanced?.more ?? []) {
          for (const step of detail.steps ?? []) expect(advancedHtml).toContain(step);
          if (detail.image) expect(advancedHtml).toContain(detail.caption);
        }
      }
      if (slug === 'install') {
        for (const text of ['checksums.txt', 'SHA-256', 'aarch64.dmg', 'x64.dmg', 'AIOLM_HOME', 'v0.3.1', 'v0.3.2']) expect(html).toContain(text);
        const releaseDownloads = [...html.matchAll(/href="https:\/\/github\.com\/aiolm\/AioLM\/releases\/download\/([^\"]+)"/g)].map(match => match[1]);
        expect(releaseDownloads).toEqual([
          `v${DESKTOP_RELEASE_VERSION}/AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe`,
          `v${DESKTOP_RELEASE_VERSION}/AioLM_${DESKTOP_RELEASE_VERSION}_aarch64.dmg`,
          `v${DESKTOP_RELEASE_VERSION}/AioLM_${DESKTOP_RELEASE_VERSION}_x64.dmg`,
          `v${DESKTOP_RELEASE_VERSION}/AioLM_${DESKTOP_RELEASE_VERSION}_amd64.deb`,
          `v${DESKTOP_RELEASE_VERSION}/AioLM_${DESKTOP_RELEASE_VERSION}_amd64.AppImage`,
          `v${DESKTOP_RELEASE_VERSION}/checksums.txt`,
        ]);
        expect(sections.find(section => section.id === 'verify')?.more?.[0].code).toContain(`AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe`);
        expect(sections.find(section => section.id === 'updates')?.caption).toContain('v0.3.2');
        expect(sections[0].id).toBe('commands');
        expect(html.indexOf('class="install-box"')).toBeLessThan(html.indexOf('class="guide-download-choices"'));
        const windows = html.slice(html.indexOf('id="windows"'), html.indexOf('id="macos"'));
        expect(windows).toContain('class="install-security-warning" role="note"');
        expect(windows.indexOf('install-security-warning')).toBeGreaterThan(windows.indexOf('guide-download-choices'));
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

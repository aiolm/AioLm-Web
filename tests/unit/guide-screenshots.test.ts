import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../../public/screenshots/guides/v0.3.2/manifest.json';
import automatic from '../../public/screenshots/guides/automatic-connection/manifest.json';
import { automaticGuideImageIds, releasedGuideImageIds, guideSlugs } from '@/content/guides/types';
import { getGuides } from '@/content/guides';
import { locales } from '@/i18n/config';

describe('localized guide screenshot evidence', () => {
  it('records the released captures and unreleased registration previews with matching integrity', () => {
    expect(manifest.commit).toBe('e439b52038142439c8c85b112d2949687fa273f2');
    expect(manifest.captures).toHaveLength(locales.length * releasedGuideImageIds.length);
    expect(manifest.captures.filter(item => 'source_commit' in item)).toHaveLength(4);
    expect(manifest.captures.filter(item => !('source_commit' in item))).toHaveLength(60);
    const files = manifest.captures.map(item => item.file);
    expect(new Set(files).size).toBe(files.length);
    for (const capture of manifest.captures) {
      expect(capture.file).toBe(`${capture.locale}/${capture.id}.png`);
      expect('source_commit' in capture).toBe(capture.id === 'adapter-setup');
      if ('source_commit' in capture) {
        expect(capture.source_commit).toMatch(/^[a-f0-9]{40}$/);
        expect(capture.source_commit).not.toBe(manifest.commit);
        expect('released' in capture && capture.released).toBe(false);
        expect('method' in capture && capture.method).toMatch(/unreleased/i);
      }
      const bytes = readFileSync(resolve('public/screenshots/guides/v0.3.2', capture.file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(capture.sha256);
      expect(bytes.readUInt32BE(16)).toBe(capture.width);
      expect(bytes.readUInt32BE(20)).toBe(capture.height);
      if (capture.focus) {
        expect(capture.focus.x).toBeGreaterThanOrEqual(0);
        expect(capture.focus.y).toBeGreaterThanOrEqual(0);
        expect(capture.focus.x + capture.focus.width).toBeLessThanOrEqual(100.01);
        expect(capture.focus.y + capture.focus.height).toBeLessThanOrEqual(100.01);
      }
    }
  });
  it('records automatic-connection previews separately from native or inference validation', () => {
    expect(automatic.released).toBe(false);
    expect(automatic.synthetic).toBe(true);
    expect(automatic.native_validation).toBe(false);
    expect(automatic.engine_inference).toBe(false);
    expect(automatic.source_base_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(automatic.source_diff_sha256).toMatch(/^[a-f0-9]{64}$/);
    if (automatic.source_commit === null) {
      expect(automatic.source_dirty).toBe(true);
    } else {
      expect(automatic.source_commit).toMatch(/^[a-f0-9]{40}$/);
      expect(automatic.source_dirty).toBe(false);
    }
    expect(automatic.source_files.length).toBeGreaterThan(0);
    for (const file of automatic.source_files) expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(automatic.captures).toHaveLength(locales.length * automaticGuideImageIds.length);
    const files = automatic.captures.map(item => item.file);
    expect(new Set(files).size).toBe(files.length);
    for (const capture of automatic.captures) {
      expect(capture.file).toBe(`${capture.locale}/${capture.id}.png`);
      expect(automaticGuideImageIds.some(id => id === capture.id)).toBe(true);
      const bytes = readFileSync(resolve('public/screenshots/guides/automatic-connection', capture.file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(capture.sha256);
      expect(bytes.readUInt32BE(16)).toBe(capture.width);
      expect(bytes.readUInt32BE(20)).toBe(capture.height);
    }
  });
  it.each(locales)('provides matching visual steps and captions in %s', async locale => {
    const [content, english] = await Promise.all([getGuides(locale), getGuides('en')]);
    for (const slug of guideSlugs) {
      const guide = content.guides[slug];
      expect(guide.sections.map(section => section.id)).toEqual(english.guides[slug].sections.map(section => section.id));
      const illustratedSteps = guide.sections.flatMap(section => [section, ...(section.more ?? [])]).filter(item => item.image);
      for (const step of illustratedSteps) {
        expect(step.caption?.trim()).toBeTruthy();
        expect([...manifest.captures, ...automatic.captures].some(item => item.locale === locale && item.id === step.image)).toBe(true);
      }
    }
  });
});

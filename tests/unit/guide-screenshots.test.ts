import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guideImageIds } from '@/content/guides/types';
import { locales } from '@/i18n/config';

const directory = 'public/screenshots/current';
const manifest = JSON.parse(readFileSync(`${directory}/manifest.json`, 'utf8')) as {
  captures: Array<{ locale: string; id: string; file: string; width: number; height: number; sha256: string }>;
};

describe('published screenshots', () => {
  it('provides exactly one image for every guide, locale and homepage theme', () => {
    const expected = locales.flatMap(locale => [
      ...guideImageIds.map(id => ({ locale, id, file: `guides/${locale}/${id}.png` })),
      ...(['light', 'dark'] as const).map(theme => ({ locale, id: `product-models-${theme}`, file: `home/${locale}/${theme}.png` })),
    ]);
    expect(manifest.captures.map(({ locale, id, file }) => ({ locale, id, file })).sort((a, b) => a.file.localeCompare(b.file)))
      .toEqual(expected.sort((a, b) => a.file.localeCompare(b.file)));
  });

  it('matches published PNG dimensions and cache hashes without leaving the image directory', () => {
    for (const capture of manifest.captures) {
      expect(isAbsolute(capture.file)).toBe(false);
      const path = resolve(directory, capture.file);
      expect(relative(resolve(directory), path)).not.toMatch(/^\.\.(?:[/\\]|$)/);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(capture.sha256);
      expect(capture.width).toBeGreaterThan(0);
      expect(capture.height).toBeGreaterThan(0);
      expect(bytes.readUInt32BE(16)).toBe(capture.width);
      expect(bytes.readUInt32BE(20)).toBe(capture.height);
    }
  });
});

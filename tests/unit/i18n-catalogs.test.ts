/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { createTranslator } from '@/i18n/translate';
import type { MessageCatalog } from '@/i18n/types';
import { locales } from '@/i18n/config';
const catalogs = import.meta.glob<{ default: MessageCatalog }>('../../src/i18n/messages/*/*.ts', { eager: true });
const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(match => match[1]).sort();
describe('translation catalogs', () => {
  for (const namespace of ['site', 'home', 'common', 'benchmark', 'management']) {
    it(namespace + ' has complete locale catalogs with matching placeholders', () => {
      const english = catalogs['../../src/i18n/messages/' + namespace + '/en.ts']?.default;
      expect(english).toBeDefined();
      for (const locale of locales) {
        const messages = catalogs['../../src/i18n/messages/' + namespace + '/' + locale + '.ts']?.default;
        expect(messages, namespace + '/' + locale).toBeDefined();
        expect(Object.keys(messages).sort()).toEqual(Object.keys(english).sort());
        for (const key of Object.keys(english)) {
          expect(messages[key].trim(), key).not.toBe('');
          expect(placeholders(messages[key]), key).toEqual(placeholders(english[key]));
        }
      }
    });
  }
  it('interpolates plain text without parsing HTML or recursively replacing user content', () => {
    const t = createTranslator({ greeting: 'Hello {name}, {count} runs; {name}', unchanged: '{missing}' });
    expect(t('greeting', { name: '<script>{count}</script>', count: 2 })).toBe('Hello <script>{count}</script>, 2 runs; <script>{count}</script>');
    expect(t('unchanged')).toBe('{missing}');
    expect(t('unknown')).toBe('unknown');
    expect(t('toString')).toBe('toString');
  });
});

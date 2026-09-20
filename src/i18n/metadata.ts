import type { Metadata } from 'next';
import { locales, localizedPath, type Locale } from './config';
export function localeAlternates(locale: Locale, path: string): Metadata['alternates'] {
  return {
    canonical: localizedPath(locale, path),
    languages: { ...Object.fromEntries(locales.map(language => [language, localizedPath(language, path)])), 'x-default': localizedPath('en', path) },
  };
}

export const locales = ['en', 'ko', 'ja', 'zh'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const intlLocales: Record<Locale, string> = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP', zh: 'zh-CN' };
export const localeCookie = 'aiolm_locale';
export function isLocale(value: string): value is Locale { return (locales as readonly string[]).includes(value); }
/** Accept local page paths only; preserve the query and fragment byte for byte. */
export function localizedPath(locale: Locale, path: string): string {
  const boundary = path.search(/[?#]/);
  const pathname = boundary < 0 ? path : path.slice(0, boundary);
  const suffix = boundary < 0 ? '' : path.slice(boundary);
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) throw new Error('Expected a same-origin page path');
  const parts = pathname.split('/');
  if (isLocale(parts[1])) parts.splice(1, 1);
  const rest = parts.join('/');
  return '/' + locale + (rest === '/' ? '' : rest) + suffix;
}

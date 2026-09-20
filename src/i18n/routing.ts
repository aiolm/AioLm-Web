import { defaultLocale, isLocale, locales, type Locale } from './config';
/** Only former public page routes negotiate. Unknown paths must stay real 404s. */
export function isLegacyPage(pathname: string): boolean {
  return /^\/(?:benchmarks(?:\/[^/.]+)?|manage|verify\/[^/.]+)?\/?$/.test(pathname);
}
/** RFC language ranges with stable quality ordering; malformed entries are ignored. */
export function negotiateLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (cookie && isLocale(cookie)) return cookie;
  const ranges = (acceptLanguage ?? '').slice(0, 8192).split(',').flatMap((entry, index) => {
    const match = /^\s*(\*|[a-z]{1,8}(?:-[a-z0-9]{1,8})*)\s*(?:;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(entry);
    return match ? [{ range: match[1].toLowerCase(), quality: match[2] === undefined ? 1 : Number(match[2]), index }] : [];
  });
  const specified = new Set(ranges.filter(item => item.range !== '*').map(item => item.range.split('-')[0]));
  const excluded = new Set(ranges.filter(item => item.quality === 0).map(item => item.range));
  for (const item of ranges.filter(item => item.quality > 0).sort((a,b) => b.quality-a.quality || a.index-b.index)) {
    if (item.range === '*') {
      const available = locales.find(locale => !specified.has(locale));
      if (available) return available;
    } else {
      const base = item.range.split('-')[0];
      if (isLocale(base) && !excluded.has(item.range) && (item.range !== base || !excluded.has(base))) return base;
    }
  }
  return defaultLocale;
}

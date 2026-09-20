import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isLocale, localeCookie, localizedPath } from '@/i18n/config';
import { isLegacyPage, negotiateLocale } from '@/i18n/routing';
import { middleware } from '@/middleware';
import { localeAlternates } from '@/i18n/metadata';

describe('locale page routing', () => {
  it('replaces only supported locale segments and preserves query and fragment', () => {
    expect(localizedPath('ja', '/ko/benchmarks/example?model=a%2Fb&sort=new#measurements')).toBe('/ja/benchmarks/example?model=a%2Fb&sort=new#measurements');
    expect(localizedPath('ko', '/?q=1#main')).toBe('/ko?q=1#main');
    expect(localizedPath('zh', '/en')).toBe('/zh');
    expect(localizedPath('ko', '/en/benchmarks?q=a\\b#c\\d')).toBe('/ko/benchmarks?q=a\\b#c\\d');
    expect(localizedPath('en', '/benchmarks')).toBe('/en/benchmarks');
    expect(isLocale('en-US')).toBe(false);
    expect(isLocale('constructor')).toBe(false);
  });
  it.each(['https://example.invalid/', '//example.invalid/', '/\\example.invalid/'])('rejects non-local destination %s', path => {
    expect(() => localizedPath('en', path)).toThrow('same-origin');
  });
  it.each(['/v1/readiness', '/v1/benchmark-runs', '/api/test', '/_next/static/file.js', '/favicon.png', '/brand/aio-monogram.png', '/sitemap.xml', '/en', '/ko/benchmarks', '/fr/benchmarks', '/unknown', '/benchmarks/example/unknown', '/manage/unknown'])('does not negotiate %s', path => {
    expect(isLegacyPage(path)).toBe(false);
    const response = middleware(new NextRequest('https://example.invalid' + path, { headers: { 'accept-language': 'ko' } }));
    expect(response.headers.has('location')).toBe(false);
  });
  it.each(['/', '/benchmarks', '/benchmarks/example', '/manage', '/verify/example', '/benchmarks/'])('negotiates recognized legacy page %s', path => {
    expect(isLegacyPage(path)).toBe(true);
  });
  it('uses cookie before weighted browser preferences without caching redirects', () => {
    const response = middleware(new NextRequest('https://example.invalid/benchmarks?method=pp&model=a%2Fb', { headers: { cookie: localeCookie + '=ja', 'accept-language': 'ko' } }));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://example.invalid/ja/benchmarks?method=pp&model=a%2Fb');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Accept-Language, Cookie');
  });
  it('keeps explicit locale above cookie and browser settings', () => {
    const response = middleware(new NextRequest('https://example.invalid/en/benchmarks', { headers: { cookie: localeCookie + '=ja', 'accept-language': 'ko' } }));
    expect(response.headers.has('location')).toBe(false);
  });
  it('does not redirect mutation requests', () => {
    expect(middleware(new NextRequest('https://example.invalid/manage', { method: 'POST' })).headers.has('location')).toBe(false);
  });
  it('provides a canonical and every localized alternate for the current page', () => {
    expect(localeAlternates('ko', '/benchmarks/example')).toEqual({ canonical: '/ko/benchmarks/example', languages: { en: '/en/benchmarks/example', ko: '/ko/benchmarks/example', ja: '/ja/benchmarks/example', zh: '/zh/benchmarks/example', 'x-default': '/en/benchmarks/example' } });
  });
});
describe('browser negotiation', () => {
  it.each([
    [undefined, null, 'en'], ['invalid', 'ja-JP,ko;q=0.9', 'ja'],
    [undefined, 'fr-FR, ko-KR;q=0.9, en;q=0.5', 'ko'],
    [undefined, 'en;q=0.1,zh-CN;q=0.8,ja;q=0.7', 'zh'],
    [undefined, 'ko;q=0,ja;q=0.5', 'ja'], [undefined, 'JA-jp; q=0.9, en;q=0.8', 'ja'],
    [undefined, 'ja;q=bogus,ko;q=1.5,zh;q=0.5', 'zh'],
    [undefined, 'de,fr', 'en'], [undefined, 'ko;q=0,*;q=0.1', 'en'],
    [undefined, '*;q=0.9,en;q=0.1', 'ko'], [undefined, '*;q=0.9,en;q=0,ko;q=0,ja;q=0', 'zh'],
    ['zh', 'ko', 'zh'], [undefined, 'ko;q=0.8,ja;q=0.8', 'ko'],
  ])('cookie %s and languages %s select %s', (cookie, header, expected) => {
    expect(negotiateLocale(cookie, header)).toBe(expected);
  });
});

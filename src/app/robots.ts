import type { MetadataRoute } from 'next';
import { getServiceOrigin } from '@/lib/env';
import { locales, localizedPath } from '@/i18n/config';
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: [
      '/v1/', '/manage', '/verify/',
      ...locales.flatMap(locale => [localizedPath(locale, '/manage'), localizedPath(locale, '/verify/')]),
    ] },
    sitemap: new URL('/sitemap.xml', getServiceOrigin()).href,
  };
}

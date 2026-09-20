import { NextResponse, type NextRequest } from 'next/server';
import { localeCookie, localizedPath } from '@/i18n/config';
import { isLegacyPage, negotiateLocale } from '@/i18n/routing';
export function middleware(request: NextRequest) {
  if (!['GET', 'HEAD'].includes(request.method) || !isLegacyPage(request.nextUrl.pathname)) return NextResponse.next();
  const locale = negotiateLocale(request.cookies.get(localeCookie)?.value, request.headers.get('accept-language'));
  const destination = request.nextUrl.clone();
  destination.pathname = localizedPath(locale, destination.pathname);
  const response = NextResponse.redirect(destination, 307);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Accept-Language, Cookie');
  return response;
}
// Explicit locale pages and every API/asset path bypass negotiation entirely.
export const config = { matcher: ['/', '/benchmarks/:path*', '/manage', '/verify/:path*'] };

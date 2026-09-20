"use client";
import Link from 'next/link';
import { useI18n } from '@/i18n/client';
import { localizedPath } from '@/i18n/config';
export default function NotFound() {
  const { locale, t } = useI18n();
  return <><title>{t('site.notFound') + ' · AioLM'}</title><section className="site-shell page"><div className="card not-found-card"><h1>{t('site.notFound')}</h1><p>{t('site.notFoundDetail')}</p><div className="not-found-actions"><Link className="button button-primary" href={localizedPath(locale, '/')}>{t('site.returnHome')}</Link><Link className="button button-outline" href={localizedPath(locale, '/benchmarks')}>{t('site.benchmarks')}</Link></div></div></section></>;
}

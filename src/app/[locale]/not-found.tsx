"use client";
import Link from 'next/link';
import { useI18n } from '@/i18n/client';
import { localizedPath } from '@/i18n/config';
export default function NotFound() {
  const { locale, t } = useI18n();
  return <><title>{t('site.notFound') + ' · AioLM'}</title><section className="site-shell"><h1>{t('site.notFound')}</h1><p>{t('site.notFoundDetail')}</p><Link href={localizedPath(locale, '/')}>{t('site.returnHome')}</Link></section></>;
}

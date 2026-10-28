import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/i18n/config';
import { publicMetadata } from '@/lib/seo';
import { getGuides } from '@/content/guides';
import { guideSlugs } from '@/content/guides/types';
import { GuideLayout } from '@/components/guide-layout';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getGuides(locale);
  return publicMetadata(locale, '/guides', `${content.title} · AioLM`, content.description);
}
export default async function Guides({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getGuides(locale);
  return <GuideLayout locale={locale} content={content}>
    <header className="guide-header"><h1>{content.title}</h1><p>{content.description}</p></header>
    <ol className="guide-list">
      {guideSlugs.map((slug, index) => <li key={slug}><Link href={localizedPath(locale, `/guides/${slug}`)}>
        <span className="guide-list-number" aria-hidden="true">0{index + 1}</span>
        <div><h2>{content.guides[slug].title}</h2><p>{content.guides[slug].description}</p></div>
        <span aria-hidden="true">↗</span>
      </Link></li>)}
    </ol>
  </GuideLayout>;
}

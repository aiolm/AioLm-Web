import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/i18n/config';
import { publicMetadata } from '@/lib/seo';
import { getGuides } from '@/content/guides';
import { guideSlugs } from '@/content/guides/types';
import { GuideTableOfContents } from '@/components/guide-table-of-contents';
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
    <article className="guide-article">
    <header className="guide-header"><h1>{content.title}</h1><p>{content.description}</p></header>
    <GuideTableOfContents label={content.onPage} sections={guideSlugs.map(slug => ({ id: `guide-${slug}`, title: content.guides[slug].title }))} />
    <div className="guide-body"><ol className="guide-list">
      {guideSlugs.map((slug, index) => <li key={slug} id={`guide-${slug}`}><Link href={localizedPath(locale, `/guides/${slug}`)}>
        <span className="guide-list-number" aria-hidden="true">0{index + 1}</span>
        <div><h2 id={`title-guide-${slug}`} tabIndex={-1}>{content.guides[slug].title}</h2><p>{content.guides[slug].description}</p></div>
        <span aria-hidden="true">↗</span>
      </Link></li>)}
    </ol></div>
    </article>
  </GuideLayout>;
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/i18n/config';
import { publicMetadata } from '@/lib/seo';
import { getGuides } from '@/content/guides';
import { guideSlugs, type GuideSlug } from '@/content/guides/types';
import { GuideLayout, GuideScreenshot } from '@/components/guide-layout';
import { GITHUB_REPOSITORY_URL } from '@/components/site-links';

type Params = Promise<{ locale: string; slug: string }>;
function isGuide(slug: string): slug is GuideSlug { return guideSlugs.some(value => value === slug); }
export function generateStaticParams() { return guideSlugs.map(slug => ({ slug })); }
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !isGuide(slug)) notFound();
  const guide = (await getGuides(locale)).guides[slug];
  return publicMetadata(locale, `/guides/${slug}`, `${guide.title} · AioLM`, guide.description);
}
export default async function GuidePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!isLocale(locale) || !isGuide(slug)) notFound();
  const content = await getGuides(locale);
  const guide = content.guides[slug];
  return <GuideLayout locale={locale} content={content} active={slug}>
    <article>
      <header className="guide-header">
        <h1>{guide.title}</h1><p>{guide.description}</p>
        {slug === 'install' && <a className="guide-download" href={`${GITHUB_REPOSITORY_URL}/releases/latest`}>{content.download} ↗</a>}
      </header>
      <nav className="guide-toc" aria-label={content.onPage}>
        {guide.sections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
      </nav>
      {guide.sections.map(section => <section className="guide-section" key={section.id} id={section.id} aria-labelledby={`title-${section.id}`}>
        <h2 id={`title-${section.id}`}>{section.title}</h2>
        {section.body?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        {section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}
        {section.table && <div className="guide-table-wrap"><table className="guide-table" aria-label={section.title}>
          <thead><tr>{section.table.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
          <tbody>{section.table.rows.map(row => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table></div>}
        {section.code && <pre tabIndex={0}><code>{section.code}</code></pre>}
        {section.note && <p className="guide-note">{section.note}</p>}
        {section.screenshot && <GuideScreenshot content={content} />}
      </section>)}
      <footer className="guide-related"><h2>{content.related}</h2><div className="guide-related-links">
        {guideSlugs.filter(value => value !== slug).map(value => <Link key={value} href={localizedPath(locale, `/guides/${value}`)}>{content.guides[value].title} →</Link>)}
      </div></footer>
    </article>
  </GuideLayout>;
}

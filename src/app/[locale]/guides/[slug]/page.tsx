import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/i18n/config';
import { publicMetadata } from '@/lib/seo';
import { getGuides } from '@/content/guides';
import { getMessages } from '@/i18n/server';
import { guideSlugs, type GuideSlug } from '@/content/guides/types';
import { GuideLayout, GuideScreenshot } from '@/components/guide-layout';
import { GuideTableOfContents } from '@/components/guide-table-of-contents';
import { InstallSection, InstallSecurityWarning } from '@/components/install-section';
import { GITHUB_REPOSITORY_URL } from '@/components/site-links';
import { DESKTOP_RELEASE_VERSION } from '@/lib/desktop-release';

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
  const [content, installMessages] = await Promise.all([
    getGuides(locale),
    slug === 'install' ? getMessages(locale, 'home') : Promise.resolve(null),
  ]);
  const guide = content.guides[slug];
  const hasScreenshots = guide.sections.some(section => section.image || section.more?.some(detail => detail.image));
  return <GuideLayout locale={locale} content={content} active={slug}>
    <article className="guide-article">
      <header className="guide-header">
        <h1>{guide.title}</h1><p>{guide.description}</p>
      </header>
      <GuideTableOfContents label={content.onPage} sections={guide.sections.map(({ id, title }) => ({ id, title }))} />
      <div className="guide-body">
      {hasScreenshots && <p className="guide-screen-notice">{content.screenshotNotice}</p>}
      {guide.sections.map(section => <section className="guide-section" key={section.id} id={section.id} aria-labelledby={`title-${section.id}`}>
        <h2 id={`title-${section.id}`} tabIndex={-1}>{section.title}</h2>
        {slug === 'install' && ['windows', 'macos'].includes(section.id) && section.note && <InstallSecurityWarning locale={locale}>{section.note}</InstallSecurityWarning>}
        {section.downloads && <div className="guide-download-choices">{downloadFiles[section.downloads].map(({ file, label }) => <a key={file} href={`${GITHUB_REPOSITORY_URL}/releases/download/v${DESKTOP_RELEASE_VERSION}/${file}`}><span>{label} ↓</span><small>{file}</small></a>)}</div>}
        {section.body?.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        {slug === 'install' && section.id === 'commands' && installMessages && <InstallSection locale={locale} messages={installMessages} />}
        {section.links?.map(link => <p key={link.href}><Link href={link.href}>{link.label} →</Link></p>)}
        {section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}
        {section.table && <div className="guide-table-wrap"><table className="guide-table" aria-label={section.title}>
          <thead><tr>{section.table.headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
          <tbody>{section.table.rows.map(row => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table></div>}
        {section.code && <pre tabIndex={0}><code>{section.code}</code></pre>}
        {section.note && !(slug === 'install' && ['windows', 'macos'].includes(section.id)) && <p className="guide-note">{section.note}</p>}
        {section.image && <GuideScreenshot locale={locale} id={section.image} caption={section.caption ?? section.title} content={content} />}
        {section.more?.map(detail => <details className="guide-more" key={detail.title}><summary>{detail.title}</summary>
          {detail.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {detail.steps && <ol>{detail.steps.map(step => <li key={step}>{step}</li>)}</ol>}
          {detail.code && <pre tabIndex={0}><code>{detail.code}</code></pre>}
          {detail.image && <GuideScreenshot locale={locale} id={detail.image} caption={detail.caption ?? detail.title} content={content} />}
          {detail.report && <a href={detail.report.href}>{detail.report.label} ↗</a>}
          {detail.links?.map(link => <p key={link.href}><a href={link.href}>{link.label} ↗</a></p>)}
          {section.id === 'verify' && <a href={`${GITHUB_REPOSITORY_URL}/releases/download/v${DESKTOP_RELEASE_VERSION}/checksums.txt`}>checksums.txt ↓</a>}
        </details>)}
      </section>)}
      {slug === 'install' && <a className="guide-download" href={`${GITHUB_REPOSITORY_URL}/releases/latest`}>{content.download} ↗</a>}
      <footer className="guide-related"><h2>{content.related}</h2><div className="guide-related-links">
        {guideSlugs.filter(value => value !== slug).map(value => <Link key={value} href={localizedPath(locale, `/guides/${value}`)}>{content.guides[value].title} →</Link>)}
      </div></footer>
      </div>
    </article>
  </GuideLayout>;
}

const downloadFiles = {
  windows: [{ label: 'Windows x64', file: `AioLM_${DESKTOP_RELEASE_VERSION}_x64-setup.exe` }],
  macos: [{ label: 'Mac · Apple Silicon (M1, M2, …)', file: `AioLM_${DESKTOP_RELEASE_VERSION}_aarch64.dmg` }, { label: 'Mac · Intel', file: `AioLM_${DESKTOP_RELEASE_VERSION}_x64.dmg` }],
  linux: [{ label: 'Linux · DEB', file: `AioLM_${DESKTOP_RELEASE_VERSION}_amd64.deb` }, { label: 'Linux · AppImage', file: `AioLM_${DESKTOP_RELEASE_VERSION}_amd64.AppImage` }],
} as const;

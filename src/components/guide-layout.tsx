import Link from 'next/link';
import { localizedPath, type Locale } from '@/i18n/config';
import { guideSlugs, type GuideContent, type GuideImageId, type GuideSlug } from '@/content/guides/types';
import { GuideImageViewer } from './guide-image-viewer';
import screenshots from '../../public/screenshots/guides/v0.3.2/manifest.json';
import './guides.css';

export function GuideLayout({ locale, content, active, children }: {
  locale: Locale; content: GuideContent; active?: GuideSlug; children: React.ReactNode;
}) {
  return <div className={`site-shell guide-layout${active ? ' guide-layout--article' : ''}`}>
    <nav className="guide-sidebar" aria-label={content.navigation}>
      <Link className="guide-nav-home" href={localizedPath(locale, '/guides')} aria-current={!active ? 'page' : undefined}>{content.navigation}</Link>
      {guideSlugs.map(slug => <Link key={slug} href={localizedPath(locale, `/guides/${slug}`)} aria-current={active === slug ? 'page' : undefined}>{content.guides[slug].title}</Link>)}
    </nav>
    <div className="guide-content">{children}</div>
  </div>;
}

export function GuideScreenshot({ locale, id, caption, content }: { locale: Locale; id: GuideImageId; caption: string; content: GuideContent }) {
  const capture = screenshots.captures.find(item => item.locale === locale && item.id === id);
  if (!capture) throw new Error(`Missing guide screenshot: ${locale}/${id}`);
  return <GuideImageViewer src={`/screenshots/guides/v0.3.2/${capture.file}?v=${capture.sha256}`} caption={caption} enlarge={content.enlarge} close={content.close} panHint={content.panHint}
    width={capture.width} height={capture.height} focus={capture.focus} />;
}

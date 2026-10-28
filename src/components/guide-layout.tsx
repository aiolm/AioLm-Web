import Link from 'next/link';
import Image from 'next/image';
import { localizedPath, type Locale } from '@/i18n/config';
import { guideSlugs, type GuideContent, type GuideSlug } from '@/content/guides/types';
import lightCapture from '../../public/screenshots/product-models-en-light.png';
import darkCapture from '../../public/screenshots/product-models-en-dark.png';
import { getImageProps } from 'next/image';
import './guides.css';

export function GuideLayout({ locale, content, active, children }: {
  locale: Locale; content: GuideContent; active?: GuideSlug; children: React.ReactNode;
}) {
  return <div className="site-shell guide-layout">
    <nav className="guide-sidebar" aria-label={content.navigation}>
      <Link className="guide-nav-home" href={localizedPath(locale, '/guides')} aria-current={!active ? 'page' : undefined}>{content.navigation}</Link>
      {guideSlugs.map(slug => <Link key={slug} href={localizedPath(locale, `/guides/${slug}`)} aria-current={active === slug ? 'page' : undefined}>{content.guides[slug].title}</Link>)}
    </nav>
    <div className="guide-content">{children}</div>
  </div>;
}

export function GuideScreenshot({ content }: { content: GuideContent }) {
  const { props: { srcSet: dark } } = getImageProps({ src: darkCapture, width: 1440, height: 900, alt: content.screenshotAlt, sizes: '(max-width: 60rem) 100vw, 56rem' });
  return <figure className="guide-screenshot">
    <a href="/screenshots/product-models-en-light.png" aria-label={content.screenshotAlt}>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={dark} />
        <Image src={lightCapture} width={1440} height={900} alt={content.screenshotAlt} sizes="(max-width: 60rem) 100vw, 56rem" />
      </picture>
    </a>
    <figcaption>{content.screenshotCaption}</figcaption>
  </figure>;
}

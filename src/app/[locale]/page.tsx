import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/i18n/config';
import { publicMetadata } from '@/lib/seo';
import { getServiceOrigin } from '@/lib/env';
import { JsonLd } from '@/components/json-ld';
import { getMessages } from '@/i18n/server';
import { createTranslator } from '@/i18n/translate';
import Link from "next/link";
import { GITHUB_REPOSITORY_URL, GitHubMark } from "@/components/site-links";
import { ProductScreenshot } from "@/components/product-screenshot";
import { InstallCommand } from "@/components/install-command";
import "@/components/home-redesign.css";

/**
 * Product introduction. A fully static server component: no data is fetched and
 * nothing here is interactive beyond native links, so the page ships no client
 * JavaScript of its own.
 *
 * Installation instructions for Windows, macOS and Linux.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = createTranslator(await getMessages(locale, 'site'));
  return publicMetadata(locale, '/', t('site.title'), t('site.description'));
}

/**
 * What the product name stands for. It is the same in every language, so it is
 * a constant rather than a translated string, and it is published as the
 * schema.org alternateName so an answer engine can tie the two names together.
 */
const PRODUCT_NAME_EXPANDED = 'All-in-One LM';

const STEPS = [
  {
    title: "home.choose",
    detail: "home.chooseDetail",
  },
  {
    title: "home.run",
    detail: "home.runDetail",
  },
  {
    title: "home.measure",
    detail: "home.measureDetail",
  },
] as const;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [home, site] = await Promise.all([getMessages(locale, 'home'), getMessages(locale, 'site')]);
  const t = createTranslator({ ...site, ...home });
  const url = new URL(localizedPath(locale, '/'), getServiceOrigin()).href;
  const faq = ['What', 'Os', 'Benchmark', 'Account'].map(key => ({ question: t(`home.faq${key}Question`), answer: t(`home.faq${key}Answer`) }));
  return (
    <>
      <JsonLd data={{ '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebSite', '@id': `${getServiceOrigin()}/#website`, name: 'AioLM', alternateName: PRODUCT_NAME_EXPANDED, url: getServiceOrigin(), inLanguage: ['en', 'ko', 'ja', 'zh'] },
        { '@type': 'SoftwareApplication', '@id': `${getServiceOrigin()}/#application`, name: 'AioLM', alternateName: PRODUCT_NAME_EXPANDED, url, description: t('home.faqWhatAnswer'), applicationCategory: 'DeveloperApplication', operatingSystem: ['Windows', 'macOS', 'Linux'], sameAs: GITHUB_REPOSITORY_URL },
        { '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: locale, mainEntity: faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
      ] }} />
      <section className="home-hero" aria-labelledby="hero-title">
        <div className="site-shell home-hero-inner">
          <div className="home-hero-copy">
            <h1 className="home-hero-title" id="hero-title">
              <span>{t('home.heroFirst')}</span>
              {' '}
              <span>{t('home.heroSecond')}</span>
            </h1>
            <p className="home-hero-subtitle">
              {t('home.subtitle')}
            </p>

            <div className="home-hero-actions">
              <a className="button button-primary" href={GITHUB_REPOSITORY_URL}>
                <GitHubMark />
                <span>{t('site.github')}</span>
              </a>
              <Link className="home-text-link" href={localizedPath(locale, '/benchmarks')}>
                <span>{t('home.explore')}</span>
                <ArrowIcon />
              </Link>
            </div>

            <div className="home-install">
              <p className="home-install-label" aria-hidden="true">{t('home.installCommandTitle')}</p>
              <InstallCommand
                macosGuideUrl={`${GITHUB_REPOSITORY_URL}/blob/main/docs/guides/install${locale === 'en' ? '' : `.${locale}`}.md#macos`}
                linuxGuideUrl={`${GITHUB_REPOSITORY_URL}/blob/main/docs/guides/install${locale === 'en' ? '' : `.${locale}`}.md#linux`}
                messages={{
                  windows: t('home.windows'),
                  macos: t('home.macos'),
                  linux: t('home.linux'),
                  title: t('home.installCommandTitle'),
                  copy: t('home.copyCommand'),
                  copied: t('home.copied'),
                  copyFailed: t('home.copyFailed'),
                  download: t('home.download'),
                  macosRequirements: t('home.macosRequirements'),
                  macosInstructions: t('home.macosInstructions'),
                  macosGuide: t('home.macosGuide'),
                  linuxRequirements: t('home.linuxRequirements'),
                  linuxInstructions: t('home.linuxInstructions'),
                  linuxGuide: t('home.linuxGuide'),
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="site-shell home-showcase">
        <ProductScreenshot t={t} />
      </div>

      <section className="site-shell home-section home-workflow" aria-labelledby="workflow-title">
        <header className="home-section-head">
          <h2 className="home-section-title" id="workflow-title">{t('home.workflow')}</h2>
          <p className="home-section-detail">{t('home.workflowDetail')}</p>
        </header>

        <ol className="home-steps">
          {STEPS.map((step, index) => (
            <li className="home-step" key={step.title}>
              {/* The list already conveys order; the visible number is decorative. */}
              <span className="home-step-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div className="home-step-copy">
                <h3 className="home-step-title">{t(step.title)}</h3>
                <p className="home-step-detail">{t(step.detail)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-shell home-section home-faq" aria-labelledby="faq-title" id="faq">
        <h2 className="home-section-title" id="faq-title">{t('home.faqTitle')}</h2>
        <div className="home-faq-list">
          {faq.map(item => (
            <details className="home-faq-item" key={item.question}>
              <summary>
                <span className="home-faq-question">{item.question}</span>
                <ChevronIcon />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="site-shell home-section home-closing" aria-labelledby="closing-title">
        <div className="home-closing-copy">
          <h2 className="home-closing-title" id="closing-title">{t('home.closing')}</h2>
          <p className="home-closing-detail">{t('home.closingDetail')}</p>
        </div>
        <Link className="home-secondary-button" href={localizedPath(locale, '/benchmarks')}>
          <span>{t('home.browse')}</span>
          <ArrowIcon />
        </Link>
      </section>
    </>
  );
}

/* Icons: inline so the landing page needs no extra requests and no icon dependency. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ArrowIcon(): React.JSX.Element {
  return (
    <svg className="arrow-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path {...stroke} d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg className="home-faq-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path {...stroke} d="m6 9 6 6 6-6" />
    </svg>
  );
}

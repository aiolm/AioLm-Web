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
import { InstallSection } from "@/components/install-section";
import { DESKTOP_RELEASE_VERSION } from "@/lib/desktop-release";
import "@/components/home-redesign.css";

/**
 * Server-rendered product introduction. InstallSection owns platform tabs and
 * clipboard actions; download links and FAQ disclosures keep native semantics.
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
  const faq = ['What', 'Os', 'Engines', 'Api', 'Updates', 'Benchmark', 'Account'].map(key => ({ question: t(`home.faq${key}Question`), answer: t(`home.faq${key}Answer`) }));
  return (
    <>
      <JsonLd data={{ '@context': 'https://schema.org', '@graph': [
        { '@type': 'WebSite', '@id': `${getServiceOrigin()}/#website`, name: 'AioLM', alternateName: PRODUCT_NAME_EXPANDED, url: getServiceOrigin(), inLanguage: ['en', 'ko', 'ja', 'zh'] },
        { '@type': 'SoftwareApplication', '@id': `${getServiceOrigin()}/#application`, name: 'AioLM', alternateName: PRODUCT_NAME_EXPANDED, url, description: t('home.faqWhatAnswer'), applicationCategory: 'DeveloperApplication', operatingSystem: ['Windows', 'macOS', 'Linux'], sameAs: GITHUB_REPOSITORY_URL },
        { '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: locale, mainEntity: faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
      ] }} />
      <section className="home-hero" aria-labelledby="hero-title">
        <div className="site-shell home-hero-inner">
          <div className="home-hero-intro">
            <h1 className="home-hero-title" id="hero-title">
              <span>{t('home.heroFirst')}</span>
              {' '}
              <span>{t('home.heroSecond')}</span>
            </h1>
            <p className="home-hero-subtitle">
              {t('home.subtitle')}
            </p>
            <div className="home-actions">
              <Link className="button button-primary" href={localizedPath(locale, '/guides/install')}>
                {t('home.download')}
              </Link>
              <a className="button button-outline" href={GITHUB_REPOSITORY_URL}>
                <GitHubMark />
                <span>{t('site.github')}</span>
              </a>
              <Link className="home-text-link" href={localizedPath(locale, '/benchmarks')}>
                <span>{t('home.explore')}</span>
                <ArrowIcon />
              </Link>
            </div>
          </div>

          <div className="home-install">
            <p className="home-install-label" aria-hidden="true">{t('home.installCommandTitle')}</p>
            <InstallSection locale={locale} messages={home} />
            <p className="home-source-notice">{t('home.sourceNotice', { version: DESKTOP_RELEASE_VERSION })}</p>
          </div>
        </div>
      </section>

      <div className="site-shell home-showcase">
        <ProductScreenshot locale={locale} t={t} />
      </div>

      <section className="site-shell home-section" aria-labelledby="engines-title">
        <header className="home-section-head">
          <h2 className="home-section-title" id="engines-title">{t('home.enginesTitle')}</h2>
        </header>
        <div className="home-section-body">
          <p className="home-section-detail">{t('home.enginesBuiltin')}</p>
          <p className="home-section-detail">{t('home.enginesExternal')}</p>
          <p className="home-section-detail">{t('home.enginesHelp')}</p>
          <div className="home-actions">
            <Link className="home-text-link" href={localizedPath(locale, '/guides/compatibility')}>{t('home.enginesGuide')}<ArrowIcon /></Link>
            <Link className="home-text-link" href={localizedPath(locale, '/guides/adapters')}>{t('home.adaptersGuide')}<ArrowIcon /></Link>
          </div>
        </div>
      </section>

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
        <header className="home-section-head">
          <h2 className="home-section-title" id="faq-title">{t('home.faqTitle')}</h2>
        </header>
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
        <Link className="button button-outline" href={localizedPath(locale, '/benchmarks')}>
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

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
import { WorkspaceIllustration } from "@/components/workspace-illustration";
import { InstallCommand } from "@/components/install-command";

/**
 * Product introduction. A fully static server component: no data is fetched and
 * nothing here is interactive beyond native links, so the page ships no client
 * JavaScript of its own.
 *
 * Direct installation command for Windows and planned support for macOS and Linux.
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
    icon: <CubeIcon />,
    tone: "step-icon-blue",
  },
  {
    title: "home.run",
    detail: "home.runDetail",
    icon: <GearIcon />,
    tone: "step-icon-cyan",
  },
  {
    title: "home.measure",
    detail: "home.measureDetail",
    icon: <ChartIcon />,
    tone: "step-icon-violet",
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
        { '@type': 'SoftwareApplication', '@id': `${getServiceOrigin()}/#application`, name: 'AioLM', alternateName: PRODUCT_NAME_EXPANDED, url, description: t('home.faqWhatAnswer'), applicationCategory: 'DeveloperApplication', operatingSystem: 'Windows', sameAs: GITHUB_REPOSITORY_URL },
        { '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: locale, mainEntity: faq.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) },
      ] }} />
      <section className="hero" aria-labelledby="hero-title">
        <div className="site-shell hero-inner">
          <div className="hero-copy">
            <h1 className="hero-title" id="hero-title">
              {t('home.heroFirst')}
              <br className="hero-title-break" />
              {' '}
              {t('home.heroSecond')}
            </h1>
            <p className="hero-subtitle">
              {t('home.subtitle')}
            </p>

            <div className="hero-actions">
              <a className="button button-primary" href={GITHUB_REPOSITORY_URL}>
                <GitHubMark />
                <span>{t('site.github')}</span>
              </a>
              <Link className="button button-outline" href={localizedPath(locale, '/benchmarks')}>
                <span>{t('home.explore')}</span>
                <ArrowIcon />
              </Link>
            </div>

            <InstallCommand
              messages={{
                windows: t('home.windows'),
                macos: t('home.macos'),
                linux: t('home.linux'),
                title: t('home.installCommandTitle'),
                copy: t('home.copyCommand'),
                copied: t('home.copied'),
                macosPlanned: t('home.macosPlanned'),
                linuxPlanned: t('home.linuxPlanned'),
              }}
            />
          </div>

          <div className="hero-figure">
            <WorkspaceIllustration t={t} />
          </div>
        </div>
      </section>

      <section className="workflow" aria-labelledby="workflow-title">
        <div className="site-shell">
          <h2 className="section-title" id="workflow-title">{t('home.workflow')}</h2>
          <p className="section-subtitle">{t('home.workflowDetail')}</p>

          <ol className="steps">
            {STEPS.map((step, index) => (
              <li className="step" key={step.title}>
                <span className={`step-icon ${step.tone}`} aria-hidden="true">{step.icon}</span>
                <div className="step-copy">
                  <h3 className="step-title">
                    {/* The list already conveys order; the visible number is decorative. */}
                    <span className="step-number" aria-hidden="true">{index + 1}.</span> {t(step.title)}
                  </h3>
                  <p className="step-detail">{t(step.detail)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="product-faq site-shell" aria-labelledby="faq-title" id="faq">
        <h2 className="section-title" id="faq-title">{t('home.faqTitle')}</h2>
        {faq.map(item => <article key={item.question}><h3>{item.question}</h3><p>{item.answer}</p></article>)}
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <div className="site-shell">
          <div className="closing-band">
            <span className="closing-icon" aria-hidden="true"><DocumentIcon /></span>
            <div className="closing-copy">
              <h2 className="closing-title" id="closing-title">{t('home.closing')}</h2>
              <p className="closing-detail">
                {t('home.closingDetail')}
              </p>
            </div>
            <Link className="closing-link" href={localizedPath(locale, '/benchmarks')}>
              <span>{t('home.browse')}</span>
              <ArrowIcon />
            </Link>
          </div>
        </div>
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

function CubeIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
      <path {...stroke} d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path {...stroke} d="m4 7.5 8 4.5 8-4.5M12 12v9" />
    </svg>
  );
}

function GearIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
      <circle {...stroke} cx="12" cy="12" r="3.2" />
      <path
        {...stroke}
        d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5"
      />
    </svg>
  );
}

function ChartIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
      <path {...stroke} d="M4 20h16" />
      <path {...stroke} d="M7 20v-6M12 20V6M17 20v-9" />
    </svg>
  );
}

function DocumentIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path {...stroke} d="M14 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V7.6L14 3Z" />
      <path {...stroke} d="M13.8 3.2v4.4h4.4M8.8 12.5h6.4M8.8 16h4.4" />
    </svg>
  );
}


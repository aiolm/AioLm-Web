import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale, localizedPath } from '@/i18n/config';
import { localeAlternates } from '@/i18n/metadata';
import { getMessages } from '@/i18n/server';
import { createTranslator } from '@/i18n/translate';
import Link from "next/link";
import { GITHUB_REPOSITORY_URL, GitHubMark } from "@/components/site-links";
import { WorkspaceIllustration } from "@/components/workspace-illustration";

/**
 * Product introduction. A fully static server component: no data is fetched and
 * nothing here is interactive beyond native links, so the page ships no client
 * JavaScript of its own.
 *
 * There is intentionally no download or release link anywhere on this page.
 */

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { alternates: localeAlternates(locale, '/') };
}

const PLATFORMS = [
  { label: "home.windows", icon: <WindowsIcon /> },
  { label: "home.macos", icon: <AppleIcon /> },
  { label: "home.linux", icon: <LinuxIcon /> },
] as const;

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
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="site-shell hero-inner">
          <div className="hero-copy">
            <h1 className="hero-title" id="hero-title">
              {t('home.heroFirst')}
              <br />
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

            <ul className="hero-platforms">
              {PLATFORMS.map((platform) => (
                <li className="hero-platform" key={platform.label}>
                  <span className="hero-platform-icon" aria-hidden="true">{platform.icon}</span>
                  {t(platform.label)}
                </li>
              ))}
            </ul>
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

function WindowsIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M0 2.4 6.5 1.5v6H0v-5.1Zm7.4-1L16 0v7.5H7.4v-6.1ZM0 8.5h6.5v6L0 13.6V8.5Zm7.4 0H16V16l-8.6-1.2V8.5Z" />
    </svg>
  );
}

function AppleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M11.2 8.5c0-1.5 1.2-2.3 1.3-2.3-.7-1-1.8-1.2-2.2-1.2-1-.1-1.9.6-2.4.6s-1.2-.6-2-.6c-1 0-2 .6-2.5 1.5-1.1 1.9-.3 4.6.8 6.1.5.7 1.1 1.5 1.9 1.5s1-.5 2-.5 1.2.5 2 .5 1.3-.7 1.8-1.4c.6-.8.8-1.6.8-1.6s-1.5-.6-1.5-2.6ZM9.7 3.9c.4-.5.7-1.2.6-1.9-.6 0-1.4.4-1.8.9-.4.5-.7 1.2-.6 1.9.7.1 1.4-.3 1.8-.9Z" />
    </svg>
  );
}

function LinuxIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path {...stroke} d="M9.5 4.2c0-1.2.9-2.2 2.5-2.2s2.5 1 2.5 2.2v2.6c0 1 .6 1.6 1.4 2.6 1 1.3 1.6 2.6 1.9 4.2.2 1.1.7 1.8 1.4 2.5.6.6.4 1.6-.5 1.8-1 .2-2 .5-2.6 1.1-.9.8-2.3 1.2-4.1 1.2s-3.2-.4-4.1-1.2c-.6-.6-1.6-.9-2.6-1.1-.9-.2-1.1-1.2-.5-1.8.7-.7 1.2-1.4 1.4-2.5.3-1.6.9-2.9 1.9-4.2.8-1 1.4-1.6 1.4-2.6V4.2Z" />
      <path {...stroke} d="M10.4 5.6h.01M13.6 5.6h.01M10.8 8.4c.7.5 1.7.5 2.4 0" />
    </svg>
  );
}
